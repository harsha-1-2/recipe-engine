import Groq from 'groq-sdk';
import { z } from 'zod';
import { prisma } from '../prisma';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const RecipeExtractionSchema = z.object({
  name: z.string(),
  cuisineRegion: z.string(),
  dietType: z.enum(['VEG', 'EGG', 'NON_VEG']),
  serves: z.number(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable()
  })),
  steps: z.array(z.string())
});

export type ExtractedRecipe = z.infer<typeof RecipeExtractionSchema>;

export async function extractRecipeWithGroq(prompt: string): Promise<ExtractedRecipe> {
  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "Extract the following details from the user's recipe request and return ONLY valid JSON: name, cuisineRegion, dietType, serves, ingredients (name, quantity, unit), steps."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
  });

  const content = chatCompletion.choices[0]?.message?.content || "{}";
  return RecipeExtractionSchema.parse(JSON.parse(content));
}

export async function checkIfFoodItem(name: string): Promise<boolean> {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a food classifier. Output ONLY "true" if the item is an edible food ingredient, beverage, or grocery food item, and "false" otherwise. Do not return markdown, punctuation, or explanations.'
        },
        {
          role: 'user',
          content: name
        }
      ],
      temperature: 0.1,
      max_tokens: 10,
    });
    const reply = completion.choices[0]?.message?.content?.toLowerCase().trim();
    return reply === 'true';
  } catch (error) {
    console.error('Error checking if food item:', error);
    return false;
  }
}

export async function createDynamicIngredientAndCatalogItem(name: string, category: string = 'general', unit: string = 'unit') {
  const canonicalName = name.toLowerCase().trim();

  // 1. Check if ingredient already exists to avoid race conditions
  let ingredient = await prisma.ingredient.findUnique({
    where: { canonicalName }
  });

  if (!ingredient) {
    ingredient = await prisma.ingredient.create({
      data: {
        canonicalName,
        category,
        dietType: 'VEG', // default
        defaultUnit: unit
      }
    });
  }

  // 2. Check if a catalog item already exists for this ingredient
  let catalogItem = await prisma.catalogItem.findFirst({
    where: { ingredientId: ingredient.id }
  });

  if (!catalogItem) {
    // Create a simulated catalog item
    const productId = `dynamic_${canonicalName}_generic`.replace(/\s+/g, '_');
    catalogItem = await prisma.catalogItem.create({
      data: {
        sourceProductId: productId,
        ingredientId: ingredient.id,
        brandName: 'Generic',
        packSize: 1.0,
        packUnit: unit,
        priceInr: 45.0, // default placeholder price
        rating: 4.0,
        numRatings: 10,
        isAvailable: true
      }
    });
  }

  return { ingredient, catalogItem };
}

