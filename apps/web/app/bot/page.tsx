'use client';
import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../preferences-context';
import { useCart } from '../cart-context';
import { useAuth } from '../auth-context';
import { API_URL } from '../config';

type Message = { role: 'ai' | 'user'; content: string; suggestions?: any[] };

export default function BotPage() {
  const { diet, budget, familySize, allergies } = usePreferences();
  const { addToCart } = useCart();
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: `Hi! I'm your AI Recipe Assistant powered by Groq 🍊\n\nI see you're ${diet === 'VEG' ? 'vegetarian 🌱' : diet === 'EGG' ? 'eggetarian 🥚' : 'a non-veg lover 🍗'} with a budget of ₹${budget.toLocaleString()} for ${familySize} people.\n\nAsk me anything — "suggest a quick dinner", "high protein lunch", "weekend special" — and I'll give you personalized recipe ideas you can add straight to your cart!` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(p => [...p, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_URL}/api/bot/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMsg, preferences: { diet, budget, familySize, allergies } })
      });
      const data = await res.json();
      setMessages(p => [...p, { role: 'ai', content: data.reply, suggestions: data.suggestions || [] }]);
    } catch {
      setMessages(p => [...p, { role: 'ai', content: 'Sorry, I had trouble connecting to the AI server. Make sure the API is running on port 4000.' }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '2rem 0', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <span className="section-label">AI Powered</span>
        <h1>Recipe Bot</h1>
        <p>Personalized to your diet · ₹{budget.toLocaleString()} budget · {familySize} servings · {allergies.length > 0 ? `No ${allergies.join(', ')}` : 'No restrictions'}</p>
      </div>

      {/* Preference pills */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', flexShrink: 0 }}>
        {['Quick Dinner', 'High Protein', 'Weekend Special', 'One Pot Meal', 'Under 30 mins', 'Budget Pick'].map(s => (
          <button key={s} onClick={() => { setInput(s); }}
            style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', border: '1.5px solid var(--color-border)', background: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 500, color: 'var(--color-text-muted)', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--color-primary)'; (e.target as HTMLElement).style.color = 'var(--color-primary)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--color-border)'; (e.target as HTMLElement).style.color = 'var(--color-text-muted)'; }}>
            {s}
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div className="card-flat" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {messages.map((m, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: m.suggestions?.length ? '0.75rem' : 0 }}>
                {m.role === 'ai' && <span style={{ fontSize: '1.3rem', marginRight: '0.6rem', alignSelf: 'flex-end' }}>🤖</span>}
                <div className={m.role === 'ai' ? 'chat-bubble-ai' : 'chat-bubble-user'}
                  style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              </div>
              {m.suggestions && m.suggestions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', paddingLeft: '2.2rem' }}>
                  {m.suggestions.map((s: any, si: number) => (
                    <div key={si} style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{s.name}</span>
                      <button className="btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => addToCart(s)}>+ Cart</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🤖</span>
              <div className="chat-bubble-ai" style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>Thinking…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.7rem', flexShrink: 0 }}>
          <input className="input-field" style={{ flex: 1 }}
            placeholder="Ask me anything about recipes…"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()} />
          <button className="btn-primary" onClick={send} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  );
}
