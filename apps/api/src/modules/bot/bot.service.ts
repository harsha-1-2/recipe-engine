import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const prisma = new PrismaClient();

// Phrases that indicate the bot deflected an off-topic query
const DEFLECTION_MARKERS = [
  'recipe assistant',
  'only help with food',
  'food, recipes',
  'ask me about food',
  'please ask about food',
  'query about food',
];

function isOffTopicReply(reply: string): boolean {
  const lower = reply.toLowerCase();
  return DEFLECTION_MARKERS.some(m => lower.includes(m));
}

export async function handleBotChat(
  userMessage: string,
  prefs: {
    diet: string; budget: number; familySize: number; allergies: string[];
    preferredIngredients?: string[];
  },
  history?: { role: string; content: string }[]
) {
  const systemPrompt = `You are a friendly Indian recipe assistant for a grocery-to-cart app.but u can suggest other country  recipes also if users explicitly asks for it .
Your ONLY job is to help users with food, recipes, meal planning, Indian cooking, sweets, desserts, snacks, and related food topics.

User preferences (you MUST strictly respect all of these for every suggestion):
- Diet type: ${prefs.diet}${prefs.diet === 'VEG' ? ' (vegetarian — no meat, no eggs, no fish)' : prefs.diet === 'EGG' ? ' (eggetarian — no meat, no fish, eggs allowed)' : ' (non-vegetarian — all ingredients allowed)'}
- Weekly budget: ₹${prefs.budget} for ${prefs.familySize} people
- Allergies / ingredients to avoid: ${prefs.allergies.length > 0 ? prefs.allergies.join(', ') : 'None'}
- Preferred ingredients (prioritize recipes using these): ${prefs.preferredIngredients && prefs.preferredIngredients.length > 0 ? prefs.preferredIngredients.join(', ') : 'None specified'}

═══ STRICT RULES ═══

RULE 1 — FOOD ONLY:
If the user asks about anything that is NOT related to food, recipes, cooking, meal planning, or Indian cuisine, you MUST respond with ONLY this exact sentence and nothing else:
"I'm your Indian Recipe Assistant 🍛 — I can only help with food, recipes, and meal planning. Try asking: 'Suggest Diwali sweets', 'Quick dinner ideas', or 'High protein breakfast'!"
Then emit: <SUGGESTIONS>{"recipes":[]}</SUGGESTIONS>

RULE 2 — SUGGEST 10 RECIPES STRICTLY GROUNDED TO THE USER'S REQUEST:
For every food-related query, suggest exactly 10 Indian recipes from your knowledge of Indian cuisine.
ALL 10 suggestions MUST directly answer what the user is asking for — do NOT pad with unrelated categories.
Examples:
- User asks "Diwali sweets" → suggest 10 Indian sweets/mithai only (Gulab Jamun, Kaju Katli, Besan Ladoo…)
- User asks "high protein breakfast" → suggest 10 high-protein Indian breakfasts only
- User asks "quick dinner" → suggest 10 quick Indian dinner recipes only

Every suggestion MUST satisfy ALL of the following simultaneously:
1. Directly relevant to the user's query and conversational context.
2. Matches diet type: ${prefs.diet} — NEVER violate this. E.g. for VEG, no meat/eggs/fish.
3. Contains NONE of these allergens: ${prefs.allergies.length > 0 ? prefs.allergies.join(', ') : 'None'}.
4. Prioritizes user's preferred ingredients: ${prefs.preferredIngredients && prefs.preferredIngredients.length > 0 ? prefs.preferredIngredients.join(', ') : 'None'}.
5. Budget-appropriate for ${prefs.familySize} people within ₹${prefs.budget}/week.

Use well-known authentic Indian recipe names (e.g. "Gulab Jamun", "Palak Paneer", "Masala Dosa").

RULE 3 — FORMAT:
List suggestions clearly: **Recipe Name** — short description (1 line).
Be warm, use food emojis occasionally.

RULE 4 — SUGGESTIONS BLOCK (MANDATORY):
Always end your response with this exact block — even if the list is empty:
<SUGGESTIONS>{"recipes":[{"name":"Recipe Name 1"},{"name":"Recipe Name 2"},...up to 10]}</SUGGESTIONS>`;



  // Build message list with conversation history for multi-turn context
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history (last 6 messages max) for multi-turn context
  if (history && history.length > 0) {
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      const role = msg.role === 'user' ? 'user' as const : 'assistant' as const;
      messages.push({ role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userMessage });

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.7,
    max_tokens: 900,
  });

  const rawReply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

  // Extract suggestion block — case-insensitive regex
  const suggestMatch = rawReply.match(/<SUGGESTIONS>([\s\S]*?)<\/SUGGESTIONS>/i);
  let suggestions: any[] = [];
  let offTopic = false;

  if (suggestMatch) {
    try {
      const parsed = JSON.parse(suggestMatch[1]);
      const recipeEntries: { name: string }[] = (parsed.recipes || []);

      // Collect all candidate names (no [NEW] tagging anymore)
      const candidateNames: string[] = recipeEntries
        .map(e => e.name.replace(/\[NEW\]\s*/gi, '').trim())
        .filter(Boolean);

      console.log(`[Bot] Parsed ${candidateNames.length} suggestions: [${candidateNames.join(', ')}]`);

      // ── Tier 1: Exact case-insensitive match ──
      let matched: any[] = [];
      if (candidateNames.length > 0) {
        matched = await prisma.recipe.findMany({
          where: {
            OR: candidateNames.map(name => ({
              name: { equals: name.trim(), mode: 'insensitive' as const }
            }))
          },
          include: {
            cuisineRegion: true,
            dishType: true,
            ingredients: { include: { ingredient: true } }
          }
        });
        console.log(`[Bot] Tier 1 exact matches: ${matched.length}`);
      }

      // ── Tier 2: Stricter fuzzy fallback (require multiple keyword overlap) ──
      const exactMatchedNames = new Set(matched.map(m => m.name.toLowerCase()));
      const unmatchedNames = candidateNames.filter(n => !exactMatchedNames.has(n.toLowerCase().trim()));

      const stopWords = new Set([
        'healthy', 'quick', 'easy', 'style', 'recipe', 'indian', 'best',
        'simple', 'classic', 'homemade', 'delicious', 'spicy', 'with', 'and',
        'the', 'for', 'sweet', 'fresh'
      ]);

      for (const uname of unmatchedNames) {
        const words = uname.toLowerCase().split(/\s+/).filter(w => !stopWords.has(w) && w.length > 2);

        if (words.length >= 2) {
          // Require ALL significant keywords to match (stricter)
          const fuzzy = await prisma.recipe.findFirst({
            where: {
              AND: words.map(w => ({ name: { contains: w, mode: 'insensitive' as const } }))
            },
            include: {
              cuisineRegion: true,
              dishType: true,
              ingredients: { include: { ingredient: true } }
            }
          });
          if (fuzzy && !exactMatchedNames.has(fuzzy.name.toLowerCase())) {
            matched.push(fuzzy);
            exactMatchedNames.add(fuzzy.name.toLowerCase());
            console.log(`[Bot] Fuzzy matched "${uname}" → "${fuzzy.name}"`);
          } else {
            console.log(`[Bot] No fuzzy match for "${uname}" — skipping (no dynamic creation)`);
          }
        } else if (words.length === 1) {
          const fuzzy = await prisma.recipe.findFirst({
            where: { name: { contains: words[0], mode: 'insensitive' as const } },
            include: {
              cuisineRegion: true,
              dishType: true,
              ingredients: { include: { ingredient: true } }
            }
          });
          if (fuzzy && !exactMatchedNames.has(fuzzy.name.toLowerCase())) {
            matched.push(fuzzy);
            exactMatchedNames.add(fuzzy.name.toLowerCase());
            console.log(`[Bot] Single-keyword matched "${uname}" → "${fuzzy.name}"`);
          } else {
            console.log(`[Bot] No match for "${uname}" — skipping`);
          }
        } else {
          console.log(`[Bot] "${uname}" too short to fuzzy match — skipping`);
        }
      }

      // Return top 5 strictly matched recipes only — no random fill
      const topMatched = matched.slice(0, 5);

      console.log(`[Bot] Returning ${topMatched.length} strictly DB-matched suggestions (no random fill)`);

      suggestions = topMatched;

      // Check if this was an off-topic deflection (empty suggestions + deflection language)
      if (recipeEntries.length === 0 && isOffTopicReply(rawReply)) {
        offTopic = true;
        suggestions = [];
        console.log('[Bot] Off-topic query detected — returning deflection message');
      }

    } catch (err: any) {
      console.error('[Bot] ❌ Suggestion processing failed:', err?.message || err);
    }
  } else {
    console.warn('[Bot] ⚠️ No <SUGGESTIONS> block found in LLM reply. Checking for off-topic...');
    if (isOffTopicReply(rawReply)) {
      offTopic = true;
    }
  }

  // Clean reply (remove the JSON block from what the user sees) — case-insensitive
  const cleanReply = rawReply.replace(/<SUGGESTIONS>[\s\S]*?<\/SUGGESTIONS>/i, '').trim();

  return { reply: cleanReply, suggestions, isOffTopic: offTopic };
}
