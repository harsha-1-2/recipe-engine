import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';
import { checkIfFoodItem, createDynamicIngredientAndCatalogItem } from '../../lib/ai/groq-client';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const prisma = new PrismaClient();

export async function parseExtrasAndMatch(text: string, brandPrefs: string[]) {
  // Step 1: Use Groq to parse the natural language into structured items
  const systemPrompt = `You are a grocery parsing assistant.
Parse the user's grocery request into a JSON array of items.
Return ONLY valid JSON — no explanation, no markdown.

Format: {"items": [{"name": "item name", "quantity": number, "unit": "kg|g|L|ml|pack|pcs"}]}

Examples:
- "2 liters of Amul milk" → {"items":[{"name":"milk","quantity":2,"unit":"L"}]}
- "a pack of bread and 3 onions" → {"items":[{"name":"bread","quantity":1,"unit":"pack"},{"name":"onion","quantity":3,"unit":"pcs"}]}`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.1,
    max_tokens: 300,
  });

  const rawJson = completion.choices[0]?.message?.content || '{"items":[]}';

  let parsedItems: { name: string; quantity: number; unit: string }[] = [];
  try {
    const parsed = JSON.parse(rawJson.replace(/```json|```/g, '').trim());
    parsedItems = parsed.items || [];
  } catch (_) {
    return { matched: [], unmatched: [text] };
  }

  // Step 2: Match each item to the CatalogItem table
  const matched: any[] = [];
  const unmatched: string[] = [];

  for (const item of parsedItems) {
    // Find ingredient by name similarity
    let ingredient = await prisma.ingredient.findFirst({
      where: { canonicalName: { contains: item.name.toLowerCase(), mode: 'insensitive' } }
    });

    if (!ingredient) {
      const isFood = await checkIfFoodItem(item.name);
      if (isFood) {
        const created = await createDynamicIngredientAndCatalogItem(item.name, 'grocery', item.unit || 'pcs');
        ingredient = created.ingredient;
      }
    }

    if (!ingredient) {
      unmatched.push(item.name);
      continue;
    }

    // Find best catalog item — prefer brand match, then by rating
    let catalogItem = null;
    if (brandPrefs.length > 0) {
      catalogItem = await prisma.catalogItem.findFirst({
        where: {
          ingredientId: ingredient.id,
          isAvailable: true,
          brandName: { in: brandPrefs, mode: 'insensitive' } as any
        },
        orderBy: { rating: 'desc' }
      });
    }

    // Fallback to highest-rated if no brand match
    if (!catalogItem) {
      catalogItem = await prisma.catalogItem.findFirst({
        where: { ingredientId: ingredient.id, isAvailable: true },
        orderBy: { rating: 'desc' }
      });
    }

    // If still no catalog item, create a dynamic one since it was verified as food item
    if (!catalogItem) {
      const created = await createDynamicIngredientAndCatalogItem(ingredient.canonicalName, ingredient.category, ingredient.defaultUnit);
      catalogItem = created.catalogItem;
    }

    if (catalogItem) {
      const alternatives = await prisma.catalogItem.findMany({
        where: { ingredientId: ingredient.id, isAvailable: true },
        orderBy: { priceInr: 'asc' }
      });

      matched.push({
        ingredientId: ingredient.id,
        catalogItemId: catalogItem.id,
        name: ingredient.canonicalName,
        brand: catalogItem.brandName,
        price: catalogItem.priceInr,
        quantity: item.quantity,
        unit: item.unit,
        alternatives: alternatives.map(alt => ({
          catalogItemId: alt.id,
          brand: alt.brandName,
          price: alt.priceInr
        }))
      });
    } else {
      unmatched.push(item.name);
    }
  }

  return { matched, unmatched };
}

