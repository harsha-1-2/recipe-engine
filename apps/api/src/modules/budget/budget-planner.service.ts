import { prisma } from '../../lib/prisma';
import { DietType, PriceTier } from '@prisma/client';

interface PlanMeal {
  recipe: { id: string; name: string; servesDefault: number; dietType: string; ingredients: any[] };
  estimatedCost: number;
  dayIndex: number;
  mealSlot: string;
}

export class BudgetPlannerService {

  async planBudget(
    userId: string | null,
    budgetInr: number,
    dietPref: DietType,
    days: number,
    mealsPerDay: number,
    priceTier: PriceTier = 'MIXED',
    saveToDb: boolean = true,
    cuisineGroupFilter?: string
  ) {
    // ── 1. Load user context (allergies + brand prefs + ingredient preferences) ──
    let allergicIngredientIds: string[] = [];
    let preferredIngredientIds: string[] = [];
    let dislikedIngredientIds: string[] = [];
    let preferredBrands: string[] = [];

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          ingredientPrefs: true,
          brandPrefs: true,
        }
      });
      if (user) {
        allergicIngredientIds = user.ingredientPrefs.filter(p => p.type === 'ALLERGIC').map(p => p.ingredientId);
        preferredIngredientIds = user.ingredientPrefs.filter(p => p.type === 'PREFERRED').map(p => p.ingredientId);
        dislikedIngredientIds = user.ingredientPrefs.filter(p => p.type === 'DISLIKED').map(p => p.ingredientId);
        preferredBrands = user.brandPrefs.map(b => b.brandName.toLowerCase());
      }
      /*
      // ── 2. DB-first: return cached plan if one exists for same params (within 24h) ──
      if (saveToDb) {
        const recent = await prisma.budgetPlan.findFirst({
          where: {
            userId,
            budgetInr,
            dietPref,
            days,
            mealsPerDay,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          },
          orderBy: { createdAt: 'desc' }
        });
        if (recent) {
          return { ...JSON.parse(recent.generatedPlan), cached: true, planId: recent.id };
        }
      }
      */
    }

    // ── 3. Fetch recipe pool filtered by diet, excluding allergic recipes ──
    const pool = await prisma.recipe.findMany({
      where: {
        dietType: dietPref,
        ...(cuisineGroupFilter ? {
          cuisineRegion: { regionGroup: { name: { contains: cuisineGroupFilter, mode: 'insensitive' } } }
        } : {}),
        ...(allergicIngredientIds.length > 0 ? {
          NOT: { ingredients: { some: { ingredientId: { in: allergicIngredientIds } } } }
        } : {})
      },
      include: {
        ingredients: {
          include: {
            ingredient: {
              include: {
                catalogItems: {
                  where: { isAvailable: true },
                  orderBy: { priceInr: 'asc' }
                }
              }
            }
          }
        },
        cuisineRegion: { include: { regionGroup: true } },
        dishType: true,
      },
      take: 500,
    });

    if (pool.length === 0) {
      return { plan: [], totalEstCost: 0, message: 'No recipes found matching your diet preference. Please seed the database first.' };
    }

    // ── 4. Estimate cost per recipe using real catalog data ────────────────
    const FALLBACK_PRICE_PER_ING = 45; // INR when no catalog item exists
    const mealSlots = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Supper'];

    const costedRecipes = pool.map(recipe => {
      let cost = 0;
      for (const ri of recipe.ingredients) {
        const catalog = ri.ingredient.catalogItems;
        if (catalog.length === 0) {
          cost += FALLBACK_PRICE_PER_ING;
          continue;
        }

        let chosen = catalog[0]; // default cheapest

        if (priceTier === 'HIGH_RATED') {
          // Bayesian average rating pick
          const C = 4.0, m = 20;
          chosen = catalog.sort((a, b) => {
            const sa = (a.numRatings * a.rating + m * C) / (a.numRatings + m);
            const sb = (b.numRatings * b.rating + m * C) / (b.numRatings + m);
            return sb - sa;
          })[0];
        } else if (priceTier === 'PREFERENCE' && preferredBrands.length > 0) {
          const brandMatch = catalog.find(c => preferredBrands.includes(c.brandName.toLowerCase()));
          if (brandMatch) chosen = brandMatch;
        } else if (priceTier === 'MIXED') {
          // Score: 50% price rank + 50% rating
          const maxPrice = Math.max(...catalog.map(c => c.priceInr));
          chosen = catalog.sort((a, b) => {
            const sa = 0.5 * (1 - a.priceInr / maxPrice) + 0.5 * (a.rating / 5);
            const sb = 0.5 * (1 - b.priceInr / maxPrice) + 0.5 * (b.rating / 5);
            return sb - sa;
          })[0];
        }

        // Scale price by quantity ratio (ingredient qty vs pack size)
        const qty = ri.quantity || 1;
        const ratio = chosen.packSize > 0 ? qty / chosen.packSize : 1;
        cost += chosen.priceInr * Math.max(ratio, 0.1);
      }

      // Calculate preference score
      let prefScore = 0;
      const hasPreferred = recipe.ingredients.some(ri => preferredIngredientIds.includes(ri.ingredientId));
      if (hasPreferred) prefScore += 10;

      const hasDisliked = recipe.ingredients.some(ri => dislikedIngredientIds.includes(ri.ingredientId));
      if (hasDisliked) prefScore -= 15; // penalize disliked ingredients heavily

      // Add a slight random noise to ensure variety
      prefScore += Math.random() * 5;

      return { recipe, estimatedCost: Math.max(cost, 30), prefScore };
    });

    // Categorize costed recipes by meal slot
    const bySlot: Record<string, typeof costedRecipes> = { Breakfast: [], Lunch: [], Dinner: [], Snack: [], Supper: [] };
    for (const cr of costedRecipes) {
      const dt = cr.recipe.dishType.name.toLowerCase();
      if (dt.includes('breakfast')) {
        bySlot.Breakfast.push(cr);
        bySlot.Snack.push(cr);
      } else if (dt.includes('snack')) {
        bySlot.Snack.push(cr);
        bySlot.Breakfast.push(cr);
      } else if (dt.includes('main') || dt.includes('rice') || dt.includes('bread') || dt.includes('curry')) {
        bySlot.Lunch.push(cr);
        bySlot.Dinner.push(cr);
        bySlot.Supper.push(cr);
      } else {
        bySlot.Breakfast.push(cr);
        bySlot.Lunch.push(cr);
        bySlot.Dinner.push(cr);
        bySlot.Snack.push(cr);
        bySlot.Supper.push(cr);
      }
    }

    const getSlotCandidates = (slotName: string) => {
      const candidates = bySlot[slotName] || [];
      return candidates.length > 0 ? candidates : costedRecipes;
    };

    // ── 5. Greedy budget allocation ────────────────────────────────────────
    const totalSlots = days * mealsPerDay;
    let remainingBudget = budgetInr;
    const plan: PlanMeal[] = [];
    const usedIds = new Set<string>();

    for (let day = 0; day < days; day++) {
      for (let meal = 0; meal < mealsPerDay; meal++) {
        const slotsLeft = totalSlots - plan.length;
        const targetPerSlot = remainingBudget / slotsLeft;
        const mealSlotName = mealSlots[meal % mealSlots.length];

        const slotPool = getSlotCandidates(mealSlotName);

        const candidates = slotPool
          .filter(c => !usedIds.has(c.recipe.id) && c.estimatedCost <= targetPerSlot * 1.3)
          .sort((a, b) => b.prefScore - a.prefScore); // sort by preference score

        if (candidates.length === 0) {
          // Relax constraint: any recipe within 2x budget
          const relaxed = slotPool
            .filter(c => c.estimatedCost <= targetPerSlot * 2)
            .sort((a, b) => {
              if (Math.abs(b.prefScore - a.prefScore) > 1) {
                return b.prefScore - a.prefScore;
              }
              return a.estimatedCost - b.estimatedCost;
            });
          if (relaxed.length > 0) {
            const chosen = relaxed[Math.floor(Math.random() * Math.min(5, relaxed.length))];
            plan.push({ ...chosen, dayIndex: day, mealSlot: mealSlotName });
            remainingBudget -= chosen.estimatedCost;
            usedIds.add(chosen.recipe.id);
          }
        } else {
          const chosen = candidates[Math.floor(Math.random() * Math.min(8, candidates.length))];
          plan.push({ ...chosen, dayIndex: day, mealSlot: mealSlotName });
          remainingBudget -= chosen.estimatedCost;
          usedIds.add(chosen.recipe.id);
        }
      }
    }

    // Smart aggregated cost calculation for the final plan (pantry/leftover pack-sharing)
    const ingredientTotalQty: Record<string, { qty: number; unit: string; catalogItem: any }> = {};
    for (const meal of plan) {
      for (const ri of meal.recipe.ingredients) {
        const ingId = ri.ingredientId;
        const qty = ri.quantity || 0;
        const unit = ri.unit || ri.ingredient.defaultUnit || 'units';

        if (!ingredientTotalQty[ingId]) {
          const catalog = ri.ingredient.catalogItems;
          let chosen = catalog[0] || null;
          if (catalog.length > 0) {
            if (priceTier === 'HIGH_RATED') {
              const C = 4.0, m = 20;
              chosen = catalog.sort((a: any, b: any) => {
                const sa = (a.numRatings * a.rating + m * C) / (a.numRatings + m);
                const sb = (b.numRatings * b.rating + m * C) / (b.numRatings + m);
                return sb - sa;
              })[0];
            } else if (priceTier === 'PREFERENCE' && preferredBrands.length > 0) {
              const brandMatch = catalog.find((c: any) => preferredBrands.includes(c.brandName.toLowerCase()));
              if (brandMatch) chosen = brandMatch;
            } else if (priceTier === 'MIXED') {
              const maxPrice = Math.max(...catalog.map((c: any) => c.priceInr));
              chosen = catalog.sort((a: any, b: any) => {
                const sa = 0.5 * (1 - a.priceInr / maxPrice) + 0.5 * (a.rating / 5);
                const sb = 0.5 * (1 - b.priceInr / maxPrice) + 0.5 * (b.rating / 5);
                return sb - sa;
              })[0];
            }
          }
          ingredientTotalQty[ingId] = { qty: 0, unit, catalogItem: chosen };
        }
        ingredientTotalQty[ingId].qty += qty;
      }
    }

    let aggregatedTotalCost = 0;
    for (const [ingId, info] of Object.entries(ingredientTotalQty)) {
      if (!info.catalogItem) {
        aggregatedTotalCost += info.qty * FALLBACK_PRICE_PER_ING || FALLBACK_PRICE_PER_ING;
        continue;
      }
      const packSize = info.catalogItem.packSize || 1;
      const packsNeeded = Math.ceil(info.qty / packSize) || 1;
      aggregatedTotalCost += packsNeeded * info.catalogItem.priceInr;
    }

    // Fallback: if we had no meals generated or aggregatedTotalCost is 0, keep it 0
    const totalEstCost = plan.length > 0 ? Math.max(aggregatedTotalCost, 30) : 0;
    const finalSavings = budgetInr - totalEstCost;

    const result = {
      plan: plan.map(p => ({
        dayIndex: p.dayIndex,
        mealSlot: p.mealSlot,
        recipe: {
          id: p.recipe.id,
          name: p.recipe.name,
          dietType: p.recipe.dietType,
          servesDefault: p.recipe.servesDefault,
          cuisineRegion: (p.recipe as any).cuisineRegion,
          dishType: (p.recipe as any).dishType,
          ingredientCount: p.recipe.ingredients.length,
          ingredients: p.recipe.ingredients.map((ri: any) => ({
            id: ri.id,
            recipeId: ri.recipeId,
            ingredientId: ri.ingredientId,
            quantity: ri.quantity,
            unit: ri.unit,
            ingredient: {
              id: ri.ingredient.id,
              canonicalName: ri.ingredient.canonicalName,
              category: ri.ingredient.category,
              dietType: ri.ingredient.dietType,
              defaultUnit: ri.ingredient.defaultUnit
            }
          }))
        },
        estimatedCost: Math.round(p.estimatedCost * 100) / 100,
      })),
      totalEstCost: Math.round(totalEstCost * 100) / 100,
      budgetInr,
      saved: finalSavings > 0 ? Math.round(finalSavings * 100) / 100 : 0,
      cached: false,
    };

    // ── 6. Persist to DB if authenticated ─────────────────────────────────
    if (userId && saveToDb) {
      const saved = await prisma.budgetPlan.create({
        data: { userId, budgetInr, dietPref, days, mealsPerDay, generatedPlan: JSON.stringify(result) }
      });
      return { ...result, planId: saved.id };
    }

    return result;
  }

  async getUserPlans(userId: string, limit = 10) {
    return prisma.budgetPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, budgetInr: true, dietPref: true, days: true, mealsPerDay: true, createdAt: true, generatedPlan: true }
    });
  }
}
