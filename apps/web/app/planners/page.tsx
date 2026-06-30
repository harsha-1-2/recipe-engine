'use client';
import { useState, useEffect } from 'react';
import { usePreferences } from '../preferences-context';
import { useAuth } from '../auth-context';
import { useCart } from '../cart-context';
import { API_URL } from '../config';

const API = API_URL;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function PlannersPage() {
  const prefs = usePreferences();
  const { user, token, isLoggedIn } = useAuth();
  const { addToCart, removeFromCart, cart } = useCart();
  // Budget Plan state
  const [budget, setBudget] = useState(prefs.budget);
  const [days, setDays] = useState(7);
  const [meals, setMeals] = useState(3);
  const [diet, setDiet] = useState(prefs.diet);
  const [priceTier, setPriceTier] = useState(prefs.priceTier);
  const [cuisineGroupFilter, setCuisineGroupFilter] = useState('');
  const [budgetPlan, setBudgetPlan] = useState<any>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  // Weekly Plan state
  const [weeklyPlan, setWeeklyPlan] = useState<any[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyMeta, setWeeklyMeta] = useState<any>(null);

  // Active tab
  const [tab, setTab] = useState<'budget' | 'weekly'>('budget');

  const addAllRecipesToCart = (mealsList: any[]) => {
    if (!mealsList || mealsList.length === 0) return;
    let addedCount = 0;
    mealsList.forEach(meal => {
      if (meal.recipe && !cart.some((c: any) => c.id === meal.recipe.id)) {
        addToCart(meal.recipe);
        addedCount++;
      }
    });
    alert(`Successfully added ${addedCount} new recipe(s) to your cart!`);
  };

  const swapRecipe = async (tabName: 'budget' | 'weekly', dayIndex: number, mealSlot: string, currentRecipeId: string) => {
    try {
      const courseFilter = mealSlot.toLowerCase().includes('breakfast') ? 'Breakfast'
        : mealSlot.toLowerCase().includes('snack') ? 'Snack' : 'Main';

      const params = new URLSearchParams({
        diet: diet,
        course: courseFilter,
        limit: '15'
      });

      const res = await fetch(`${API}/api/recipes?${params}`);
      const data = await res.json();
      const recipesList = Array.isArray(data) ? data : (data.recipes || []);

      const usedIds = new Set<string>();
      if (tabName === 'budget') {
        budgetPlan.plan.forEach((m: any) => { if (m.recipe) usedIds.add(m.recipe.id); });
      } else {
        weeklyPlan.forEach((m: any) => { if (m.recipe) usedIds.add(m.recipe.id); });
      }

      const candidates = recipesList.filter((r: any) => r.id !== currentRecipeId && !usedIds.has(r.id));
      if (candidates.length === 0) {
        alert("No other alternative recipes found in the catalog for this slot.");
        return;
      }

      const nextRecipe = candidates[Math.floor(Math.random() * candidates.length)];
      const formattedRecipe = {
        id: nextRecipe.id,
        name: nextRecipe.name,
        dietType: nextRecipe.dietType,
        servesDefault: nextRecipe.servesDefault,
        cuisineRegion: nextRecipe.cuisineRegion,
        dishType: nextRecipe.dishType,
        ingredientCount: nextRecipe.ingredients?.length || 0,
        ingredients: nextRecipe.ingredients || []
      };

      if (tabName === 'budget') {
        setBudgetPlan((prev: any) => {
          if (!prev) return prev;
          const updatedPlan = prev.plan.map((m: any) => {
            if (m.dayIndex === dayIndex && m.mealSlot === mealSlot) {
              return { ...m, recipe: formattedRecipe };
            }
            return m;
          });
          return { ...prev, plan: updatedPlan };
        });
      } else {
        setWeeklyPlan((prev: any[]) => {
          return prev.map((m: any) => {
            if (m.dayIndex === dayIndex && m.mealSlot === mealSlot) {
              return { ...m, recipe: formattedRecipe };
            }
            return m;
          });
        });
      }
    } catch (err) {
      console.error("Failed to swap recipe:", err);
    }
  };

  useEffect(() => {
    setBudget(prefs.budget);
    setDiet(prefs.diet);
    setPriceTier(prefs.priceTier);
    setCuisineGroupFilter(prefs.cuisinePref || '');
  }, [prefs.budget, prefs.diet, prefs.priceTier, prefs.cuisinePref]);

  const authHeaders = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };

  const generateBudgetPlan = async () => {
    setBudgetLoading(true);
    try {
      const res = await fetch(`${API}/api/budget-plans`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ budgetInr: budget, dietPref: diet, days, mealsPerDay: meals, priceTier, cuisineGroupFilter })
      });
      const data = await res.json();
      setBudgetPlan(data);
    } catch (err) { console.error(err); }
    setBudgetLoading(false);
  };

  const generateWeeklyPlan = async () => {
    setWeeklyLoading(true);
    try {
      const res = await fetch(`${API}/api/weekly-plans`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ dietPref: diet, days, mealsPerDay: meals, cuisineGroupFilter })
      });
      const data = await res.json();
      setWeeklyPlan(data.weeklyPlan || []);
      setWeeklyMeta(data);
    } catch (err) { console.error(err); }
    setWeeklyLoading(false);
  };

  // Group weekly plan by day
  const byDay: Record<number, any[]> = {};
  for (const meal of weeklyPlan) {
    if (!byDay[meal.dayIndex]) byDay[meal.dayIndex] = [];
    byDay[meal.dayIndex].push(meal);
  }

  const dietLabel = { VEG: '🌱 Vegetarian', EGG: '🥚 Eggetarian', NON_VEG: '🍗 Non-Vegetarian' }[diet] || diet;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 0' }}>
      <div className="page-header">
        <span className="section-label">Planning</span>
        <h1>Smart Meal Planner</h1>
        <p>Generate budget-aware or weekly meal plans. {isLoggedIn ? '✅ Your allergies & brand preferences are applied automatically.' : '🔒 Sign in to apply your saved preferences.'}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--color-border)' }}>
        {(['budget', 'weekly'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '0.6rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent', color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)', marginBottom: '-2px', textTransform: 'capitalize', fontSize: '0.95rem' }}>
            {t === 'budget' ? '💰 Budget Planner' : '📅 Weekly Planner'}
          </button>
        ))}
      </div>

      {/* Shared Settings */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
          {tab === 'budget' && (
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Budget (₹)</label>
              <input type="range" min="500" max="10000" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
              <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-dark)' }}>₹ {budget.toLocaleString()}</div>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Diet</label>
            <select className="input-field" value={diet} onChange={e => setDiet(e.target.value)}>
              <option value="VEG">🌱 Vegetarian</option>
              <option value="EGG">🥚 Eggetarian</option>
              <option value="NON_VEG">🍗 Non-Vegetarian</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Days</label>
            <input className="input-field" type="number" min="1" max="30" value={days} onChange={e => setDays(Number(e.target.value))} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Meals/Day</label>
            <input className="input-field" type="number" min="1" max="5" value={meals} onChange={e => setMeals(Number(e.target.value))} />
          </div>
          {tab === 'budget' && (
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Price Tier</label>
              <select className="input-field" value={priceTier} onChange={e => setPriceTier(e.target.value)}>
                <option value="CHEAPEST">💰 Cheapest</option>
                <option value="MIXED">⚖️ Mixed</option>
                <option value="HIGH_RATED">⭐ High Rated</option>
                <option value="PREFERENCE">❤️ My Brands</option>
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.4rem' }}>Cuisine Region</label>
            <select className="input-field" value={cuisineGroupFilter} onChange={e => {
              const val = e.target.value;
              setCuisineGroupFilter(val);
              prefs.setCuisinePref(val);
              if (token) {
                fetch(`${API}/api/preferences`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ cuisinePref: val })
                }).catch(() => {});
              }
            }}>
              <option value="">No Preference</option>
              <option value="North Indian">🍛 North Indian</option>
              <option value="South Indian">🥥 South Indian</option>
            </select>
          </div>
        </div>
        {isLoggedIn && prefs.allergies.length > 0 && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#991b1b', background: '#fee2e2', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
            🚫 Excluding recipes with: {prefs.allergies.join(', ')}
          </div>
        )}
      </div>

      {/* Budget Planner Tab */}
      {tab === 'budget' && (
        <div>
          <button className="btn-primary" onClick={generateBudgetPlan} disabled={budgetLoading} style={{ marginBottom: '1.5rem', minWidth: '200px' }}>
            {budgetLoading ? '⏳ Calculating…' : '🎯 Generate Budget Plan'}
          </button>

          {budgetPlan && (
            <div>
              <div className="card" style={{ marginBottom: '1.5rem', borderTop: '4px solid var(--color-primary)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
                <div><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>₹ {budgetPlan.totalEstCost?.toFixed(0)}</div><div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Estimated Cost</div></div>
                <div><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>₹ {budgetPlan.saved?.toFixed(0) || 0}</div><div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Saved</div></div>
                <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{budgetPlan.plan?.length || 0}</div><div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Meals Planned</div></div>
              </div>
              {budgetPlan.cached && <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', background: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>✅ Loaded from your saved plan (same params, last 24h)</div>}

              <button className="btn-primary" style={{ width: '100%', marginBottom: '1.25rem' }}
                onClick={() => addAllRecipesToCart(budgetPlan.plan)}>
                🛒 Add All Plan Recipes to Cart
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {budgetPlan.plan?.map((meal: any, i: number) => {
                  const inCart = cart.some((c: any) => c.id === meal.recipe?.id);
                  return (
                    <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                            Day {meal.dayIndex + 1} · {meal.mealSlot}
                          </div>
                          <div style={{ fontWeight: 600 }}>{meal.recipe?.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {meal.recipe?.cuisineRegion?.name} · {meal.recipe?.ingredientCount} ingredients · serves {meal.recipe?.servesDefault}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--color-primary-dark)' }}>₹ {meal.estimatedCost?.toFixed(0)}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{meal.recipe?.dietType}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.6rem' }}>
                        {inCart ? (
                          <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', flex: 1, minHeight: 0 }}
                            onClick={() => removeFromCart(meal.recipe.id)}>
                            ✕ Remove from Cart
                          </button>
                        ) : (
                          <button className="btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', flex: 1, minHeight: 0 }}
                            onClick={() => meal.recipe && addToCart(meal.recipe)}>
                            🛒 Add to Cart
                          </button>
                        )}
                        <button className="btn-ghost" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', border: '1px solid var(--color-border)', flex: 1, minHeight: 0 }}
                          onClick={() => swapRecipe('budget', meal.dayIndex, meal.mealSlot, meal.recipe?.id)}>
                          🔄 Suggest Another
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="btn-secondary" onClick={() => setBudgetPlan(null)} style={{ marginTop: '1rem' }}>← Start Over</button>
            </div>
          )}
        </div>
      )}

      {/* Weekly Planner Tab */}
      {tab === 'weekly' && (
        <div>
          <button className="btn-primary" onClick={generateWeeklyPlan} disabled={weeklyLoading} style={{ marginBottom: '1.5rem', minWidth: '200px' }}>
            {weeklyLoading ? '⏳ Building Your Week…' : '📅 Generate Weekly Plan'}
          </button>

          {weeklyPlan.length > 0 && (
            <div>
              {weeklyMeta?.totalEstCost && (
                <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Estimated Weekly Cost</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{dietLabel} · {days} days · {meals} meals/day</div>
                  </div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-primary-dark)' }}>₹ {weeklyMeta.totalEstCost.toFixed(0)}</div>
                </div>
              )}
              {weeklyMeta?.cached && <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', background: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>✅ Loaded from your saved weekly plan</div>}

              <button className="btn-primary" style={{ width: '100%', marginBottom: '1.25rem' }}
                onClick={() => addAllRecipesToCart(weeklyPlan)}>
                🛒 Add All Plan Recipes to Cart
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {Object.entries(byDay).map(([dayIdx, dayMeals]) => (
                  <div key={dayIdx} className="card">
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', color: 'var(--color-primary-dark)' }}>
                      {DAYS[Number(dayIdx)] || `Day ${Number(dayIdx) + 1}`}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {dayMeals.map((meal: any, i: number) => {
                        const inCart = cart.some((c: any) => c.id === meal.recipe?.id);
                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', padding: '0.75rem', background: 'var(--color-bg-alt, #f9f9f9)', borderRadius: '6px', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '0.5rem' }}>{meal.mealSlot}</span>
                                <span style={{ fontWeight: 600 }}>{meal.recipe?.name}</span>
                                {meal.recipe?.prepTimeMinutes && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>⏱ {meal.recipe.prepTimeMinutes + (meal.recipe.cookTimeMinutes || 0)} min</span>}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                {meal.recipe?.cuisineRegion?.name}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', borderTop: '1px solid #e5e5e5', paddingTop: '0.4rem', justifyContent: 'flex-end' }}>
                              {inCart ? (
                                <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', minHeight: 0 }}
                                  onClick={() => removeFromCart(meal.recipe.id)}>
                                  ✕ Remove
                                </button>
                              ) : (
                                <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', minHeight: 0 }}
                                  onClick={() => meal.recipe && addToCart(meal.recipe)}>
                                  🛒 Add to Cart
                                </button>
                              )}
                              <button className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', border: '1px solid var(--color-border)', minHeight: 0 }}
                                onClick={() => swapRecipe('weekly', meal.dayIndex, meal.mealSlot, meal.recipe?.id)}>
                                🔄 Suggest Another
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-secondary" onClick={() => { setWeeklyPlan([]); setWeeklyMeta(null); }} style={{ marginTop: '1rem' }}>← Generate New Plan</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
