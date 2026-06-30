'use client';
import { useEffect, useState, useCallback } from 'react';
import { useCart } from '../cart-context';
import { usePreferences } from '../preferences-context';
import { API_URL } from '../config';

const REGION_EMOJIS: Record<string, string> = {
  'Indian (General)': '🛕', 'North Indian': '🛕', 'South Indian': '🌴',
  'Chinese': '🥢', 'Continental': '🍝', 'Street Food': '🍢',
  'Desserts': '🍮', 'Indian Regional': '🍛', 'Default': '🍽️',
};

const DIET_TAG: Record<string, { label: string; cls: string; emoji: string }> = {
  VEG: { label: 'Veg', cls: 'tag-veg', emoji: '🥘' },
  EGG: { label: 'Egg', cls: 'tag-egg', emoji: '🍳' },
  NON_VEG: { label: 'Non-Veg', cls: 'tag-nonveg', emoji: '🍖' },
};

export default function CatalogPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [regionGroups, setRegionGroups] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [dietFilters, setDietFilters] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [detailRecipe, setDetailRecipe] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { addToCart, cart } = useCart();
  const { diet: prefDiet } = usePreferences();
  const LIMIT = 48;

  const fetchRecipes = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (search) params.set('search', search);
      if (dietFilters.length === 1) params.set('diet', dietFilters[0]);
      if (selectedRegion) params.set('cuisine', selectedRegion);

      const r = await fetch(`${API_URL}/api/recipes?${params}`);
      const d = await r.json();
      // Handle both paginated and legacy flat array responses
      if (Array.isArray(d)) {
        setRecipes(d); setTotal(d.length); setPages(1);
      } else {
        setRecipes(d.recipes || []); setTotal(d.total || 0); setPages(d.pages || 1);
      }
    } catch {
      setRecipes([]);
    }
    setLoading(false);
  }, [search, dietFilters, selectedRegion]);

  useEffect(() => { fetchRecipes(1); setPage(1); }, [fetchRecipes]);

  useEffect(() => {
    fetch(`${API_URL}/api/region-groups`)
      .then(r => r.json())
      .then(d => setRegionGroups(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const openDetail = async (recipe: any) => {
    setDetailRecipe(recipe);
    setDetailLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/recipes/${recipe.id}`);
      const d = await r.json();
      setDetailRecipe(d);
    } catch {}
    setDetailLoading(false);
  };

  const toggleDiet = (d: string) => setDietFilters(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);

  const visibleRecipes = recipes.filter(r => {
    const matchDiet = dietFilters.length === 0 || dietFilters.includes(r.dietType);
    return matchDiet;
  });

  return (
    <div style={{ padding: '2rem 0' }}>
      <div className="page-header">
        <span className="section-label">Browse</span>
        <h1>Recipe Catalog</h1>
        <p>Discover {total.toLocaleString()} Indian recipes — filter by region, diet, or search.</p>
      </div>

      {/* Region tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.8rem', marginBottom: '1.5rem' }}>
        <div className={`region-tile ${selectedRegion === '' ? 'active' : ''}`} onClick={() => setSelectedRegion('')}>
          <div className="region-tile-emoji">🌏</div>
          <div className="region-tile-label">All</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', paddingBottom: '0.5rem' }}>{total} recipes</div>
        </div>
        {regionGroups.map((rg: any) => (
          <div key={rg.name} className={`region-tile ${selectedRegion === rg.name ? 'active' : ''}`} onClick={() => setSelectedRegion(selectedRegion === rg.name ? '' : rg.name)}>
            <div className="region-tile-emoji">{REGION_EMOJIS[rg.name] || '🍽️'}</div>
            <div className="region-tile-label">{rg.name}</div>
          </div>
        ))}
      </div>

      {/* Search + Diet filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 240 }}>
          <input className="input-field" style={{ flex: 1 }}
            placeholder="Search recipes…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setSearch(searchInput); }} />
          <button className="btn-primary" onClick={() => setSearch(searchInput)}>Search</button>
          {search && <button className="btn-ghost" onClick={() => { setSearch(''); setSearchInput(''); }}>✕</button>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['VEG', 'EGG', 'NON_VEG'] as const).map(d => (
            <button key={d} onClick={() => toggleDiet(d)}
              style={{ padding: '0.4rem 0.85rem', borderRadius: '20px', border: '1.5px solid', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s', background: dietFilters.includes(d) ? 'var(--color-primary)' : 'white', color: dietFilters.includes(d) ? 'white' : 'var(--color-text-muted)', borderColor: dietFilters.includes(d) ? 'var(--color-primary)' : 'var(--color-border)' }}>
              {DIET_TAG[d].label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</p>
          <p>Loading recipes…</p>
        </div>
      ) : visibleRecipes.length === 0 ? (
        <div className="card-flat" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗄️</p>
          <strong>{total === 0 ? 'Database is empty.' : 'No recipes match your filters.'}</strong>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
            {total === 0 ? 'Upload recipes_clean.csv via Admin → Data Pipeline or run the CSV seeder.' : 'Try clearing your filters.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {visibleRecipes.map((recipe: any) => {
              const inCart = cart.some((c: any) => c.id === recipe.id);
              const dt = DIET_TAG[recipe.dietType as keyof typeof DIET_TAG];
              const regionName = recipe.cuisineRegion?.regionGroup?.name || recipe.cuisineRegion?.name || '—';
              return (
                <div key={recipe.id} className="recipe-card" style={{ cursor: 'pointer' }} onClick={() => openDetail(recipe)}>
                  <div className="recipe-card-emoji">{dt?.emoji || '🍽️'}</div>
                  <div className="recipe-card-body">
                    <h3 style={{ fontSize: '0.92rem', marginBottom: '0.4rem', lineHeight: 1.3 }}>{recipe.name}</h3>
                    <div style={{ marginBottom: '0.5rem' }}>
                      {dt && <span className={`tag ${dt.cls}`}>{dt.label}</span>}
                      {regionName && <span className="tag tag-region" style={{ marginLeft: '0.3rem' }}>{regionName}</span>}
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 'auto' }}>
                      {recipe.ingredients?.length || 0} ingredients · {recipe.servesDefault || 2} servings
                      {recipe.prepTimeMinutes ? ` · ${recipe.prepTimeMinutes + (recipe.cookTimeMinutes || 0)} min` : ''}
                    </p>
                  </div>
                  <div className="recipe-card-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className={inCart ? 'btn-secondary' : 'btn-primary'}
                      style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }}
                      onClick={() => !inCart && addToCart(recipe)}
                      disabled={inCart}>
                      {inCart ? '✓ In Cart' : '+ Add to Cart'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem', alignItems: 'center' }}>
              <button className="btn-ghost" disabled={page <= 1} onClick={() => { setPage(p => p - 1); fetchRecipes(page - 1); }}>← Prev</button>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Page {page} of {pages}</span>
              <button className="btn-ghost" disabled={page >= pages} onClick={() => { setPage(p => p + 1); fetchRecipes(page + 1); }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Recipe Detail Modal */}
      {detailRecipe && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
          onClick={() => setDetailRecipe(null)}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', maxWidth: 680, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', lineHeight: 1.3 }}>{detailRecipe.name}</h2>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {DIET_TAG[detailRecipe.dietType] && <span className={`tag ${DIET_TAG[detailRecipe.dietType].cls}`}>{DIET_TAG[detailRecipe.dietType].label}</span>}
                    {detailRecipe.cuisineRegion?.name && <span className="tag tag-region">{detailRecipe.cuisineRegion.name}</span>}
                    {detailRecipe.dishType?.name && <span className="tag" style={{ background: '#f0f0f0', color: '#555' }}>{detailRecipe.dishType.name}</span>}
                  </div>
                </div>
                <button className="btn-ghost" style={{ fontSize: '1.3rem' }} onClick={() => setDetailRecipe(null)}>✕</button>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {detailRecipe.prepTimeMinutes && <span>⏱️ Prep: {detailRecipe.prepTimeMinutes} min</span>}
                {detailRecipe.cookTimeMinutes && <span>🔥 Cook: {detailRecipe.cookTimeMinutes} min</span>}
                <span>🍽️ Serves: {detailRecipe.servesDefault}</span>
                {detailRecipe.ingredients?.length > 0 && <span>🥬 {detailRecipe.ingredients.length} ingredients</span>}
              </div>

              {detailLoading && <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Loading details…</p>}

              {detailRecipe.ingredients?.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', color: 'var(--color-text-main)' }}>🥬 Ingredients</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                    {detailRecipe.ingredients.map((ri: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ textTransform: 'capitalize' }}>{ri.ingredient?.canonicalName || ri.notes}</span>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          {ri.quantity ? `${ri.quantity} ${ri.unit || ''}` : ri.notes || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailRecipe.instructions && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ marginBottom: '0.75rem' }}>📝 Instructions</h4>
                  <p style={{ fontSize: '0.87rem', lineHeight: 1.8, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
                    {detailRecipe.instructions.replace(/\.\s*/g, '.\n')}
                  </p>
                </div>
              )}

              {detailRecipe.sourceUrl && (
                <a href={detailRecipe.sourceUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize: '0.8rem', color: 'var(--color-primary)', display: 'inline-block', marginBottom: '1.5rem' }}>
                  🔗 View original recipe →
                </a>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {cart.some((c: any) => c.id === detailRecipe.id) ? (
                  <button className="btn-secondary" disabled style={{ flex: 1 }}>✓ In Cart</button>
                ) : (
                  <button className="btn-primary" style={{ flex: 1 }} onClick={() => { addToCart(detailRecipe); setDetailRecipe(null); }}>
                    + Add to Cart
                  </button>
                )}
                <button className="btn-secondary" onClick={() => setDetailRecipe(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
