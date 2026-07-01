import { prisma } from '../../lib/prisma';
import { DietType } from '@prisma/client';

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export class WeeklyPlannerService {

  async generateWeeklyPlan(
    userId: string | null,
    options: {
      dietPref: DietType;
      days?: number;
      mealsPerDay?: number;
      cuisineGroupFilter?: string;
      maxPrepMinutes?: number;
    }
  ) {
    const { dietPref, days = 7, mealsPerDay = 3, cuisineGroupFilter, maxPrepMinutes } = options;

    // ── 1. Load user context ───────────────────────────────────────────────
    let allergicIngredientIds: string[] = [];
    let preferredIngredientIds: string[] = [];
    let preferredBrands: string[] = [];

    if (userId) {
      /*
      // DB-first: check for a recent weekly plan (same params, within 12h)
      const recent = await prisma.weeklyPlan.findFirst({
        where: {
          userId,
          weekStartDate: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
          preferences: { contains: `"dietPref":"${dietPref}"` }
        },
        include: {
          options: {
            include: {
              recipe: {
                include: {
                  cuisineRegion: { include: { regionGroup: true } },
                  dishType: true,
                  ingredients: { include: { ingredient: true }, take: 5 }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recent) {
        return { weeklyPlan: this.formatPlan(recent.options), cached: true, planId: recent.id };
      }
      */

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
        preferredBrands = user.brandPrefs.map(b => b.brandName.toLowerCase());
      }
    }

    // ── 2. Fetch recipe pool with all needed relations ─────────────────────
    const whereClause: any = {
      dietType: dietPref,
      ...(maxPrepMinutes ? { prepTimeMinutes: { lte: maxPrepMinutes } } : {}),
      ...(cuisineGroupFilter ? {
        cuisineRegion: { regionGroup: { name: { contains: cuisineGroupFilter, mode: 'insensitive' } } }
      } : {}),
      ...(allergicIngredientIds.length > 0 ? {
        NOT: { ingredients: { some: { ingredientId: { in: allergicIngredientIds } } } }
      } : {})
    };

    const pool = await prisma.recipe.findMany({
      where: whereClause,
      include: {
        cuisineRegion: { include: { regionGroup: true } },
        dishType: true,
        ingredients: {
          include: {
            ingredient: {
              include: {
                catalogItems: { where: { isAvailable: true }, orderBy: { priceInr: 'asc' }, take: 3 }
              }
            }
          },
          take: 15
        }
      },
      take: 1000,
    });

    if (pool.length === 0) {
      return { weeklyPlan: [], message: 'No recipes found. Please check your filters or seed the database.' };
    }

    const isBreakfastItem = (recipe: any) => {
      const name = recipe.name.toLowerCase();
      const dt = recipe.dishType.name.toLowerCase();
      if (dt.includes('breakfast')) return true;
      if (name.includes('dosa') || name.includes('idli') || name.includes('poha') || 
          name.includes('upma') || name.includes('paratha') || name.includes('toast') || 
          name.includes('omelette') || name.includes('scrambled') || name.includes('sandwich') ||
          name.includes('uttapam') || name.includes('pongal')) {
        return true;
      }
      return false;
    };

    const isLunchDinnerItem = (recipe: any) => {
      const name = recipe.name.toLowerCase();
      const dt = recipe.dishType.name.toLowerCase();
      if (dt.includes('main') || dt.includes('rice') || dt.includes('bread') || dt.includes('curry') || dt.includes('gravy')) return true;
      if (name.includes('biryani') || name.includes('tikka') || name.includes('tandoori') || 
          name.includes('masala') || name.includes('korma') || name.includes('roti') || 
          name.includes('nan') || name.includes('dal') || name.includes('tadka') ||
          name.includes('paneer') || name.includes('chicken') || name.includes('mutton') || name.includes('pulao')) {
        return true;
      }
      return false;
    };

    // ── 3. Score recipes (prefer user ingredient prefs, variety scoring) ───
    const scoredPool = pool.map(recipe => {
      let score = 0;
      const hasPreferred = recipe.ingredients.some(ri => preferredIngredientIds.includes(ri.ingredientId));
      if (hasPreferred) score += 10;
      if (recipe.prepTimeMinutes && recipe.prepTimeMinutes <= 20) score += 3;
      score += Math.random() * 5;
      return { recipe, score };
    });

    // ── 4. Assign meals ensuring variety (no same recipe twice) ───────────
    const totalSlots = days * mealsPerDay;
    const assignments: { dayIndex: number; dayName: string; mealSlot: string; recipe: any; estimatedCost: number }[] = [];
    const usedRecipeIds = new Set<string>();

    const recentCuisines: string[] = [];
    const recentIngredients = new Set<string>();

    const getRecipeMainIngredients = (recipe: any): string[] => {
      return recipe.ingredients
        .map((ri: any) => ri.ingredient.canonicalName.toLowerCase())
        .slice(0, 3);
    };

    // Categorise by dish type for appropriate slot assignment
    const bySlot: Record<string, typeof scoredPool> = { Breakfast: [], Lunch: [], Dinner: [] };
    for (const item of scoredPool) {
      if (isBreakfastItem(item.recipe)) {
        bySlot.Breakfast.push(item);
      } else if (isLunchDinnerItem(item.recipe)) {
        bySlot.Lunch.push(item);
        bySlot.Dinner.push(item);
      } else {
        bySlot.Lunch.push(item);
        bySlot.Dinner.push(item);
      }
    }

    const slotsToUse = MEAL_SLOTS.slice(0, mealsPerDay);

    for (let day = 0; day < days; day++) {
      for (const slot of slotsToUse) {
        const candidates = (bySlot[slot] || scoredPool).filter(c => !usedRecipeIds.has(c.recipe.id));
        const fallback = scoredPool.filter(c => !usedRecipeIds.has(c.recipe.id));
        const pool2 = candidates.length > 0 ? candidates : fallback;

        if (pool2.length === 0) break;

        // Apply rotation penalties dynamically
        const scoredPoolWithRotation = pool2
          .map(c => {
            let penalty = 0;
            const cuisineGroup = c.recipe.cuisineRegion?.regionGroup?.name;
            if (cuisineGroup && recentCuisines.includes(cuisineGroup)) {
              penalty += 15;
            }
            const mainIngs = getRecipeMainIngredients(c.recipe);
            const dupCount = mainIngs.filter(ing => recentIngredients.has(ing)).length;
            penalty += dupCount * 20;

            return { ...c, adjustedScore: c.score - penalty };
          })
          .sort((a, b) => b.adjustedScore - a.adjustedScore);

        const idx = Math.floor(Math.random() * Math.min(5, scoredPoolWithRotation.length));
        const chosen = scoredPoolWithRotation[idx];
        usedRecipeIds.add(chosen.recipe.id);

        // Update rotation history
        const chosenCuisine = chosen.recipe.cuisineRegion?.regionGroup?.name;
        if (chosenCuisine) {
          recentCuisines.push(chosenCuisine);
          if (recentCuisines.length > 2) recentCuisines.shift();
        }
        const chosenIngs = getRecipeMainIngredients(chosen.recipe);
        chosenIngs.forEach(ing => recentIngredients.add(ing));
        if (recentIngredients.size > 8) {
          const arr = Array.from(recentIngredients);
          recentIngredients.clear();
          arr.slice(arr.length - 6).forEach(ing => recentIngredients.add(ing));
        }

        // Estimate cost from catalog
        let cost = 0;
        for (const ri of chosen.recipe.ingredients) {
          const catalog = ri.ingredient.catalogItems;
          if (catalog.length === 0) { cost += 45; continue; }

          let picked = catalog[0];
          if (preferredBrands.length > 0) {
            const brand = catalog.find(c => preferredBrands.includes(c.brandName.toLowerCase()));
            if (brand) picked = brand;
          }
          const qty = ri.quantity || 1;
          const ratio = picked.packSize > 0 ? qty / picked.packSize : 1;
          cost += picked.priceInr * Math.max(ratio, 0.1);
        }

        assignments.push({
          dayIndex: day,
          dayName: DAYS[day] || `Day ${day + 1}`,
          mealSlot: slot,
          recipe: {
            id: chosen.recipe.id,
            name: chosen.recipe.name,
            dietType: chosen.recipe.dietType,
            servesDefault: chosen.recipe.servesDefault,
            prepTimeMinutes: chosen.recipe.prepTimeMinutes,
            cookTimeMinutes: chosen.recipe.cookTimeMinutes,
            cuisineRegion: chosen.recipe.cuisineRegion,
            dishType: chosen.recipe.dishType,
            sourceUrl: chosen.recipe.sourceUrl,
            ingredientCount: chosen.recipe.ingredients.length,
            ingredients: chosen.recipe.ingredients.map((ri: any) => ({
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
          estimatedCost: Math.max(Math.round(cost * 100) / 100, 30),
        });
      }
    }

    const totalCost = assignments.reduce((s, a) => s + a.estimatedCost, 0);

    // ── 5. Persist to DB ────────────────────────────────────────────────────
    if (userId) {
      const prefs = JSON.stringify({ dietPref, days, mealsPerDay, cuisineGroupFilter, maxPrepMinutes });
      const wp = await prisma.weeklyPlan.create({
        data: {
          userId,
          weekStartDate: this.getNextMonday(),
          preferences: prefs,
          options: {
            create: assignments.map(a => ({
              dayIndex: a.dayIndex,
              mealSlot: a.mealSlot,
              recipeId: a.recipe.id,
              isSelected: true,
            }))
          }
        }
      });
      return { weeklyPlan: assignments, totalEstCost: Math.round(totalCost * 100) / 100, cached: false, planId: wp.id };
    }

    return { weeklyPlan: assignments, totalEstCost: Math.round(totalCost * 100) / 100, cached: false };
  }

  async getUserWeeklyPlans(userId: string, limit = 5) {
    return prisma.weeklyPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        options: {
          include: { recipe: { select: { id: true, name: true, dietType: true } } }
        }
      }
    });
  }

  private formatPlan(options: any[]) {
    return options.map(o => ({
      dayIndex: o.dayIndex,
      dayName: DAYS[o.dayIndex] || `Day ${o.dayIndex + 1}`,
      mealSlot: o.mealSlot,
      recipe: o.recipe,
      estimatedCost: 0,
    }));
  }

  private getNextMonday(): Date {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? 1 : 8 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
