'use client';
import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../preferences-context';
import { useCart } from '../cart-context';
import { useAuth } from '../auth-context';
import { API_URL } from '../config';

type Message = {
  role: 'ai' | 'user';
  content: string;
  suggestions?: any[];
  isOffTopic?: boolean;
};

const QUICK_CHIPS = [
  '🍮 Indian Sweets',
  '🍛 Quick Dinner',
  '🥟 Street Food Snacks',
  '🎉 Festival Specials',
  '💪 High Protein Meals',
  '🥘 One Pot Dal & Curries',
  '🥥 South Indian Breakfast',
  '🍡 Desserts & Mithai',
];

export default function BotPage() {
  const { diet, budget, familySize, allergies } = usePreferences();
  const { addToCart } = useCart();
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: `Hi! I'm your AI Recipe Assistant powered by Groq 🍊\n\nPreparing your personalized recipe assistant...` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Load custom welcome message based on real database recipes on mount
  useEffect(() => {
    const loadWelcomeMessage = async () => {
      try {
        const res = await fetch(`${API_URL}/api/recipes?diet=${diet}&limit=3`);
        const data = await res.json();
        const recipes = data.recipes || [];

        let recipeSuggestionText = '';
        if (recipes.length > 0) {
          const names = recipes.map((r: any) => r.name).join(', ');
          recipeSuggestionText = `\n\nFrom our database, here are a few ${diet === 'VEG' ? 'veg' : diet === 'EGG' ? 'eggetarian' : 'non-veg'} favourites: **${names}**!`;
        }

        const welcomeText = `Hi! I'm your AI Recipe Assistant 🍛\n\nI see you're ${diet === 'VEG' ? 'vegetarian 🌱' : diet === 'EGG' ? 'eggetarian 🥚' : 'a non-veg lover 🍗'} with a budget of ₹${budget.toLocaleString()} for ${familySize} people.${recipeSuggestionText}\n\nAsk me anything — \"Suggest Diwali sweets\", \"Quick dinner\", \"High protein breakfast\" — and I'll give you 10 personalized Indian recipe ideas you can add straight to your cart! 🛒`;

        setMessages([{ role: 'ai', content: welcomeText }]);
      } catch (err) {
        const welcomeText = `Hi! I'm your AI Recipe Assistant 🍛\n\nI see you're ${diet === 'VEG' ? 'vegetarian 🌱' : diet === 'EGG' ? 'eggetarian 🥚' : 'a non-veg lover 🍗'} with a budget of ₹${budget.toLocaleString()} for ${familySize} people.\n\nAsk me anything — \"Suggest Diwali sweets\", \"Quick dinner\", \"High protein breakfast\" — and I'll give you 10 personalized Indian recipe ideas! 🛒`;
        setMessages([{ role: 'ai', content: welcomeText }]);
      }
    };
    loadWelcomeMessage();
  }, [diet, budget, familySize]);

  const send = async (overrideMessage?: string) => {
    const userMsg = (overrideMessage ?? input).trim();
    if (!userMsg || loading) return;
    setInput('');
    setMessages(p => [...p, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/bot/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-6).map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.content
          })),
          preferences: { diet, budget, familySize, allergies }
        })
      });
      const data = await res.json();
      setMessages(p => [...p, {
        role: 'ai',
        content: data.reply,
        suggestions: data.suggestions || [],
        isOffTopic: data.isOffTopic || false,
      }]);
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

      {/* Indian-food focused quick chips */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', flexShrink: 0 }}>
        {QUICK_CHIPS.map(s => (
          <button
            key={s}
            onClick={() => send(s)}
            style={{
              padding: '0.3rem 0.75rem',
              borderRadius: '20px',
              border: '1.5px solid var(--color-border)',
              background: 'white',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: 500,
              color: 'var(--color-text-muted)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.borderColor = 'var(--color-primary)';
              (e.target as HTMLElement).style.color = 'var(--color-primary)';
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.borderColor = 'var(--color-border)';
              (e.target as HTMLElement).style.color = 'var(--color-text-muted)';
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div className="card-flat" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {messages.map((m, i) => (
            <div key={i}>
              {/* Off-topic deflection banner */}
              {m.isOffTopic ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  background: '#fff7ed',
                  border: '1.5px solid #fed7aa',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  fontSize: '0.875rem',
                  color: '#9a3412',
                  fontWeight: 500,
                }}>
                  <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>🍛</span>
                  <span style={{ lineHeight: 1.5 }}>{m.content}</span>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: m.suggestions?.length ? '0.75rem' : 0,
                }}>
                  {m.role === 'ai' && <span style={{ fontSize: '1.3rem', marginRight: '0.6rem', alignSelf: 'flex-end' }}>🤖</span>}
                  <div
                    className={m.role === 'ai' ? 'chat-bubble-ai' : 'chat-bubble-user'}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {m.content}
                  </div>
                </div>
              )}

              {/* Suggestion cards */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div style={{ paddingLeft: m.isOffTopic ? 0 : '2.2rem', marginTop: '0.5rem' }}>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {m.suggestions.length} Recipe{m.suggestions.length !== 1 ? 's' : ''} matched from our menu
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                    {m.suggestions.map((s: any, si: number) => (
                      <div
                        key={si}
                        style={{
                          background: 'white',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.6rem 0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          transition: 'box-shadow 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                      >
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, maxWidth: '160px' }}>{s.name}</span>
                        {s.dishType?.name && (
                          <span style={{
                            fontSize: '0.68rem',
                            background: '#f3f4f6',
                            color: '#6b7280',
                            borderRadius: '4px',
                            padding: '0.1rem 0.4rem',
                            fontWeight: 500,
                          }}>
                            {s.dishType.name}
                          </span>
                        )}
                        <button
                          className="btn-primary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', flexShrink: 0 }}
                          onClick={() => addToCart(s)}
                        >
                          + Cart
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🤖</span>
              <div className="chat-bubble-ai" style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                Finding the best Indian recipes for you…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.7rem', flexShrink: 0 }}>
          <input
            className="input-field"
            style={{ flex: 1 }}
            placeholder="Ask about Indian recipes, sweets, desserts, snacks…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button className="btn-primary" onClick={() => send()} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  );
}
