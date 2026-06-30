# Recipe-to-Cart v2 — Upgraded

## What's New in This Version

### ✅ Authentication System
- JWT-based register/login (no bcrypt dependency — uses Node's built-in `crypto`)
- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` · `PATCH /api/auth/me`
- Frontend: `/auth` page with sign-in / register toggle
- Navbar shows logged-in user name + Sign Out button
- Demo user seeded: **demo@royal.com / demo123**

### ✅ User Preferences — Persistent & Synced to DB
- **Allergies** → stored as `UserIngredientPreference` with type `ALLERGIC` in DB
- **Disliked ingredients** → type `DISLIKED`
- **Preferred ingredients** → type `PREFERRED`
- **Brand preferences** → stored in `UserBrandPreference` table
- **Budget, family size, diet, price tier** → stored on `User` row
- All synced to server on login; saved to localStorage when logged out
- API: `GET/PUT /api/preferences`, `POST/DELETE /api/preferences/ingredients`, `POST/DELETE /api/preferences/brands`

### ✅ Improved Budget Engine
- **Real catalog pricing** — uses actual `CatalogItem` prices instead of mocked ₹50/ingredient
- **Price tier selection** — CHEAPEST / MIXED / HIGH_RATED / PREFERENCE (brand-aware)
- **DB-first caching** — returns existing plan from DB if same params used within 24h (avoids redundant computation)
- **Allergy filtering** — excludes recipes with allergic ingredients at query level
- **Brand-aware basket** — PREFERENCE tier picks catalog items from user's preferred brands
- Saved to `BudgetPlan` table per user for history

### ✅ New Weekly Planner Engine
- Fully upgraded from stub → real engine at `WeeklyPlannerService`
- **Variety scoring** — no recipe repeated; dish-type-aware slot assignment (breakfast recipes go to Breakfast slot)
- **DB-first** — returns cached plan if generated within 12h with same params
- **Preference boosting** — recipes using preferred ingredients rank higher
- **Allergy exclusion** — at DB query level
- **Brand-aware cost** — estimates cost using preferred brands when computing total
- Saves to `WeeklyPlan` + `WeeklyPlanOption` tables

### ✅ Persistent Manual List
- Moved from in-memory `Record<>` to `ManualListItem` DB table
- Requires auth; items persist across sessions and devices

### ✅ Schema Additions
- `User.name`, `User.budget`, `User.familySize` fields added
- `UserBrandPreference` model — `(userId, brandName)` unique
- `ManualListItem` model — persistent grocery list per user

### ✅ Improved Pricing Engine
- `buildBaskets()` now reads `brandPrefs` and `ingredientPrefs` from DB
- `pickByBrandAndPreference()` — first matches preferred brands, then preferred ingredients

---

## Setup & Run

### 1. Prerequisites
- Node 18+, PostgreSQL running

### 2. Environment Files
Create `apps/api/.env`:
```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/recipe_to_cart"
GROQ_API_KEY=your_groq_key_here
JWT_SECRET=your-secret-key-change-in-production
PORT=4000
```

Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Install & Migrate
```bash
# Install all deps
cd apps/api && npm install
cd ../web && npm install
cd ../../db && npm install

# Run DB migration
cd db
npx prisma migrate dev --name "v2-auth-prefs-brands"

# OR push schema directly (dev only)
npx prisma db push
```

### 4. Seed the Database
```bash
cd apps/api

# Seed sample data + demo user (fast)
npm run seed

# Seed full 6800+ recipes from CSV (place recipes_clean.csv at project root first)
npm run seed:csv
```

### 5. Run
```bash
# Terminal 1 — API
cd apps/api && npm run dev

# Terminal 2 — Web
cd apps/web && npm run dev
```

Open http://localhost:3000

### Demo Login
- Email: `demo@royal.com`
- Password: `demo123`

---

## API Reference (New Endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login, get JWT |
| GET | `/api/auth/me` | ✅ | Get own profile |
| PATCH | `/api/auth/me` | ✅ | Update profile |
| GET | `/api/preferences` | ✅ | All preferences |
| PUT | `/api/preferences` | ✅ | Update budget/diet/family |
| POST | `/api/preferences/ingredients` | ✅ | Add allergy/dislike/prefer |
| DELETE | `/api/preferences/ingredients/:id` | ✅ | Remove ingredient pref |
| POST | `/api/preferences/brands` | ✅ | Add brand preference |
| DELETE | `/api/preferences/brands/:name` | ✅ | Remove brand preference |
| POST | `/api/budget-plans` | optional | Generate budget plan |
| GET | `/api/budget-plans` | ✅ | User's past plans |
| POST | `/api/weekly-plans` | optional | Generate weekly plan |
| GET | `/api/weekly-plans` | ✅ | User's past weekly plans |
| GET | `/api/manual-list` | optional | Persistent grocery list |
| POST | `/api/manual-list` | ✅ | Add item |
| PATCH | `/api/manual-list/:id` | ✅ | Update item |
| DELETE | `/api/manual-list/:id` | ✅ | Remove item |
