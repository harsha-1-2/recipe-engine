'use client';
import { useState, useEffect } from 'react';
import { usePreferences } from '../preferences-context';
import { useAuth } from '../auth-context';

const COMMON_ALLERGIES = ['Gluten', 'Dairy', 'Nuts', 'Shellfish', 'Eggs', 'Soy', 'Fish', 'Peanuts', 'Sesame', 'Mustard'];
const COMMON_BRANDS = ['Amul', 'Britannia', 'Nestlé', 'Mother Dairy', 'Haldirams', 'MDH', 'Everest', 'Fortune', 'Tata', 'ITC', 'Patanjali', 'Dabur'];
const COMMON_INGREDIENTS_TO_AVOID = ['Onion', 'Garlic', 'Mushroom', 'Beetroot', 'Capsicum', 'Brinjal', 'Coriander'];

export default function PreferencesPage() {
  const {
    budget, setBudget, diet, setDiet, familySize, setFamilySize,
    priceTier, setPriceTier,
    cuisinePref, setCuisinePref,
    allergies, addAllergy, removeAllergy,
    brandPrefs, addBrand, removeBrand,
    ingredientPrefs, addIngredientPref, removeIngredientPref,
    syncWithServer, saveToServer,
  } = usePreferences();

  const { user, token, isLoggedIn } = useAuth();

  const [allergyInput, setAllergyInput] = useState('');
  const [brandInput, setBrandInput] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Sync from server when user logs in
  useEffect(() => {
    if (isLoggedIn && token) syncWithServer(token);
  }, [isLoggedIn, token]);

  const handleSave = async () => {
    await saveToServer(token);
    setSavedMsg('✅ Preferences saved!');
    setTimeout(() => setSavedMsg(''), 2500);
  };

  const dislikedPrefs = ingredientPrefs.filter(p => p.type === 'DISLIKED');
  const preferredPrefs = ingredientPrefs.filter(p => p.type === 'PREFERRED');

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '2.5rem 0' }}>
      <div className="page-header">
        <span className="section-label">Account</span>
        <h1>Your Preferences</h1>
        <p>These settings shape your Recipe Bot suggestions, Planner defaults, and checkout experience.
          {isLoggedIn ? ' ✅ Synced to your account.' : ' 🔒 Sign in to save permanently.'}
        </p>
      </div>

      {!isLoggedIn && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '0.875rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#92400e' }}>
          <strong>Not signed in</strong> — preferences are saved locally. <a href="/auth" style={{ color: '#92400e', fontWeight: 700 }}>Sign in</a> to persist them across devices.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

        {/* Budget */}
        <div className="card-flat">
          <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>Weekly Budget</label>
          <input type="range" min="500" max="10000" step="100" value={budget}
            onChange={e => setBudget(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            <span>₹500</span>
            <strong style={{ color: 'var(--color-primary-dark)', fontSize: '1rem' }}>₹ {budget.toLocaleString()}</strong>
            <span>₹10,000</span>
          </div>
        </div>

        {/* Diet + Family + PriceTier + Cuisine */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
          <div className="card-flat">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>Diet Type</label>
            <select className="input-field" value={diet} onChange={e => setDiet(e.target.value)}>
              <option value="VEG">🌱 Vegetarian</option>
              <option value="EGG">🥚 Eggetarian</option>
              <option value="NON_VEG">🍗 Non-Vegetarian</option>
            </select>
          </div>
          <div className="card-flat">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>Family Size</label>
            <input className="input-field" type="number" min="1" max="12" value={familySize}
              onChange={e => setFamilySize(Number(e.target.value))} />
          </div>
          <div className="card-flat">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>Price Tier</label>
            <select className="input-field" value={priceTier} onChange={e => setPriceTier(e.target.value)}>
              <option value="CHEAPEST">💰 Cheapest</option>
              <option value="MIXED">⚖️ Mixed</option>
              <option value="HIGH_RATED">⭐ High Rated</option>
              <option value="PREFERENCE">❤️ My Brands</option>
            </select>
          </div>
          <div className="card-flat">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.75rem' }}>Cuisine Region</label>
            <select className="input-field" value={cuisinePref} onChange={e => setCuisinePref(e.target.value)}>
              <option value="">🗺️ No Preference</option>
              <option value="North Indian">🍛 North Indian</option>
              <option value="South Indian">🥥 South Indian</option>
            </select>
          </div>
        </div>

        {/* Allergies */}
        <div className="card-flat">
          <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>🚫 Allergies & Intolerances</label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>These ingredients will be excluded from all recipe suggestions and plans.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {COMMON_ALLERGIES.map(a => (
              <button key={a} onClick={() => allergies.includes(a) ? removeAllergy(a) : addAllergy(a)}
                style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', border: '1.5px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: allergies.includes(a) ? '#dc2626' : 'white', color: allergies.includes(a) ? 'white' : 'var(--color-text-muted)', borderColor: allergies.includes(a) ? '#dc2626' : 'var(--color-border)', transition: 'all 0.15s' }}>
                {allergies.includes(a) ? '✕ ' : ''}{a}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input-field" placeholder="Type a custom allergy…" value={allergyInput}
              onChange={e => setAllergyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addAllergy(allergyInput); setAllergyInput(''); }}} />
            <button className="btn-secondary" onClick={() => { addAllergy(allergyInput); setAllergyInput(''); }}>Add</button>
          </div>
          {allergies.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
              {allergies.map(a => (
                <span key={a} style={{ background: '#fee2e2', color: '#991b1b', padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  🚫 {a}
                  <span onClick={() => removeAllergy(a)} style={{ cursor: 'pointer', opacity: 0.7, fontWeight: 900 }}>×</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Disliked Ingredients */}
        {isLoggedIn && (
          <div className="card-flat">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>👎 Ingredients to Avoid</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>Recipes with these will be ranked lower (not fully excluded).</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
              {COMMON_INGREDIENTS_TO_AVOID.map(ing => {
                const active = ingredientPrefs.some(p => p.type === 'DISLIKED' && p.ingredient?.canonicalName === ing.toLowerCase());
                return (
                  <button key={ing}
                    onClick={() => {
                      if (active) {
                        const pref = ingredientPrefs.find(p => p.ingredient?.canonicalName === ing.toLowerCase());
                        if (pref?.ingredient?.id) removeIngredientPref(pref.ingredient.id);
                      } else {
                        addIngredientPref(ing, 'DISLIKED');
                      }
                    }}
                    style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', border: '1.5px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: active ? '#fbbf24' : 'white', color: active ? '#78350f' : 'var(--color-text-muted)', borderColor: active ? '#fbbf24' : 'var(--color-border)' }}>
                    {ing}
                  </button>
                );
              })}
            </div>
            {dislikedPrefs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {dislikedPrefs.map(p => (
                  <span key={p.id} style={{ background: '#fef3c7', color: '#78350f', padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    👎 {p.ingredient?.canonicalName}
                    <span onClick={() => { if (p.ingredient?.id) removeIngredientPref(p.ingredient.id); }} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Brand Preferences */}
        <div className="card-flat">
          <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>❤️ Preferred Brands</label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>When "My Brands" price tier is selected, these brands will be prioritized in your cart.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {COMMON_BRANDS.map(b => (
              <button key={b} onClick={() => brandPrefs.includes(b) ? removeBrand(b) : addBrand(b)}
                style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', border: '1.5px solid', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: brandPrefs.includes(b) ? 'var(--color-primary)' : 'white', color: brandPrefs.includes(b) ? 'white' : 'var(--color-text-muted)', borderColor: brandPrefs.includes(b) ? 'var(--color-primary)' : 'var(--color-border)', transition: 'all 0.15s' }}>
                {b}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input-field" placeholder="Add a brand…" value={brandInput}
              onChange={e => setBrandInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addBrand(brandInput); setBrandInput(''); }}} />
            <button className="btn-secondary" onClick={() => { addBrand(brandInput); setBrandInput(''); }}>Add</button>
          </div>
          {brandPrefs.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
              {brandPrefs.map(b => (
                <span key={b} style={{ background: 'var(--color-primary-light, #e0f2fe)', color: 'var(--color-primary-dark)', padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  ❤️ {b}
                  <span onClick={() => removeBrand(b)} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Preferred Ingredients (logged in only) */}
        {isLoggedIn && (
          <div className="card-flat">
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>⭐ Preferred Ingredients</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>Recipes using these ingredients will be prioritized in suggestions.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input-field" id="prefIngInput" placeholder="e.g. Paneer, Spinach…" />
              <button className="btn-secondary" onClick={() => {
                const input = document.getElementById('prefIngInput') as HTMLInputElement;
                if (input?.value) { addIngredientPref(input.value, 'PREFERRED'); input.value = ''; }
              }}>Add</button>
            </div>
            {preferredPrefs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
                {preferredPrefs.map(p => (
                  <span key={p.id} style={{ background: '#d1fae5', color: '#065f46', padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    ⭐ {p.ingredient?.canonicalName}
                    <span onClick={() => { if (p.ingredient?.id) removeIngredientPref(p.ingredient.id); }} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Save Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
          <button className="btn-primary" onClick={handleSave} style={{ minWidth: '160px' }}>
            {isLoggedIn ? 'Save to Account' : 'Save Locally'}
          </button>
          {savedMsg && <span style={{ color: 'green', fontWeight: 600, fontSize: '0.9rem' }}>{savedMsg}</span>}
          {!isLoggedIn && (
            <a href="/auth" className="btn-secondary" style={{ textDecoration: 'none' }}>Sign In to Sync →</a>
          )}
        </div>
      </div>
    </div>
  );
}
