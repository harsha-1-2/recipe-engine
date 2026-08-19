import { prisma } from '../../lib/prisma';
import { DietType, PriceTier } from '@prisma/client';
import { fuzzyMatchRecipeNames, verifyAssignments } from '../../lib/ai/recipe-matcher';

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
    cuisineGroupFilter?: string,
    prompt?: string
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

    // Categorize costed recipes by meal slot
    const bySlot: Record<string, typeof costedRecipes> = { Breakfast: [], Lunch: [], Dinner: [], Snack: [], Supper: [] };
    for (const cr of costedRecipes) {
      if (isBreakfastItem(cr.recipe)) {
        bySlot.Breakfast.push(cr);
        bySlot.Snack.push(cr);
      } else if (isLunchDinnerItem(cr.recipe)) {
        bySlot.Lunch.push(cr);
        bySlot.Dinner.push(cr);
        bySlot.Supper.push(cr);
      } else {
        bySlot.Snack.push(cr);
        bySlot.Supper.push(cr);
        bySlot.Lunch.push(cr);
        bySlot.Dinner.push(cr);
      }
    }

    const getSlotCandidates = (slotName: string) => {
      const candidates = bySlot[slotName] || [];
      return candidates.length > 0 ? candidates : costedRecipes;
    };

    // ── 5. Initial Plan Generation ────────────────────────────────────────────
    const totalSlots = days * mealsPerDay;
    const plan: PlanMeal[] = [];
    const usedIds = new Set<string>();

    const recentCuisines: string[] = [];
    const recentIngredients = new Set<string>();

    const getRecipeMainIngredients = (recipe: any): string[] => {
      return recipe.ingredients
        .map((ri: any) => ri.ingredient.canonicalName.toLowerCase())
        .slice(0, 3);
    };

    // ── 4a. AI Agent: LLM freely suggests 5 recipes per slot ──────────────
    let aiFilledSlots = 0;
    if (process.env.GROQ_API_KEY) {
      try {
        const Groq = (await import('groq-sdk')).default;
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        // Calculate per-meal budget tier for smart repetition
        const perMealBudget = budgetInr / totalSlots;
        let repetitionInstruction = '';
        if (perMealBudget < 80) {
          repetitionInstruction = `BUDGET TIER: TIGHT (₹${Math.round(perMealBudget)}/meal). Repeat affordable base meals (dal, rice, roti, sabzi, dosa) across 2-3 days to save money. Vary only the side dish or preparation style. Keep it practical for a middle-class family.`;
        } else if (perMealBudget <= 150) {
          repetitionInstruction = `BUDGET TIER: MODERATE (₹${Math.round(perMealBudget)}/meal). You can repeat 2-3 staple meals across the week but ensure variety in breakfast and at least 3-4 unique dinners.`;
        } else {
          repetitionInstruction = `BUDGET TIER: PREMIUM (₹${Math.round(perMealBudget)}/meal). Maximize variety. No repetition needed. Include premium dishes like biryani, paneer specialties, kebabs.`;
        }

        // Build slot list
        const slotsNeeded: { day: number; slot: string }[] = [];
        for (let day = 0; day < days; day++) {
          for (let meal = 0; meal < mealsPerDay; meal++) {
            slotsNeeded.push({ day: day + 1, slot: mealSlots[meal % mealSlots.length] });
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

        const systemPrompt = `You are an expert global culinary meal planner and nutritionist optimizing for a ₹${budgetInr} budget over ${days} days.

${repetitionInstruction}

For EACH meal slot, suggest exactly 5 well-known recipe names as options.
The system will pick the best available one from each set of 5.

STRICT RULES:
1. Diet: ${dietLabel}. ${dietPref === 'VEG' ? 'ABSOLUTELY NO eggs, chicken, mutton, fish, prawns, or any non-veg ingredient.' : ''}
2. ${userAllergyNames.length > 0 ? `AVOID recipes with: ${userAllergyNames.join(', ')}` : 'No allergies.'}
3. ${userPreferredNames.length > 0 ? `PRIORITIZE recipes using: ${userPreferredNames.join(', ')}` : ''}
4. ${cuisineGroupFilter ? `Focus specifically on ${cuisineGroupFilter} cuisine.` : 'Mix various global and local cuisines for maximum variety.'}
5. Provide an all-round, highly nutritional, balanced diet (macro and micro nutrients). Do not skew towards just one type of food.
6. Breakfast: light items. Lunch/Dinner: full, balanced meals.
7. When repeating meals for budget, use the same recipe name in multiple slots.

Return ONLY valid JSON:
{"meals":[{"day":1,"slot":"Breakfast","options":["Recipe1","Recipe2","Recipe3","Recipe4","Recipe5"]}]}`;

        const userPrompt = prompt 
          ? `User request: ${prompt}\n\nStrictly follow the user's specific request above.` 
          : `User request: (None given). Please provide a completely well-rounded, balanced, and diverse nutritional plan within budget.`;

        const completion = await groq.chat.completions.create({
          model:'openai/gpt-oss-120b',
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
        const aiMeals: { day: number; slot: string; options: string[] }[] = parsed.meals || [];

        console.log(`[BudgetPlanner] AI returned ${aiMeals.length} slot suggestions (budget tier: ₹${Math.round(budgetInr / totalSlots)}/meal)`);

        for (const aiMeal of aiMeals) {
          const dayIndex = aiMeal.day - 1;
          if (dayIndex < 0 || dayIndex >= days) continue;

          // Fuzzy-match all 5 options against our pool
          const options = (aiMeal.options || []).slice(0, 5);
          const matchResults = fuzzyMatchRecipeNames(options, pool);

          // Pick the first match that passes verification
          let placed = false;
          for (const mr of matchResults) {
            if (!mr.matchedRecipe) continue;

            const costedMatch = costedRecipes.find(c => c.recipe.id === mr.matchedRecipe!.id);
            if (!costedMatch) continue;

            // Agentic verification: diet + allergy check
            const candidate = {
              recipe: costedMatch.recipe,
              estimatedCost: costedMatch.estimatedCost,
              dayIndex,
              mealSlot: aiMeal.slot
            };
            const { verified } = verifyAssignments([candidate], dietPref, allergicIngredientIds);

            if (verified.length > 0) {
              plan.push(verified[0]);
              usedIds.add(costedMatch.recipe.id);
              aiFilledSlots++;
              console.log(`[BudgetPlanner] AI → Day ${aiMeal.day} ${aiMeal.slot}: "${mr.candidateName}" → "${costedMatch.recipe.name}" (${mr.tier}) ✅`);
              placed = true;
              break;
            } else {
              console.log(`[BudgetPlanner] AI → Day ${aiMeal.day} ${aiMeal.slot}: "${mr.candidateName}" → "${costedMatch.recipe.name}" REJECTED by verification`);
            }
          }
          if (!placed) {
            console.log(`[BudgetPlanner] AI → Day ${aiMeal.day} ${aiMeal.slot}: no valid match from ${options.length} options, will use deterministic`);
          }
        }

        console.log(`[BudgetPlanner] AI filled ${aiFilledSlots}/${totalSlots} slots`);
      } catch (err: any) {
        console.error('[BudgetPlanner] AI agent failed, falling back to deterministic:', err?.message || err);
      }
    }

    // ── 5b. Deterministic fallback: fill any remaining unfilled slots ──────
    const filledSlotKeys = new Set(plan.map(p => `${p.dayIndex}-${p.mealSlot}`));

    for (let day = 0; day < days; day++) {
      for (let meal = 0; meal < mealsPerDay; meal++) {
        const mealSlotName = mealSlots[meal % mealSlots.length];
        if (filledSlotKeys.has(`${day}-${mealSlotName}`)) continue; // AI already filled

        const slotPool = getSlotCandidates(mealSlotName);
        const candidates = slotPool
          .filter(c => !usedIds.has(c.recipe.id))
          .map(c => {
            let penalty = 0;
            const cuisineGroup = c.recipe.cuisineRegion?.regionGroup?.name;
            if (cuisineGroup && recentCuisines.includes(cuisineGroup)) penalty += 15;
            const mainIngs = getRecipeMainIngredients(c.recipe);
            const dupCount = mainIngs.filter(ing => recentIngredients.has(ing)).length;
            penalty += dupCount * 20;
            return { ...c, adjustedScore: c.prefScore - penalty };
          })
          .sort((a, b) => b.adjustedScore - a.adjustedScore);

        if (candidates.length > 0) {
          const chosen = candidates[Math.floor(Math.random() * Math.min(5, candidates.length))];
          plan.push({
            recipe: chosen.recipe,
            estimatedCost: chosen.estimatedCost,
            dayIndex: day,
            mealSlot: mealSlotName
          });
          usedIds.add(chosen.recipe.id);

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
        }
      }
    }

    // ── 6. Two-Pass Budget Refinement Loop ────────────────────────────────
    const calculateTotalCost = (pList: PlanMeal[]) => {
      const ingredientTotalQty: Record<string, { qty: number; unit: string; catalogItem: any }> = {};
      for (const meal of pList) {
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
      return Math.max(aggregatedTotalCost, 30);
    };

    let totalEstCost = calculateTotalCost(plan);
    let refinementIterations = 0;

    while (totalEstCost > budgetInr && refinementIterations < 15) {
      refinementIterations++;
      let maxCostIdx = -1;
      let maxCost = -1;
      for (let i = 0; i < plan.length; i++) {
        if (plan[i].estimatedCost > maxCost) {
          maxCost = plan[i].estimatedCost;
          maxCostIdx = i;
        }
      }

      if (maxCostIdx === -1) break;

      const targetMeal = plan[maxCostIdx];
      const slotPool = getSlotCandidates(targetMeal.mealSlot);

      const cheapestAlternatives = slotPool
        .filter(c => !usedIds.has(c.recipe.id))
        .sort((a, b) => a.estimatedCost - b.estimatedCost);

      if (cheapestAlternatives.length > 0) {
        const replacement = cheapestAlternatives[0];
        usedIds.delete(targetMeal.recipe.id);
        usedIds.add(replacement.recipe.id);

        plan[maxCostIdx] = {
          recipe: replacement.recipe,
          estimatedCost: replacement.estimatedCost,
          dayIndex: targetMeal.dayIndex,
          mealSlot: targetMeal.mealSlot
        };
        totalEstCost = calculateTotalCost(plan);
      } else {
        break;
      }
    }

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
      aiSummary: '',
    };

    // ── 6. Generate AI summary with nutrition tips ──────────────────────────
    try {
      result.aiSummary = await this.generatePlanSummary(result.plan, budgetInr, dietPref, days);
    } catch (err: any) {
      console.error('[BudgetPlanner] AI summary generation failed:', err?.message || err);
      result.aiSummary = '';
    }

    // ── 7. Persist to DB if authenticated ─────────────────────────────────
    if (userId && saveToDb) {
      const saved = await prisma.budgetPlan.create({
        data: { userId, budgetInr, dietPref, days, mealsPerDay, generatedPlan: JSON.stringify(result) }
      });
      return { ...result, planId: saved.id };
    }

    return result;
  }

  private async generatePlanSummary(
    plan: any[],
    budget: number,
    diet: string,
    days: number
  ): Promise<string> {
    if (!process.env.GROQ_API_KEY) return '';

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const mealSummary = plan.map(p =>
      `Day ${p.dayIndex + 1} ${p.mealSlot}: ${p.recipe.name} (₹${p.estimatedCost}, ${p.recipe.ingredientCount} ingredients)`
    ).join('\n');

    const completion = await groq.chat.completions.create({
     model:'openai/gpt-oss-120b',
      messages: [
        {
          role: 'system',
          content: `You are a nutritionist analyzing a ${diet} Indian meal plan for a ₹${budget} weekly budget across ${days} days. Give a concise 3-4 line analysis covering:
1. Nutritional balance assessment (protein, carbs, vitamins)
2. Any dietary gaps or repetitive ingredients you notice
3. One specific money-saving tip based on the actual meals listed
Be specific to these meals, not generic advice. Use a friendly tone with relevant emojis.`
        },
        { role: 'user', content: mealSummary }
      ],
      temperature: 0.5,
      max_tokens: 250,
    });

    return completion.choices[0]?.message?.content || '';
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
