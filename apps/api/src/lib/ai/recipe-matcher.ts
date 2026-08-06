/**
 * 3-tier fuzzy recipe name matcher + agentic verification layer.
 *
 * Reuses the proven matching strategy from bot.service.ts:
 *   Tier 1 — Exact case-insensitive match
 *   Tier 2 — Multi-keyword AND match (all significant words must appear)
 *   Tier 3 — Single-keyword contains match
 *
 * The verification layer acts as a strict guard:
 *   - VEG users: ONLY VEG recipes (zero tolerance)
 *   - EGG users: VEG + EGG (no meat/fish)
 *   - NON_VEG users: everything allowed (mixed diet is fine)
 *   - Allergy check: scans ingredient IDs against user's allergy list
 *
 * Works against an in-memory pool so the caller can pre-filter by diet,
 * allergies, cuisine, etc.  Never invents recipes.
 */

const STOP_WORDS = new Set([
  'healthy', 'quick', 'easy', 'style', 'recipe', 'indian', 'best',
  'simple', 'classic', 'homemade', 'delicious', 'spicy', 'with', 'and',
  'the', 'for', 'sweet', 'fresh', 'traditional', 'authentic', 'special',
  'tasty', 'yummy', 'famous', 'popular',
]);

export interface PoolRecipe {
  id: string;
  name: string;
  [key: string]: any;          // allows the full Prisma recipe object
}

export interface MatchResult {
  candidateName: string;       // what the LLM suggested
  matchedRecipe: PoolRecipe | null;
  tier: 'exact' | 'fuzzy-multi' | 'fuzzy-single' | 'none';
}

/**
 * Given an array of candidate recipe names (from the LLM) and an array of
 * pool recipes (from the DB), returns one MatchResult per candidate.
 *
 * Guarantees:
 *  - Every returned matchedRecipe exists in `pool`
 *  - No pool recipe is matched twice (first-come-first-served)
 */
export function fuzzyMatchRecipeNames(
  candidateNames: string[],
  pool: PoolRecipe[],
): MatchResult[] {
  const results: MatchResult[] = [];
  const usedIds = new Set<string>();

  // Build a lowercase lookup map for the pool
  const poolByLower = new Map<string, PoolRecipe>();
  for (const r of pool) {
    const key = r.name.toLowerCase().trim();
    if (!poolByLower.has(key)) poolByLower.set(key, r);
  }

  for (const candidate of candidateNames) {
    const cleanName = candidate.replace(/\[NEW\]\s*/gi, '').trim();
    if (!cleanName) {
      results.push({ candidateName: candidate, matchedRecipe: null, tier: 'none' });
      continue;
    }

    // ── Tier 1: exact case-insensitive ────────────────────────────────────
    const exactKey = cleanName.toLowerCase().trim();
    const exactMatch = poolByLower.get(exactKey);
    if (exactMatch && !usedIds.has(exactMatch.id)) {
      usedIds.add(exactMatch.id);
      results.push({ candidateName: candidate, matchedRecipe: exactMatch, tier: 'exact' });
      continue;
    }

    // ── Tier 2 & 3: keyword-based fuzzy ──────────────────────────────────
    const words = cleanName
      .toLowerCase()
      .split(/\s+/)
      .filter(w => !STOP_WORDS.has(w) && w.length > 2);

    let matched: PoolRecipe | null = null;
    let tier: MatchResult['tier'] = 'none';

    if (words.length >= 2) {
      // Multi-keyword: every significant word must appear in the recipe name
      matched = pool.find(r => {
        if (usedIds.has(r.id)) return false;
        const lower = r.name.toLowerCase();
        return words.every(w => lower.includes(w));
      }) || null;
      if (matched) tier = 'fuzzy-multi';
    }

    if (!matched && words.length >= 1) {
      // Single-keyword: first pool recipe whose name contains the word
      const keyword = words[0];
      matched = pool.find(r => {
        if (usedIds.has(r.id)) return false;
        return r.name.toLowerCase().includes(keyword);
      }) || null;
      if (matched) tier = 'fuzzy-single';
    }

    if (matched) {
      usedIds.add(matched.id);
    }

    results.push({ candidateName: candidate, matchedRecipe: matched, tier });
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agentic Verification Layer
// ─────────────────────────────────────────────────────────────────────────────

const DIET_HIERARCHY: Record<string, string[]> = {
  'VEG':     ['VEG'],                        // strict: only VEG
  'EGG':     ['VEG', 'EGG'],                 // VEG + EGG allowed
  'NON_VEG': ['VEG', 'EGG', 'NON_VEG'],     // everything allowed (mixed diet)
};

/**
 * Returns true if `recipeDiet` is compatible with the user's `userDiet`.
 * VEG is strict (zero tolerance). NON_VEG is loose (mixed diet ok).
 */
export function isDietCompatible(recipeDiet: string, userDiet: string): boolean {
  const allowed = DIET_HIERARCHY[userDiet] || DIET_HIERARCHY['NON_VEG'];
  return allowed.includes(recipeDiet);
}

/**
 * Agentic verification pass: given AI-selected assignments and user constraints,
 * rejects any assignment that violates diet type or contains allergic ingredients.
 *
 * Returns only the assignments that pass ALL checks. Rejected ones get logged
 * and their slots will be filled by the deterministic fallback.
 */
export function verifyAssignments<T extends { recipe: any }>(
  assignments: T[],
  userDiet: string,
  allergicIngredientIds: string[],
): { verified: T[]; rejected: { assignment: T; reason: string }[] } {
  const verified: T[] = [];
  const rejected: { assignment: T; reason: string }[] = [];

  for (const a of assignments) {
    const recipe = a.recipe;

    // ── Check 1: Diet compatibility ─────────────────────────────────────
    if (!isDietCompatible(recipe.dietType, userDiet)) {
      const reason = `Diet violation: recipe "${recipe.name}" is ${recipe.dietType} but user requires ${userDiet}`;
      console.warn(`[Verify] REJECTED — ${reason}`);
      rejected.push({ assignment: a, reason });
      continue;
    }

    // ── Check 2: Allergy check (scan ingredient IDs) ────────────────────
    if (allergicIngredientIds.length > 0) {
      const recipeIngIds: string[] = (recipe.ingredients || []).map(
        (ri: any) => ri.ingredientId || ri.ingredient?.id
      ).filter(Boolean);

      const allergyHit = recipeIngIds.find(id => allergicIngredientIds.includes(id));
      if (allergyHit) {
        const allergyName = (recipe.ingredients || []).find(
          (ri: any) => (ri.ingredientId || ri.ingredient?.id) === allergyHit
        )?.ingredient?.canonicalName || allergyHit;
        const reason = `Allergy violation: recipe "${recipe.name}" contains allergic ingredient "${allergyName}"`;
        console.warn(`[Verify] REJECTED — ${reason}`);
        rejected.push({ assignment: a, reason });
        continue;
      }
    }

    // ── All checks passed ───────────────────────────────────────────────
    verified.push(a);
  }

  console.log(`[Verify] ${verified.length} passed, ${rejected.length} rejected out of ${assignments.length}`);
  return { verified, rejected };
}
