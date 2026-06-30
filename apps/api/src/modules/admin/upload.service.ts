import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import csvParser from 'csv-parser';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

// ─── Recipe CSV ingestion ─────────────────────────────────────────────────────
// Supports both the raw IndianFoodDataset format AND our cleaned recipes_clean.csv
export async function ingestRecipesFromCsv(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    fs.createReadStream(filePath)
      .pipe((csvParser as any)())
      .on('data', (row: any) => rows.push(row))
      .on('end', async () => {
        let count = 0;
        for (const row of rows) {
          try {
            // Support both dataset formats
            const name = row['TranslatedRecipeName'] || row['clean_name_en'] || row['RecipeName'] || row['name'] || row['Name'];
            if (!name || name.trim() === '') continue;

            // Diet mapping — clean_diet has values like "vegetarian", "non_vegetarian", etc.
            const dietRaw = (
              row['clean_diet'] || row['Diet'] || row['diet'] || row['Vegetarian'] || 'vegetarian'
            ).toLowerCase();
            const diet = dietRaw.includes('non') ? 'NON_VEG'
              : dietRaw.includes('egg') ? 'EGG' : 'VEG';

            // Cuisine — use clean versions when available
            const cuisineName = row['clean_cuisine'] || row['Cuisine'] || row['cuisine'] || 'Indian';
            const regionName = row['cuisine_group'] || row['Region'] || row['region'] || 'Indian (General)';
            const dishTypeName = row['clean_course'] || row['Course'] || row['course'] || 'Main Course';

            // Upsert region group
            const rg = await prisma.regionGroup.upsert({
              where: { name: regionName }, update: {}, create: { name: regionName }
            });

            // Upsert cuisine region
            const cr = await prisma.cuisineRegion.upsert({
              where: { name: cuisineName }, update: {},
              create: { name: cuisineName, regionGroupId: rg.id }
            });

            // Upsert dish type
            const dt = await prisma.dishType.upsert({
              where: { name: dishTypeName }, update: {}, create: { name: dishTypeName }
            });

            // Determine sourceSrno — use recipe_id or skip
            const srnoRaw = row['recipe_id'] || row['Srno'] || row['srno'];
            const srno = srnoRaw ? parseInt(String(srnoRaw).replace(/\D/g, '')) || null : null;

            // Skip if already exists by srno or name
            const existing = srno
              ? await prisma.recipe.findFirst({ where: { OR: [{ sourceSrno: srno }, { name }] } })
              : await prisma.recipe.findFirst({ where: { name } });
            if (existing) continue;

            // Parse timing
            const prepTime = parseInt(row['PrepTimeInMins'] || row['PrepTime'] || '0') || null;
            const cookTime = parseInt(row['CookTimeInMins'] || row['CookTime'] || '0') || null;
            const servings = parseInt(row['Servings'] || row['servings'] || '2') || 2;
            const instructions = row['TranslatedInstructions'] || row['instructions_clean'] || row['Instructions'] || null;
            const sourceUrl = row['URL'] || row['url'] || null;

            const created = await prisma.recipe.create({
              data: {
                ...(srno ? { sourceSrno: srno } : {}),
                name: name.trim(),
                dietType: diet as any,
                cuisineRegionId: cr.id,
                dishTypeId: dt.id,
                servesDefault: servings,
                prepTimeMinutes: prepTime,
                cookTimeMinutes: cookTime,
                instructions,
                sourceUrl,
              }
            });

            // Parse and insert ingredients from ingredients_list_json
            const ingredientsJson = row['ingredients_list_json'];
            if (ingredientsJson) {
              try {
                const ingList = JSON.parse(ingredientsJson);
                for (const ing of ingList) {
                  const canonicalName = (ing.ingredient_name || ing.ingredient_raw || '').toLowerCase().trim();
                  if (!canonicalName) continue;

                  const ingredient = await prisma.ingredient.upsert({
                    where: { canonicalName },
                    update: {},
                    create: {
                      canonicalName,
                      category: 'general',
                      dietType: 'VEG',
                      defaultUnit: ing.unit || 'unit',
                    }
                  });

                  await prisma.recipeIngredient.create({
                    data: {
                      recipeId: created.id,
                      ingredientId: ingredient.id,
                      quantity: ing.quantity || null,
                      unit: ing.unit || null,
                      notes: ing.notes || null,
                    }
                  });
                }
              } catch (_) { /* skip bad json */ }
            }

            count++;
          } catch (e) {
            // skip malformed rows silently
          }
        }
        // cleanup temp file
        try { fs.unlinkSync(filePath); } catch (_) {}
        resolve(count);
      })
      .on('error', reject);
  });
}

// ─── Grocery Catalog XLSX/CSV ingestion ──────────────────────────────────────
export async function ingestCatalogFromXlsx(filePath: string): Promise<number> {
  let rows: any[] = [];

  if (filePath.endsWith('.csv')) {
    // Parse as CSV
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe((csvParser as any)())
        .on('data', (row: any) => rows.push(row))
        .on('end', () => resolve())
        .on('error', reject);
    });
  } else {
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  }

  let count = 0;
  for (const row of rows) {
    try {
      const productName = row['product_name'] || row['name'] || row['Name'] || row['ProductName'];
      if (!productName) continue;

      const brand = row['brand'] || row['Brand'] || row['BrandName'] || 'Generic';
      const price = parseFloat(row['price'] || row['Price'] || row['MRP'] || '0');
      const category = (row['category'] || row['Category'] || 'grocery').toLowerCase();
      const rating = parseFloat(row['rating'] || row['Rating'] || '4.0');
      const numRatings = parseInt(row['num_ratings'] || row['NumRatings'] || '10');
      const packSize = parseFloat(row['pack_size'] || row['PackSize'] || '1');
      const packUnit = row['unit'] || row['Unit'] || 'units';

      const dietType = category.includes('meat') || category.includes('chicken') || category.includes('fish') ? 'NON_VEG'
        : category.includes('egg') ? 'EGG' : 'VEG';

      const canonicalName = productName.toLowerCase().trim();
      const ingredient = await prisma.ingredient.upsert({
        where: { canonicalName },
        update: {},
        create: { canonicalName, category, dietType: dietType as any, defaultUnit: packUnit }
      });

      const productId = `upload_${canonicalName}_${brand}`.replace(/\s+/g, '_');
      const existing = await prisma.catalogItem.findFirst({ where: { sourceProductId: productId } });
      if (!existing) {
        await prisma.catalogItem.create({
          data: {
            sourceProductId: productId,
            ingredientId: ingredient.id,
            brandName: brand,
            packSize,
            packUnit,
            priceInr: price,
            rating,
            numRatings,
            isAvailable: true
          }
        });
        count++;
      }
    } catch (_) { /* skip malformed rows */ }
  }

  try { fs.unlinkSync(filePath); } catch (_) {}
  return count;
}
