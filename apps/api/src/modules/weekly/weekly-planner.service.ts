import { prisma } from '../../lib/prisma';
import { DietType } from '@prisma/client';
import { fuzzyMatchRecipeNames, verifyAssignments } from '../../lib/ai/recipe-matcher';

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
      prompt?: string;
    }
  ) {
    const { dietPref, days = 7, mealsPerDay = 3, cuisineGroupFilter, maxPrepMinutes, prompt } = options;

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

    // ── 4. Assign meals ─────────────────────────────────────────────────────
    const totalSlots = days * mealsPerDay;
    const assignments: { dayIndex: number; dayName: string; mealSlot: string; recipe: any; estimatedCost: number }[] = [];
    const usedRecipeIds = new Set<string>();
    const slotsToUse = MEAL_SLOTS.slice(0, mealsPerDay);

    // Helper: compute cost for a recipe from catalog data
    const estimateCost = (recipe: any): number => {
      let cost = 0;
      for (const ri of recipe.ingredients) {
        const catalog = ri.ingredient.catalogItems;
        if (catalog.length === 0) { cost += 45; continue; }
        let picked = catalog[0];
        if (preferredBrands.length > 0) {
          const brand = catalog.find((c: any) => preferredBrands.includes(c.brandName.toLowerCase()));
          if (brand) picked = brand;
        }
        const qty = ri.quantity || 1;
        const ratio = picked.packSize > 0 ? qty / picked.packSize : 1;
        cost += picked.priceInr * Math.max(ratio, 0.1);
      }
      return Math.max(Math.round(cost * 100) / 100, 30);
    };

    // Helper: build an assignment entry from a full pool recipe
    const buildAssignment = (dayIndex: number, mealSlot: string, recipe: any) => ({
      dayIndex,
      dayName: DAYS[dayIndex] || `Day ${dayIndex + 1}`,
      mealSlot,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        dietType: recipe.dietType,
        servesDefault: recipe.servesDefault,
        prepTimeMinutes: recipe.prepTimeMinutes,
        cookTimeMinutes: recipe.cookTimeMinutes,
        cuisineRegion: recipe.cuisineRegion,
        dishType: recipe.dishType,
        sourceUrl: recipe.sourceUrl,
        ingredientCount: recipe.ingredients.length,
        ingredients: recipe.ingredients.map((ri: any) => ({
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
      estimatedCost: estimateCost(recipe),
    });

    // ── 4a. AI Agent: LLM freely suggests 5 recipes per slot ──────────────
    let aiFilledSlots = 0;
    if (process.env.GROQ_API_KEY) {
      try {
        const Groq = (await import('groq-sdk')).default;
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        // Build slot list
        const slotsNeeded: { day: string; slot: string }[] = [];
        for (let d = 0; d < days; d++) {
          for (const s of slotsToUse) {
            slotsNeeded.push({ day: DAYS[d] || `Day ${d + 1}`, slot: s });
          }
        }

        // Build user context
        const userAllergyNames = userId ? await prisma.userIngredientPreference.findMany({
          where: { userId, type: 'ALLERGIC' },
          include: { ingredient: { select: { canonicalName: true } } }
        }).then(prefs => prefs.map(p => p.ingredient.canonicalName)) : [];

        const userPreferredNames = userId ? await prisma.userIngredientPreference.findMany({
          where: { userId, type: 'PREFERRED' },
          include: { ingredient: { select: { canonicalName: true } } }
        }).then(prefs => prefs.map(p => p.ingredient.canonicalName)) : [];

        const dietLabel = dietPref === 'VEG' ? 'STRICTLY VEGETARIAN (no meat, no eggs, no fish)'
          : dietPref === 'EGG' ? 'EGGETARIAN (vegetarian + eggs allowed, no meat/fish)'
          : 'NON-VEGETARIAN (all ingredients allowed, can include veg dishes too)';

        const systemPrompt = `You are an expert global culinary meal planner and nutritionist.

For EACH meal slot, suggest exactly 5 well-known recipe names as options.
The user (or system) will pick the best available one from each set of 5.

STRICT RULES:
1. Diet: ${dietLabel}. ${dietPref === 'VEG' ? 'ABSOLUTELY NO eggs, chicken, mutton, fish, prawns, or any non-veg ingredient in ANY suggestion.' : ''}
2. ${userAllergyNames.length > 0 ? `AVOID recipes with: ${userAllergyNames.join(', ')}` : 'No allergies.'}
3. ${userPreferredNames.length > 0 ? `PRIORITIZE recipes using: ${userPreferredNames.join(', ')}` : ''}
4. ${cuisineGroupFilter ? `Focus specifically on ${cuisineGroupFilter} cuisine.` : 'Mix various global and local cuisines for maximum variety.'}
5. Provide an all-round, highly nutritional, balanced diet (macro and micro nutrients). Do not skew towards just one type of food.
6. Breakfast should be light items. Lunch/Dinner should be full, balanced meals.
7. Ensure massive variety across the days (no repetitive main ingredients unless requested).

Return ONLY valid JSON:
{"meals":[{"day":"Monday","slot":"Breakfast","options":["Recipe1","Recipe2","Recipe3","Recipe4","Recipe5"]}]}`;

        const userPrompt = prompt 
          ? `User request: ${prompt}\n\nStrictly follow the user's specific request above.` 
          : `User request: (None given). Please provide a completely well-rounded, balanced, and diverse nutritional plan.`;

        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}\n\nFill these ${slotsNeeded.length} slots:\n${slotsNeeded.map(s => `Day ${s.day} — ${s.slot}`).join('\n')}` }
          ],
          temperature: 0.4,
          max_tokens: 3000,
          response_format: { type: 'json_object' }
        });

        const raw = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        const aiMeals: { day: string; slot: string; options: string[] }[] = parsed.meals || [];

        console.log(`[WeeklyPlanner] AI returned ${aiMeals.length} slot suggestions`);

        for (const aiMeal of aiMeals) {
          const dayIndex = DAYS.indexOf(aiMeal.day);
          if (dayIndex < 0 || dayIndex >= days) continue;
          if (usedRecipeIds.has(`slot-${dayIndex}-${aiMeal.slot}`)) continue;

          // Fuzzy-match all 5 options against our pool
          const options = (aiMeal.options || []).slice(0, 5);
          const matchResults = fuzzyMatchRecipeNames(options, pool);

          // Pick the first match that passes verification
          let placed = false;
          for (const mr of matchResults) {
            if (!mr.matchedRecipe) continue;
            const fullRecipe = pool.find(r => r.id === mr.matchedRecipe!.id);
            if (!fullRecipe || usedRecipeIds.has(fullRecipe.id)) continue;

            // Agentic verification: diet + allergy check
            const candidate = buildAssignment(dayIndex, aiMeal.slot, fullRecipe);
            const { verified } = verifyAssignments([candidate], dietPref, allergicIngredientIds);

            if (verified.length > 0) {
              usedRecipeIds.add(fullRecipe.id);
              assignments.push(verified[0]);
              aiFilledSlots++;
              console.log(`[WeeklyPlanner] AI → ${aiMeal.day} ${aiMeal.slot}: "${mr.candidateName}" → "${fullRecipe.name}" (${mr.tier}) ✅`);
              placed = true;
              break;
            } else {
              console.log(`[WeeklyPlanner] AI → ${aiMeal.day} ${aiMeal.slot}: "${mr.candidateName}" → "${fullRecipe.name}" REJECTED by verification`);
            }
          }
          if (!placed) {
            console.log(`[WeeklyPlanner] AI → ${aiMeal.day} ${aiMeal.slot}: no valid match from ${options.length} options, will use deterministic`);
          }
        }

        console.log(`[WeeklyPlanner] AI filled ${aiFilledSlots}/${totalSlots} slots`);
      } catch (err: any) {
        console.error('[WeeklyPlanner] AI agent failed, falling back to deterministic:', err?.message || err);
      }
    }

    // ── 4b. Deterministic fallback: fill any remaining unfilled slots ──────
    const filledSlotKeys = new Set(assignments.map(a => `${a.dayIndex}-${a.mealSlot}`));

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

    for (let day = 0; day < days; day++) {
      for (const slot of slotsToUse) {
        if (filledSlotKeys.has(`${day}-${slot}`)) continue; // AI already filled this

        const candidates = (bySlot[slot] || scoredPool).filter(c => !usedRecipeIds.has(c.recipe.id));
        const fallback = scoredPool.filter(c => !usedRecipeIds.has(c.recipe.id));
        const pool2 = candidates.length > 0 ? candidates : fallback;
        if (pool2.length === 0) break;

        const scoredPoolWithRotation = pool2
          .map(c => {
            let penalty = 0;
            const cuisineGroup = c.recipe.cuisineRegion?.regionGroup?.name;
            if (cuisineGroup && recentCuisines.includes(cuisineGroup)) penalty += 15;
            const mainIngs = getRecipeMainIngredients(c.recipe);
            const dupCount = mainIngs.filter(ing => recentIngredients.has(ing)).length;
            penalty += dupCount * 20;
            return { ...c, adjustedScore: c.score - penalty };
          })
          .sort((a, b) => b.adjustedScore - a.adjustedScore);

        const idx = Math.floor(Math.random() * Math.min(5, scoredPoolWithRotation.length));
        const chosen = scoredPoolWithRotation[idx];
        usedRecipeIds.add(chosen.recipe.id);

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

        assignments.push(buildAssignment(day, slot, chosen.recipe));
      }
    }

    // Sort assignments by day then slot order
    assignments.sort((a, b) => a.dayIndex - b.dayIndex || slotsToUse.indexOf(a.mealSlot) - slotsToUse.indexOf(b.mealSlot));

    const totalCost = assignments.reduce((s, a) => s + a.estimatedCost, 0);

    // ── 5. Generate AI shopping list + prep tips ────────────────────────────
    let shoppingList: any = null;
    try {
      shoppingList = await this.generateShoppingList(assignments, dietPref);
    } catch (err: any) {
      console.error('[WeeklyPlanner] AI shopping list generation failed:', err?.message || err);
    }

    // ── 6. Persist to DB ────────────────────────────────────────────────────
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
      return { weeklyPlan: assignments, totalEstCost: Math.round(totalCost * 100) / 100, cached: false, planId: wp.id, shoppingList };
    }

    return { weeklyPlan: assignments, totalEstCost: Math.round(totalCost * 100) / 100, cached: false, shoppingList };
  }

  private async generateShoppingList(assignments: any[], diet: string) {
    if (!process.env.GROQ_API_KEY) return null;

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const allIngredients = assignments.flatMap(a =>
      (a.recipe.ingredients || []).map((ri: any) =>
        `${ri.quantity || ''} ${ri.unit || ''} ${ri.ingredient?.canonicalName || 'unknown'}`.trim()
      )
    );

    if (allIngredients.length === 0) return null;

    const mealContext = assignments.map(a =>
      `${a.dayName} ${a.mealSlot}: ${a.recipe.name}`
    ).join('\n');

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a smart grocery shopping assistant for an Indian ${diet} kitchen. Given a list of ingredients needed for a week's meals, create a consolidated shopping list. 

IMPORTANT: Combine duplicate items and sum their quantities. Group by category.

Return ONLY valid JSON in this exact format:
{"categories": [{"name": "Category Name", "emoji": "🥬", "items": [{"name": "onion", "totalQty": "2 kg"}, {"name": "tomato", "totalQty": "1.5 kg"}]}], "prepTips": ["Tip 1", "Tip 2", "Tip 3"]}`
        },
        {
          role: 'user',
          content: `Meals planned:\n${mealContext}\n\nAll ingredients needed:\n${allIngredients.join('\n')}`
        }
      ],
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    try {
      return JSON.parse(raw);
    } catch {
      console.error('[WeeklyPlanner] Failed to parse shopping list JSON');
      return null;
    }
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
