import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';
import { extractRecipeWithGroq, checkIfFoodItem, createDynamicIngredientAndCatalogItem } from '../../lib/ai/groq-client';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const prisma = new PrismaClient();

export async function handleBotChat(userMessage: string, prefs: {
  diet: string; budget: number; familySize: number; allergies: string[];
}) {
  // Fetch a sample of recipes from DB matching the diet to give AI context
  const sampleRecipes = await prisma.recipe.findMany({
    where: { dietType: prefs.diet as any },
    take: 20,
    include: { cuisineRegion: true }
  });

  const recipeContext = sampleRecipes
    .map(r => `- ${r.name} (${r.cuisineRegion?.name || 'Indian'}, ${r.dietType})`)
    .join('\n');

  const systemPrompt = `You are a friendly Indian recipe assistant for a grocery-to-cart app.
User preferences:
- Diet: ${prefs.diet}
- Weekly budget: ₹${prefs.budget}
- Family size: ${prefs.familySize} people
- Allergies/avoid: ${prefs.allergies.length > 0 ? prefs.allergies.join(', ') : 'None'}

Available recipes in the system (suggest ONLY from this list when possible):
${recipeContext}

Rules:
1. Always tailor suggestions to the user's diet and budget.
2. Never suggest recipes with allergens the user avoids.
3. Be warm, concise, and use food emojis occasionally.
4. If suggesting recipes, list them clearly so they can be parsed. Format recipe suggestions as: **Recipe Name** — short description.
5. Return a JSON object at the end of your response in this exact format (always include it even if empty):
<SUGGESTIONS>{"recipes":[{"name":"Recipe Name 1"},{"name":"Recipe Name 2"}]}</SUGGESTIONS>`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.75,
    max_tokens: 600,
  });

  const rawReply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

  // Extract suggestion block
  const suggestMatch = rawReply.match(/<SUGGESTIONS>([\s\S]*?)<\/SUGGESTIONS>/);
  let suggestions: any[] = [];

  if (suggestMatch) {
    try {
      const parsed = JSON.parse(suggestMatch[1]);
      const names: string[] = (parsed.recipes || []).map((r: any) => r.name);

      // Try to match names to actual DB recipes
      const matched = await prisma.recipe.findMany({
        where: { name: { in: names } },
        include: { cuisineRegion: true, ingredients: { include: { ingredient: true } } }
      });

      // Fuzzy fallback: partial match
      const unmatchedNames = names.filter(n => !matched.some(m => m.name === n));
      const remainingUnmatched: string[] = [];

      for (const uname of unmatchedNames) {
        const fuzzy = await prisma.recipe.findFirst({
          where: { name: { contains: uname.split(' ')[0], mode: 'insensitive' } },
          include: { cuisineRegion: true, ingredients: { include: { ingredient: true } } }
        });
        if (fuzzy) {
          matched.push(fuzzy);
        } else {
          remainingUnmatched.push(uname);
        }
      }

      // Generate missing recipes dynamically
      for (const uname of remainingUnmatched.slice(0, 2)) {
        try {
          const extracted = await extractRecipeWithGroq(`recipe details for ${uname}`);
          if (!extracted || !extracted.name) continue;

          let regionGroup = await prisma.regionGroup.findFirst({
            where: { name: { equals: 'Indian Regional', mode: 'insensitive' } }
          });
          if (!regionGroup) {
            regionGroup = await prisma.regionGroup.create({
              data: { name: 'Indian Regional' }
            });
          }

          const cuisineName = extracted.cuisineRegion || 'Indian';
          let cuisineRegion = await prisma.cuisineRegion.findFirst({
            where: { name: { equals: cuisineName, mode: 'insensitive' } }
          });
          if (!cuisineRegion) {
            cuisineRegion = await prisma.cuisineRegion.create({
              data: { name: cuisineName, regionGroupId: regionGroup.id }
            });
          }

          let dishType = await prisma.dishType.findFirst({
            where: { name: { equals: 'Main Course', mode: 'insensitive' } }
          });
          if (!dishType) {
            dishType = await prisma.dishType.create({
              data: { name: 'Main Course' }
            });
          }

          const newRecipe = await prisma.recipe.create({
            data: {
              name: extracted.name,
              dietType: extracted.dietType || 'VEG',
              cuisineRegionId: cuisineRegion.id,
              dishTypeId: dishType.id,
              servesDefault: extracted.serves || 2,
              instructions: extracted.steps?.join('\n') || '',
              source: 'BOT_GENERATED',
            }
          });

          for (const ing of extracted.ingredients || []) {
            if (!ing.name) continue;
            const canonicalName = ing.name.toLowerCase().trim();

            let dbIngredient = await prisma.ingredient.findUnique({
              where: { canonicalName }
            });

            if (!dbIngredient) {
              const isFood = await checkIfFoodItem(canonicalName);
              if (isFood) {
                const created = await createDynamicIngredientAndCatalogItem(canonicalName, 'grocery', ing.unit || 'unit');
                dbIngredient = created.ingredient;
              }
            }

            if (dbIngredient) {
              await prisma.recipeIngredient.create({
                data: {
                  recipeId: newRecipe.id,
                  ingredientId: dbIngredient.id,
                  quantity: ing.quantity || null,
                  unit: ing.unit || null,
                }
              });
            }
          }

          const fullyCreatedRecipe = await prisma.recipe.findUnique({
            where: { id: newRecipe.id },
            include: { cuisineRegion: true, ingredients: { include: { ingredient: true } } }
          });

          if (fullyCreatedRecipe) {
            matched.push(fullyCreatedRecipe);
          }
        } catch (err) {
          console.error(`Failed to generate recipe dynamically for ${uname}:`, err);
        }
      }

      suggestions = matched.slice(0, 4);
    } catch (_) {}
  }

  // Clean reply (remove the JSON block from what the user sees)
  const cleanReply = rawReply.replace(/<SUGGESTIONS>[\s\S]*?<\/SUGGESTIONS>/, '').trim();

  return { reply: cleanReply, suggestions };
}

