import { prisma } from '../../lib/prisma';
import { CatalogItem, PriceTier } from '@prisma/client';

export class PricingEngineService {

  async getCatalogOptions(ingredientId: string): Promise<CatalogItem[]> {
    return prisma.catalogItem.findMany({
      where: { ingredientId, isAvailable: true }
    });
  }

  async buildBaskets(cartIngredients: { ingredientId: string; quantity: number }[], userId: string) {
    // ── Load user context from DB ──────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        ingredientPrefs: true,
        brandPrefs: true,
      }
    });
    if (!user) throw new Error('User not found');

    const allergicIngredientIds = user.ingredientPrefs
      .filter(p => p.type === 'ALLERGIC').map(p => p.ingredientId);
    const preferredIngredientIds = user.ingredientPrefs
      .filter(p => p.type === 'PREFERRED').map(p => p.ingredientId);
    const preferredBrands = user.brandPrefs.map(b => b.brandName.toLowerCase());

    const options = await Promise.all(cartIngredients.map(async (ci) => {
      const catalogOptions = await this.getCatalogOptions(ci.ingredientId);
      return {
        ...ci,
        catalogOptions: catalogOptions.filter(o => !allergicIngredientIds.includes(o.ingredientId))
      };
    }));

    const cheapestBasket    = options.map(o => this.pickByLowestUnitPrice(o.catalogOptions));
    const highRatedBasket   = options.map(o => this.pickByBayesianRating(o.catalogOptions));
    const mixedBasket       = options.map(o => this.pickByScore(o.catalogOptions, 0.5, 0.5));
    const prefBasket        = options.map(o =>
      this.pickByBrandAndPreference(o.catalogOptions, preferredBrands, preferredIngredientIds, mixedBasket[options.indexOf(o)])
    );

    return {
      cheapest:   this.summarize(cheapestBasket),
      highRated:  this.summarize(highRatedBasket),
      mixed:      this.summarize(mixedBasket),
      preference: this.summarize(prefBasket),
      userContext: {
        allergies: allergicIngredientIds.length,
        preferredBrands,
        priceTier: user.defaultPriceTier,
      }
    };
  }

  private pickByLowestUnitPrice(options: CatalogItem[]) {
    if (!options.length) return null;
    return [...options].sort((a, b) => (a.priceInr / a.packSize) - (b.priceInr / b.packSize))[0];
  }

  private pickByBayesianRating(options: CatalogItem[]) {
    if (!options.length) return null;
    const C = 4.0, m = 20;
    return [...options].sort((a, b) => {
      const scoreA = (a.numRatings * a.rating + m * C) / (a.numRatings + m);
      const scoreB = (b.numRatings * b.rating + m * C) / (b.numRatings + m);
      return scoreB - scoreA;
    })[0];
  }

  private pickByScore(options: CatalogItem[], weightPrice: number, weightRating: number) {
    if (!options.length) return null;
    const maxPrice = Math.max(...options.map(o => o.priceInr / o.packSize), 1);
    return [...options].sort((a, b) => {
      const unitA = a.priceInr / a.packSize;
      const unitB = b.priceInr / b.packSize;
      const scoreA = weightRating * (a.rating / 5) - weightPrice * (unitA / maxPrice);
      const scoreB = weightRating * (b.rating / 5) - weightPrice * (unitB / maxPrice);
      return scoreB - scoreA;
    })[0];
  }

  private pickByBrandAndPreference(
    options: CatalogItem[],
    preferredBrands: string[],
    preferredIngredientIds: string[],
    fallback: CatalogItem | null
  ) {
    if (!options.length) return null;

    // First: preferred brand match
    if (preferredBrands.length > 0) {
      const brandMatches = options.filter(o => preferredBrands.includes(o.brandName.toLowerCase()));
      if (brandMatches.length > 0) return this.pickByBayesianRating(brandMatches);
    }

    // Second: preferred ingredient match
    const preferredOptions = options.filter(o => preferredIngredientIds.includes(o.ingredientId));
    if (preferredOptions.length > 0) return this.pickByBayesianRating(preferredOptions);

    return fallback;
  }

  private summarize(basket: (CatalogItem | null)[]) {
    const validItems = basket.filter(Boolean) as CatalogItem[];
    const totalCost = validItems.reduce((sum, item) => sum + item.priceInr, 0);
    return { items: validItems, totalCost };
  }
}
