import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { BudgetPlannerService } from './modules/budget/budget-planner.service';
import { WeeklyPlannerService } from './modules/weekly/weekly-planner.service';
import { handleBotChat } from './modules/bot/bot.service';
import { parseExtrasAndMatch } from './modules/cart/ai-extras.service';
import { ingestRecipesFromCsv, ingestCatalogFromXlsx } from './modules/admin/upload.service';
import { registerUser, loginUser, getUserProfile, updateUserProfile } from './modules/auth/auth.service';
import { requireAuth, optionalAuth, AuthRequest } from './modules/auth/auth.middleware';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const prisma = new PrismaClient();
const upload = multer({ dest: path.join(__dirname, '../tmp/') });

// ─────────────────────────────────────────────────────────
// AUTH — Register / Login / Profile
// ─────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await registerUser(email, password, name);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const result = await loginUser(email, password);
    res.json(result);
  } catch (e: any) {
    res.status(401).json({ error: e.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = await getUserProfile(req.userId!);
    res.json(profile);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.patch('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updated = await updateUserProfile(req.userId!, req.body);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// USER PREFERENCES — Allergies, Ingredient Prefs, Brands
// ─────────────────────────────────────────────────────────

// Get all preferences for current user
app.get('/api/preferences', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        budget: true, familySize: true, dietTypePref: true, defaultPriceTier: true,
        cuisinePref: true,
        ingredientPrefs: { include: { ingredient: { select: { id: true, canonicalName: true, category: true } } } },
        brandPrefs: true,
      }
    });
    res.json(user);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Upsert core prefs (budget, family, diet, priceTier, cuisinePref)
app.put('/api/preferences', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { budget, familySize, dietTypePref, defaultPriceTier, cuisinePref } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(budget !== undefined ? { budget: Number(budget) } : {}),
        ...(familySize !== undefined ? { familySize: Number(familySize) } : {}),
        ...(dietTypePref ? { dietTypePref } : {}),
        ...(defaultPriceTier ? { defaultPriceTier } : {}),
        ...(cuisinePref !== undefined ? { cuisinePref } : {}),
      },
      select: { budget: true, familySize: true, dietTypePref: true, defaultPriceTier: true, cuisinePref: true }
    });
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Add or update ingredient preference (ALLERGIC / DISLIKED / PREFERRED)
app.post('/api/preferences/ingredients', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { ingredientName, type } = req.body; // type: ALLERGIC | DISLIKED | PREFERRED
    if (!ingredientName || !type) return res.status(400).json({ error: 'ingredientName and type required' });

    // Find or create ingredient
    const ingredient = await prisma.ingredient.upsert({
      where: { canonicalName: ingredientName.toLowerCase().trim() },
      update: {},
      create: { canonicalName: ingredientName.toLowerCase().trim(), category: 'general', dietType: 'VEG', defaultUnit: 'unit' }
    });

    const pref = await prisma.userIngredientPreference.upsert({
      where: { userId_ingredientId: { userId: req.userId!, ingredientId: ingredient.id } },
      update: { type },
      create: { userId: req.userId!, ingredientId: ingredient.id, type }
    });
    res.json({ ...pref, ingredientName: ingredient.canonicalName });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Remove ingredient preference
app.delete('/api/preferences/ingredients/:ingredientId', requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.userIngredientPreference.deleteMany({
      where: { userId: req.userId!, ingredientId: req.params.ingredientId }
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Add brand preference
app.post('/api/preferences/brands', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { brandName } = req.body;
    if (!brandName) return res.status(400).json({ error: 'brandName required' });
    const pref = await prisma.userBrandPreference.upsert({
      where: { userId_brandName: { userId: req.userId!, brandName: brandName.trim() } },
      update: {},
      create: { userId: req.userId!, brandName: brandName.trim() }
    });
    res.json(pref);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Remove brand preference
app.delete('/api/preferences/brands/:brandName', requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.userBrandPreference.deleteMany({
      where: { userId: req.userId!, brandName: decodeURIComponent(req.params.brandName) }
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// RECIPES — fetch all with grouping relations + pagination
// ─────────────────────────────────────────────────────────
app.get('/api/recipes', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || '';
    const cuisine = (req.query.cuisine as string) || '';
    const diet = (req.query.diet as string) || '';
    const course = (req.query.course as string) || '';

    const where: any = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (diet) where.dietType = diet;
    if (cuisine) where.cuisineRegion = { regionGroup: { name: { contains: cuisine, mode: 'insensitive' } } };
    if (course) where.dishType = { name: { contains: course, mode: 'insensitive' } };

    const [recipes, total] = await Promise.all([
      prisma.recipe.findMany({
        where,
        include: {
          cuisineRegion: { include: { regionGroup: true } },
          dishType: true,
          ingredients: { include: { ingredient: true }, take: 20 }
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recipe.count({ where })
    ]);

    res.json({ recipes, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recipes/:id', async (req, res) => {
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { id: req.params.id },
      include: {
        cuisineRegion: { include: { regionGroup: true } },
        dishType: true,
        ingredients: { include: { ingredient: { include: { catalogItems: { where: { isAvailable: true }, orderBy: { priceInr: 'asc' }, take: 1 } } } } }
      }
    });
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(recipe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/region-groups', async (req, res) => {
  try {
    const groups = await prisma.regionGroup.findMany({
      include: { regions: { select: { name: true } } },
      orderBy: { name: 'asc' }
    });
    res.json(groups);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// MANUAL GROCERY LIST — persistent per user
// ─────────────────────────────────────────────────────────
app.get('/api/manual-list', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) return res.json([]);
    const items = await prisma.manualListItem.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/manual-list', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, qty, unit } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const item = await prisma.manualListItem.create({
      data: { userId: req.userId!, name: name.trim(), qty: qty || 1, unit: unit || 'pcs' }
    });
    res.json(item);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/manual-list/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, qty, unit, checked } = req.body;
    const item = await prisma.manualListItem.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(qty !== undefined ? { qty } : {}),
        ...(unit !== undefined ? { unit } : {}),
        ...(checked !== undefined ? { checked } : {}),
      }
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/manual-list/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.manualListItem.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/manual-list', requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.manualListItem.deleteMany({ where: { userId: req.userId } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// BUDGET PLANNER — now auth-aware with real pricing
// ─────────────────────────────────────────────────────────
app.post('/api/budget-plans', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { budgetInr, dietPref, days, mealsPerDay, priceTier, cuisineGroupFilter } = req.body;
    const planner = new BudgetPlannerService();
    const result = await planner.planBudget(
      req.userId || null,
      budgetInr,
      dietPref,
      days,
      mealsPerDay,
      priceTier || 'MIXED',
      true, // saveToDb
      cuisineGroupFilter
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch user's past budget plans
app.get('/api/budget-plans', requireAuth, async (req: AuthRequest, res) => {
  try {
    const planner = new BudgetPlannerService();
    const plans = await planner.getUserPlans(req.userId!);
    res.json(plans);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// WEEKLY PLANNER — upgraded with DB-first + variety logic
// ─────────────────────────────────────────────────────────
app.post('/api/weekly-plans', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { dietPref, days, mealsPerDay, cuisineGroupFilter, maxPrepMinutes } = req.body;
    const planner = new WeeklyPlannerService();
    const result = await planner.generateWeeklyPlan(req.userId || null, {
      dietPref: dietPref || 'VEG',
      days: days || 7,
      mealsPerDay: mealsPerDay || 3,
      cuisineGroupFilter,
      maxPrepMinutes,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/weekly-plans', requireAuth, async (req: AuthRequest, res) => {
  try {
    const planner = new WeeklyPlannerService();
    const plans = await planner.getUserWeeklyPlans(req.userId!);
    res.json(plans);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────
// AI RECIPE BOT (Groq-powered) — now passes user prefs
// ─────────────────────────────────────────────────────────
app.post('/api/bot/chat', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { message, preferences } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ reply: '⚠️ GROQ_API_KEY is not set in apps/api/.env — please add it to enable the AI bot.', suggestions: [] });
    }

    let mergedPrefs = preferences || {};
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        include: { ingredientPrefs: { include: { ingredient: true } }, brandPrefs: true }
      });
      if (user) {
        const allergies = user.ingredientPrefs.filter(p => p.type === 'ALLERGIC').map(p => p.ingredient.canonicalName);
        const preferred = user.ingredientPrefs.filter(p => p.type === 'PREFERRED').map(p => p.ingredient.canonicalName);
        mergedPrefs = { ...mergedPrefs, diet: user.dietTypePref || mergedPrefs.diet, allergies, preferredIngredients: preferred };
      }
    }

    const result = await handleBotChat(message, mergedPrefs);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ reply: `Error: ${error.message}`, suggestions: [] });
  }
});

// ─────────────────────────────────────────────────────────
// AI CART EXTRAS
// ─────────────────────────────────────────────────────────
app.post('/api/cart/parse-extras', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ matched: [], unmatched: ['GROQ_API_KEY not set'] });
    }

    let brandPrefs: string[] = [];
    if (req.userId) {
      const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { brandPrefs: true } });
      if (user) brandPrefs = user.brandPrefs.map(b => b.brandName);
    }
    const result = await parseExtrasAndMatch(text, req.body.brandPrefs || brandPrefs);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ matched: [], unmatched: [], error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// ADMIN — Upload recipes CSV / catalog
// ─────────────────────────────────────────────────────────
app.post('/api/admin/upload/recipes', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const count = await ingestRecipesFromCsv(req.file.path);
    res.json({ success: true, count, message: `${count} recipes ingested successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/upload/catalog', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const count = await ingestCatalogFromXlsx(req.file.path);
    res.json({ success: true, count, message: `${count} catalog items ingested successfully.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// CART CHECKOUT (stub)
// ─────────────────────────────────────────────────────────
app.post('/api/cart/checkout', (req, res) => {
  res.json({ message: 'Checkout successful' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

export default app;
