/**
 * seed.ts — seeds sample data + a demo user so the app works immediately
 * Run: npm run seed
 * For full dataset: npm run seed:csv
 */
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function makeHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('🌱 Seeding sample data...');

  // ── Region groups ─────────────────────────────────────────────────────────
  const northIndian = await prisma.regionGroup.upsert({ where: { name: 'North Indian' }, update: {}, create: { name: 'North Indian' } });
  const southIndian = await prisma.regionGroup.upsert({ where: { name: 'South Indian' }, update: {}, create: { name: 'South Indian' } });
  const indianGeneral = await prisma.regionGroup.upsert({ where: { name: 'Indian (General)' }, update: {}, create: { name: 'Indian (General)' } });
  const regional = await prisma.regionGroup.upsert({ where: { name: 'Indian Regional' }, update: {}, create: { name: 'Indian Regional' } });

  // ── Cuisine regions ───────────────────────────────────────────────────────
  const punjabi = await prisma.cuisineRegion.upsert({ where: { name: 'Punjabi' }, update: {}, create: { name: 'Punjabi', regionGroupId: northIndian.id } });
  const kerala = await prisma.cuisineRegion.upsert({ where: { name: 'Kerala' }, update: {}, create: { name: 'Kerala', regionGroupId: southIndian.id } });
  const indian = await prisma.cuisineRegion.upsert({ where: { name: 'Indian' }, update: {}, create: { name: 'Indian', regionGroupId: indianGeneral.id } });
  const tamilNadu = await prisma.cuisineRegion.upsert({ where: { name: 'Tamil Nadu' }, update: {}, create: { name: 'Tamil Nadu', regionGroupId: southIndian.id } });
  const rajasthani = await prisma.cuisineRegion.upsert({ where: { name: 'Rajasthani' }, update: {}, create: { name: 'Rajasthani', regionGroupId: northIndian.id } });

  // ── Dish types ────────────────────────────────────────────────────────────
  const mainCourse = await prisma.dishType.upsert({ where: { name: 'Main Course' }, update: {}, create: { name: 'Main Course' } });
  const breakfast = await prisma.dishType.upsert({ where: { name: 'Breakfast' }, update: {}, create: { name: 'Breakfast' } });
  const sideDish = await prisma.dishType.upsert({ where: { name: 'Side Dish' }, update: {}, create: { name: 'Side Dish' } });
  const snack = await prisma.dishType.upsert({ where: { name: 'Snack' }, update: {}, create: { name: 'Snack' } });
  const dessert = await prisma.dishType.upsert({ where: { name: 'Dessert' }, update: {}, create: { name: 'Dessert' } });

  // ── Ingredients & Catalog items ───────────────────────────────────────────
  const ingData = [
    { name: 'paneer', cat: 'dairy', diet: 'VEG' as const, unit: 'g',
      catalog: [
        { brand: 'Amul', pack: 200, unit: 'g', price: 120, rating: 4.5, nr: 2500, organic: false },
        { brand: 'Mother Dairy', pack: 200, unit: 'g', price: 110, rating: 4.3, nr: 1800, organic: false },
        { brand: 'Go Organic', pack: 200, unit: 'g', price: 160, rating: 4.6, nr: 450, organic: true },
      ]},
    { name: 'onion', cat: 'vegetables', diet: 'VEG' as const, unit: 'kg',
      catalog: [
        { brand: 'Local Store', pack: 1, unit: 'kg', price: 40, rating: 4.0, nr: 200, organic: false },
        { brand: 'Fresho', pack: 0.5, unit: 'kg', price: 25, rating: 4.2, nr: 300, organic: false },
      ]},
    { name: 'tomato', cat: 'vegetables', diet: 'VEG' as const, unit: 'kg',
      catalog: [
        { brand: 'Local Store', pack: 1, unit: 'kg', price: 30, rating: 4.0, nr: 180, organic: false },
        { brand: 'Fresho', pack: 0.5, unit: 'kg', price: 18, rating: 4.3, nr: 220, organic: false },
      ]},
    { name: 'chicken', cat: 'meat', diet: 'NON_VEG' as const, unit: 'kg',
      catalog: [
        { brand: 'Licious', pack: 0.5, unit: 'kg', price: 145, rating: 4.7, nr: 5000, organic: false },
        { brand: 'Local Butcher', pack: 1, unit: 'kg', price: 250, rating: 4.1, nr: 150, organic: false },
      ]},
    { name: 'basmati rice', cat: 'grains', diet: 'VEG' as const, unit: 'kg',
      catalog: [
        { brand: 'India Gate', pack: 1, unit: 'kg', price: 150, rating: 4.6, nr: 8000, organic: false },
        { brand: 'Daawat', pack: 1, unit: 'kg', price: 140, rating: 4.5, nr: 6500, organic: false },
        { brand: 'Fortune', pack: 5, unit: 'kg', price: 650, rating: 4.4, nr: 3000, organic: false },
      ]},
    { name: 'coconut', cat: 'vegetables', diet: 'VEG' as const, unit: 'unit',
      catalog: [
        { brand: 'Local Store', pack: 1, unit: 'unit', price: 35, rating: 4.0, nr: 120, organic: false },
      ]},
    { name: 'toor dal', cat: 'lentils', diet: 'VEG' as const, unit: 'kg',
      catalog: [
        { brand: 'Tata Sampann', pack: 0.5, unit: 'kg', price: 85, rating: 4.5, nr: 3200, organic: false },
        { brand: 'Fortune', pack: 1, unit: 'kg', price: 155, rating: 4.3, nr: 1800, organic: false },
      ]},
    { name: 'amul butter', cat: 'dairy', diet: 'VEG' as const, unit: 'g',
      catalog: [
        { brand: 'Amul', pack: 100, unit: 'g', price: 55, rating: 4.8, nr: 15000, organic: false },
        { brand: 'Amul', pack: 500, unit: 'g', price: 270, rating: 4.8, nr: 8000, organic: false },
      ]},
    { name: 'spinach', cat: 'vegetables', diet: 'VEG' as const, unit: 'g',
      catalog: [
        { brand: 'Local Store', pack: 250, unit: 'g', price: 20, rating: 4.1, nr: 100, organic: false },
        { brand: 'Fresho Organics', pack: 250, unit: 'g', price: 35, rating: 4.4, nr: 280, organic: true },
      ]},
    { name: 'mustard seeds', cat: 'spices', diet: 'VEG' as const, unit: 'g',
      catalog: [
        { brand: 'MDH', pack: 100, unit: 'g', price: 25, rating: 4.6, nr: 5000, organic: false },
        { brand: 'Everest', pack: 100, unit: 'g', price: 22, rating: 4.5, nr: 4200, organic: false },
      ]},
    { name: 'turmeric powder', cat: 'spices', diet: 'VEG' as const, unit: 'g',
      catalog: [
        { brand: 'MDH', pack: 100, unit: 'g', price: 30, rating: 4.7, nr: 7000, organic: false },
        { brand: 'Everest', pack: 100, unit: 'g', price: 28, rating: 4.6, nr: 6000, organic: false },
        { brand: 'Organic India', pack: 100, unit: 'g', price: 65, rating: 4.8, nr: 1200, organic: true },
      ]},
    { name: 'cumin seeds', cat: 'spices', diet: 'VEG' as const, unit: 'g',
      catalog: [
        { brand: 'MDH', pack: 100, unit: 'g', price: 35, rating: 4.6, nr: 4500, organic: false },
        { brand: 'Everest', pack: 100, unit: 'g', price: 32, rating: 4.5, nr: 3800, organic: false },
      ]},
  ];

  const ingMap = new Map<string, string>();
  for (const item of ingData) {
    const ing = await prisma.ingredient.upsert({
      where: { canonicalName: item.name },
      update: {},
      create: { canonicalName: item.name, category: item.cat, dietType: item.diet, defaultUnit: item.unit }
    });
    ingMap.set(item.name, ing.id);
    for (const c of item.catalog) {
      const pid = `seed_${item.name}_${c.brand}_${c.pack}`.replace(/\s+/g, '_');
      await prisma.catalogItem.upsert({
        where: { sourceProductId: pid },
        update: { priceInr: c.price },
        create: {
          sourceProductId: pid, ingredientId: ing.id, brandName: c.brand,
          packSize: c.pack, packUnit: c.unit, priceInr: c.price,
          rating: c.rating, numRatings: c.nr, isOrganic: c.organic, isAvailable: true
        }
      });
    }
  }

  // ── Sample recipes ────────────────────────────────────────────────────────
  const recipes = [
    { srno: 9991, name: 'Paneer Butter Masala', diet: 'VEG' as const, cuisine: punjabi, dish: mainCourse, serves: 3, prep: 15, cook: 30,
      ings: [{ n: 'paneer', q: 250, u: 'g' }, { n: 'tomato', q: 0.5, u: 'kg' }, { n: 'amul butter', q: 50, u: 'g' }, { n: 'onion', q: 0.2, u: 'kg' }] },
    { srno: 9992, name: 'Chicken Biryani', diet: 'NON_VEG' as const, cuisine: punjabi, dish: mainCourse, serves: 4, prep: 30, cook: 45,
      ings: [{ n: 'chicken', q: 1, u: 'kg' }, { n: 'basmati rice', q: 0.5, u: 'kg' }, { n: 'onion', q: 0.3, u: 'kg' }] },
    { srno: 9993, name: 'Kerala Dal', diet: 'VEG' as const, cuisine: kerala, dish: sideDish, serves: 2, prep: 10, cook: 25,
      ings: [{ n: 'toor dal', q: 0.25, u: 'kg' }, { n: 'coconut', q: 0.5, u: 'unit' }, { n: 'tomato', q: 0.2, u: 'kg' }, { n: 'mustard seeds', q: 5, u: 'g' }] },
    { srno: 9994, name: 'Masala Dosa', diet: 'VEG' as const, cuisine: tamilNadu, dish: breakfast, serves: 2, prep: 20, cook: 15,
      ings: [{ n: 'onion', q: 1, u: 'unit' }, { n: 'tomato', q: 0.2, u: 'kg' }, { n: 'turmeric powder', q: 5, u: 'g' }] },
    { srno: 9995, name: 'Dal Tadka', diet: 'VEG' as const, cuisine: indian, dish: mainCourse, serves: 4, prep: 10, cook: 30,
      ings: [{ n: 'toor dal', q: 0.3, u: 'kg' }, { n: 'tomato', q: 0.3, u: 'kg' }, { n: 'onion', q: 0.2, u: 'kg' }, { n: 'cumin seeds', q: 5, u: 'g' }] },
    { srno: 9996, name: 'Palak Paneer', diet: 'VEG' as const, cuisine: punjabi, dish: mainCourse, serves: 3, prep: 15, cook: 25,
      ings: [{ n: 'spinach', q: 250, u: 'g' }, { n: 'paneer', q: 200, u: 'g' }, { n: 'onion', q: 0.15, u: 'kg' }, { n: 'tomato', q: 0.2, u: 'kg' }] },
    { srno: 9997, name: 'Rajasthani Dal Baati', diet: 'VEG' as const, cuisine: rajasthani, dish: mainCourse, serves: 4, prep: 20, cook: 40,
      ings: [{ n: 'toor dal', q: 0.25, u: 'kg' }, { n: 'amul butter', q: 50, u: 'g' }, { n: 'cumin seeds', q: 5, u: 'g' }] },
    { srno: 9998, name: 'Coconut Rice', diet: 'VEG' as const, cuisine: kerala, dish: mainCourse, serves: 3, prep: 5, cook: 20,
      ings: [{ n: 'basmati rice', q: 0.3, u: 'kg' }, { n: 'coconut', q: 0.5, u: 'unit' }, { n: 'mustard seeds', q: 5, u: 'g' }] },
  ];

  for (const r of recipes) {
    const existing = await prisma.recipe.findFirst({ where: { OR: [{ sourceSrno: r.srno }, { name: r.name }] } });
    if (existing) continue;
    await prisma.recipe.create({
      data: {
        sourceSrno: r.srno, name: r.name, dietType: r.diet,
        cuisineRegionId: r.cuisine.id, dishTypeId: r.dish.id, servesDefault: r.serves,
        prepTimeMinutes: r.prep, cookTimeMinutes: r.cook,
        ingredients: { create: r.ings.map(i => ({ ingredientId: ingMap.get(i.n)!, quantity: i.q, unit: i.u })) }
      }
    });
  }

  // ── Demo user ─────────────────────────────────────────────────────────────
  const demoExists = await prisma.user.findUnique({ where: { email: 'demo@royal.com' } });
  if (!demoExists) {
    const demo = await prisma.user.create({
      data: {
        email: 'demo@royal.com', name: 'Demo User',
        passwordHash: makeHash('demo123'),
        dietTypePref: 'VEG', budget: 3000, familySize: 3, defaultPriceTier: 'MIXED',
      }
    });
    // Add sample brand preferences for demo user
    for (const brand of ['Amul', 'MDH', 'Tata Sampann']) {
      await prisma.userBrandPreference.upsert({
        where: { userId_brandName: { userId: demo.id, brandName: brand } },
        update: {}, create: { userId: demo.id, brandName: brand }
      });
    }
    // Add a sample allergy (shellfish)
    const shellfishIng = await prisma.ingredient.upsert({
      where: { canonicalName: 'shellfish' }, update: {},
      create: { canonicalName: 'shellfish', category: 'seafood', dietType: 'NON_VEG', defaultUnit: 'g' }
    });
    await prisma.userIngredientPreference.upsert({
      where: { userId_ingredientId: { userId: demo.id, ingredientId: shellfishIng.id } },
      update: {}, create: { userId: demo.id, ingredientId: shellfishIng.id, type: 'ALLERGIC' }
    });
    console.log('✅ Demo user created: demo@royal.com / demo123');
  }

  console.log('✅ Sample data seeded! Run `npm run seed:csv` to load 6800+ recipes from the CSV.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
