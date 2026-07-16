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
    <div style={{ maxWidth: '850px', margin: '0 auto', height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Optional minimal top bar */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', background: '#e5e7eb', padding: '0.25rem 0.75rem', borderRadius: '20px' }}>
          Personalized Recipe Bot • {diet === 'VEG' ? 'Veg' : diet === 'EGG' ? 'Egg' : 'Non-Veg'} • ₹{budget.toLocaleString()} • {familySize} serves
        </span>
      </div>

      {/* Chat window */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem 2rem 1rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Quick chips - show only at top */}
          {messages.length === 1 && (
            <div style={{
              display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem', marginBottom: '1rem'
            }}>
              {QUICK_CHIPS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '24px',
                    border: '1px solid #e5e7eb',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    color: 'var(--color-text-main)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => (e.target as HTMLElement).style.background = '#f9fafb'}
                  onMouseLeave={e => (e.target as HTMLElement).style.background = 'white'}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              
              {/* Off-topic deflection banner */}
              {m.isOffTopic && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '1rem', fontSize: '0.9rem', color: '#9a3412', maxWidth: '85%', margin: '0 auto'
                }}>
                  <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>🍛</span>
                  <span style={{ lineHeight: 1.5 }}>{m.content}</span>
                </div>
              )}

              {/* Standard Message */}
              {!m.isOffTopic && (
                <div style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  {m.role === 'ai' && (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1rem', flexShrink: 0, boxShadow: '0 2px 8px rgba(224,123,57,0.3)' }}>
                      ✨
                    </div>
                  )}
                  
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.95rem',
                    lineHeight: 1.6,
                    color: 'var(--color-text-main)',
                    maxWidth: m.role === 'user' ? '75%' : '100%',
                    background: m.role === 'user' ? '#f3f4f6' : 'transparent',
                    padding: m.role === 'user' ? '0.75rem 1.25rem' : '0.2rem 0',
                    borderRadius: m.role === 'user' ? '24px 24px 4px 24px' : '0',
                  }}>
                    {m.content}
                  </div>
                </div>
              )}

              {/* Suggestion cards (AI only) */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div style={{ paddingLeft: m.isOffTopic ? 0 : '3rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {m.suggestions.map((s: any, si: number) => (
                      <div
                        key={si}
                        style={{
                          background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', transition: 'all 0.2s ease', cursor: 'default'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-main)', lineHeight: 1.3 }}>{s.name}</span>
                          {s.dishType?.name && (
                            <span style={{ fontSize: '0.65rem', background: '#f3f4f6', color: '#4b5563', borderRadius: '6px', padding: '0.15rem 0.4rem', fontWeight: 600, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {s.dishType.name}
                            </span>
                          )}
                        </div>
                        <button
                          className="btn-primary"
                          style={{ padding: '0.4rem', fontSize: '0.8rem', borderRadius: '8px', width: '100%', marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: '0.4rem' }}
                          onClick={() => addToCart(s)}
                        >
                          <span>+</span> Add to Cart
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #d1d5db, #9ca3af)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1rem', flexShrink: 0 }}>
                ✨
              </div>
              <div style={{ fontStyle: 'italic', color: '#6b7280', fontSize: '0.95rem' }}>
                Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Floating Input Area */}
        <div style={{ padding: '1rem', background: 'transparent' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '32px',
            padding: '0.5rem 0.5rem 0.5rem 1.5rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            maxWidth: '780px',
            margin: '0 auto',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary-light)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(224,123,57,0.12)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)'; }}
          >
            <input
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: '0.95rem', color: 'var(--color-text-main)', padding: '0.4rem 0'
              }}
              placeholder="Message Recipe Bot..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? '#e5e7eb' : 'var(--color-primary)',
                color: 'white',
                border: 'none',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                marginLeft: '0.5rem'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.7rem', color: '#9ca3af' }}>
            Recipe Bot can make mistakes. Check allergies and ingredients before cooking.
          </div>
        </div>
      </div>
    </div>
  );
}
