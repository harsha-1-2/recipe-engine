'use client';
import { useState, useRef, useEffect } from 'react';
import { useCart } from '../cart-context';
import { usePreferences } from '../preferences-context';
import { API_URL } from '../config';

type LogLine = { type: 'sys' | 'ai' | 'ok' | 'miss'; text: string };
type ManualItem = { id: string; name: string; qty: number; unit: string; checked: boolean };

export default function CartPage() {
  const { cart, removeFromCart, clearCart } = useCart();
  const { brandPrefs } = usePreferences();

  // AI extra items
  const [extraInput, setExtraInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);

  // Manual grocery list
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [addingItem, setAddingItem] = useState(false);

  const getHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('rtc_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  // Load manual list from API with local fallback
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rtc_token') : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`${API_URL}/api/manual-list`, { headers })
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(d => {
        if (Array.isArray(d)) {
          setManualItems(d);
        }
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          const local = localStorage.getItem('rtc_manual_items');
          if (local) {
            try { setManualItems(JSON.parse(local)); } catch (_) {}
          }
        }
      });
  }, []);

  // Save local changes to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rtc_manual_items', JSON.stringify(manualItems));
    }
  }, [manualItems]);

  const appendLog = (type: LogLine['type'], text: string) =>
    setLog(p => [...p, { type, text }]);

  // Consolidate ingredients across cart recipes
  const groceryMap = cart.reduce((acc: Record<string, { qty: number; unit: string }>, recipe: any) => {
    (recipe.ingredients || []).forEach((ri: any) => {
      const name = ri.ingredient?.canonicalName || 'Unknown';
      if (!acc[name]) acc[name] = { qty: 0, unit: ri.unit || 'units' };
      acc[name].qty += ri.quantity || 0;
    });
    return acc;
  }, {});


  const handleAddManualItem = async () => {
    if (!newItemName.trim()) return;
    setAddingItem(true);
    try {
      const res = await fetch(`${API_URL}/api/manual-list`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newItemName.trim(), qty: parseFloat(newItemQty) || 1, unit: newItemUnit || 'pcs' })
      });
      if (!res.ok) throw new Error();
      const item = await res.json();
      setManualItems(p => [...p, item]);
      setNewItemName('');
      setNewItemQty('1');
    } catch {
      // If API offline, add locally
      const item: ManualItem = { id: Date.now().toString(), name: newItemName.trim(), qty: parseFloat(newItemQty) || 1, unit: newItemUnit || 'pcs', checked: false };
      setManualItems(p => [...p, item]);
      setNewItemName('');
    }
    setAddingItem(false);
  };

  const toggleChecked = async (id: string) => {
    const item = manualItems.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, checked: !item.checked };
    setManualItems(p => p.map(i => i.id === id ? updated : i));
    fetch(`${API_URL}/api/manual-list/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ checked: updated.checked })
    }).catch(() => { });
  };

  const deleteManualItem = async (id: string) => {
    setManualItems(p => p.filter(i => i.id !== id));
    fetch(`${API_URL}/api/manual-list/${id}`, { 
      method: 'DELETE',
      headers: getHeaders()
    }).catch(() => { });
  };

  const clearManualList = async () => {
    setManualItems([]);
    fetch(`${API_URL}/api/manual-list`, { 
      method: 'DELETE',
      headers: getHeaders()
    }).catch(() => { });
  };

  const handleAiExtras = async () => {
    if (!extraInput.trim()) return;
    setAiLoading(true);
    setShowLog(true);
    appendLog('sys', `> You: "${extraInput}"`);
    appendLog('ai', 'AI: Parsing your request…');

    try {
      const res = await fetch(`${API_URL}/api/cart/parse-extras`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ text: extraInput, brandPrefs })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (data.matched?.length) {
        const formattedSuggestions = data.matched.map((item: any) => ({
          id: Math.random().toString(),
          ingredientId: item.ingredientId,
          catalogItemId: item.catalogItemId,
          name: item.name,
          brand: item.brand,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit,
          alternatives: item.alternatives || [],
          altIndex: 0
        }));
        setAiSuggestions(p => [...p, ...formattedSuggestions]);

        for (const item of data.matched) {
          appendLog('ok', `✓ Found: ${item.name} (${item.brand || 'Generic'}) — ₹${item.price}`);
        }
        appendLog('sys', `Found ${data.matched.length} recommendation(s) for your extra items!`);
      }
      if (data.unmatched?.length) {
        data.unmatched.forEach((item: string) => appendLog('miss', `✗ Not in catalog: "${item}"`));
      }
    } catch {
      appendLog('miss', 'Error: Could not connect to API. Is the backend running?');
    }
    setExtraInput('');
    setAiLoading(false);
  };

  const acceptSuggestion = async (sId: string) => {
    const item = aiSuggestions.find(s => s.id === sId);
    if (!item) return;

    const newItem: ManualItem = {
      id: Date.now().toString() + Math.random(),
      name: item.name,
      qty: item.quantity || 1,
      unit: item.unit || 'pcs',
      checked: false
    };
    setManualItems(p => [...p, newItem]);

    fetch(`${API_URL}/api/manual-list`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name: item.name, qty: item.quantity || 1, unit: item.unit || 'pcs' })
    }).catch(() => { });

    setAiSuggestions(p => p.filter(s => s.id !== sId));
  };

  const rejectSuggestion = (sId: string) => {
    setAiSuggestions(p => p.filter(s => s.id !== sId));
  };

  const suggestAnother = (sId: string) => {
    setAiSuggestions(p => p.map(s => {
      if (s.id !== sId) return s;
      if (!s.alternatives || s.alternatives.length <= 1) return s;

      const nextIndex = (s.altIndex + 1) % s.alternatives.length;
      const nextChoice = s.alternatives[nextIndex];
      return {
        ...s,
        catalogItemId: nextChoice.catalogItemId,
        brand: nextChoice.brand,
        price: nextChoice.price,
        altIndex: nextIndex
      };
    }));
  };

  const totalItems = Object.keys(groceryMap).length + manualItems.length;

  return (
    <div style={{ padding: '2rem 0' }}>
      <div className="page-header">
        <span className="section-label">Checkout</span>
        <h1>Your Cart</h1>
        <p>{cart.length} recipe{cart.length !== 1 ? 's' : ''} · {totalItems} grocery items</p>
      </div>

      {cart.length === 0 && manualItems.length === 0 ? (
        <div className="card-flat" style={{ textAlign: 'center', padding: '4rem' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛒</p>
          <strong>Your cart is empty</strong>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Browse recipes or add items manually below.</p>
          <a href="/catalog" className="btn-primary" style={{ display: 'inline-flex', marginTop: '1.5rem', textDecoration: 'none' }}>Browse Recipes</a>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem', alignItems: 'start' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Recipe cart */}
          {cart.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 600 }}>🍛 Selected Recipes</h3>
                <button className="btn-ghost" onClick={clearCart}>Clear all</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {cart.map((recipe: any) => (
                  <div key={recipe.id} className="card-flat" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1.2rem' }}>
                    <div>
                      <p style={{ fontWeight: 600, marginBottom: '0.1rem' }}>{recipe.name}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        {recipe.dietType} · {recipe.cuisineRegion?.name || '—'} · {recipe.ingredients?.length || 0} ingredients
                      </p>
                    </div>
                    <button className="btn-ghost" onClick={() => removeFromCart(recipe.id)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Grocery List */}
          <div className="card-flat">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '1rem' }}>📝 My Grocery List</h3>
              {manualItems.length > 0 && (
                <button className="btn-ghost" onClick={clearManualList} style={{ fontSize: '0.78rem' }}>Clear list</button>
              )}
            </div>

            {/* Add item row */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input className="input-field" style={{ flex: 2, minWidth: 140, fontSize: '0.87rem' }}
                placeholder="Item name…"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddManualItem()} />
              <input className="input-field" style={{ width: 72, fontSize: '0.87rem' }}
                type="number" min="0.1" step="0.1" value={newItemQty}
                onChange={e => setNewItemQty(e.target.value)} />
              <input className="input-field" style={{ width: 80, fontSize: '0.87rem' }}
                placeholder="unit" value={newItemUnit}
                onChange={e => setNewItemUnit(e.target.value)} />
              <button className="btn-primary"
                style={{ padding: '0.6rem 1rem', fontSize: '1.2rem', lineHeight: 1, minWidth: 44 }}
                onClick={handleAddManualItem} disabled={addingItem || !newItemName.trim()}
                title="Add item">
                +
              </button>
            </div>

            {manualItems.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                No items yet — type above and hit <strong>+</strong> to add!
              </p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {manualItems.map(item => (
                  <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.6rem', borderRadius: 'var(--radius-sm)', background: item.checked ? '#f8f8f8' : 'white', border: '1px solid var(--color-border)', transition: 'background 0.15s' }}>
                    <input type="checkbox" checked={item.checked} onChange={() => toggleChecked(item.id)}
                      style={{ width: 16, height: 16, accentColor: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '0.87rem', textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? 'var(--color-text-muted)' : 'var(--color-text-main)', textTransform: 'capitalize' }}>{item.name}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 500, flexShrink: 0 }}>{item.qty} {item.unit}</span>
                    <button className="btn-ghost" style={{ padding: '0.15rem 0.4rem', fontSize: '0.85rem', color: '#e57373' }} onClick={() => deleteManualItem(item.id)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Recipe grocery summary */}
          {cart.length > 0 && (
            <div className="card-flat">
              <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, marginBottom: '1rem', fontSize: '1rem' }}>🛍️ From Recipes</h3>
              {Object.keys(groceryMap).length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>No ingredient data — recipes may not have been seeded with ingredients yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem' }}>
                  {Object.entries(groceryMap).map(([name, info]) => (
                    <li key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                      <span>{name}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{(info as any).qty.toFixed(1)} {(info as any).unit}</span>
                    </li>
                  ))}
                </ul>
              )}
              <hr className="divider" />
              <button className="btn-primary" style={{ width: '100%' }}>Proceed to Checkout</button>
            </div>
          )}

          {/* AI Extra Items */}
          <div className="card-flat">
            <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.95rem' }}>
              ✨ Forgot something?
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>
              Tell the AI what else you need — it'll find them in the catalog and add to your list.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input className="input-field" style={{ flex: 1, fontSize: '0.85rem' }}
                placeholder='e.g. "2L Amul milk and bread"'
                value={extraInput} onChange={e => setExtraInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAiExtras()} />
              <button className="btn-primary" style={{ padding: '0.6rem 1rem', fontSize: '1.1rem', lineHeight: 1 }}
                onClick={handleAiExtras} disabled={aiLoading} title="Ask AI">
                {aiLoading ? '…' : '+'}
              </button>
            </div>

            {aiSuggestions.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '0.2rem' }}>💡 AI Suggestions:</p>
                {aiSuggestions.map(item => (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '0.6rem 0.8rem', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-sm)', background: '#fafafa', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>
                        {item.name} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>({item.brand})</span>
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                        ₹{item.price}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      <span>Quantity: {item.quantity} {item.unit}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <button className="btn-primary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', flex: 1 }}
                        onClick={() => acceptSuggestion(item.id)}>
                        ✓ Accept
                      </button>
                      {item.alternatives.length > 1 && (
                        <button className="btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', flex: 1.2 }}
                          onClick={() => suggestAnother(item.id)}>
                          🔄 Suggest Another
                        </button>
                      )}
                      <button className="btn-ghost" style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: '#e57373', border: '1px solid #ffcdd2' }}
                        onClick={() => rejectSuggestion(item.id)}>
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showLog && (
              <div className="ai-log" ref={logRef} style={{ marginTop: '0.8rem' }}>
                {log.map((l, i) => (
                  <div key={i} className={`l l-${l.type}`}>{l.text}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
