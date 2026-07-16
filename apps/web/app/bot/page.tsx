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

        const welcomeText = `Hi! I'm your AI Recipe Assistant 🍛\n\nI see you're ${diet === 'VEG' ? 'vegetarian 🌱' : diet === 'EGG' ? 'eggetarian 🥚' : 'a non-veg lover 🍗'} with a budget of ₹${budget.toLocaleString()} for ${familySize} people.${recipeSuggestionText}\n\nAsk me anything — "Suggest Diwali sweets", "Quick dinner", "High protein breakfast" — and I'll give you 10 personalized Indian recipe ideas you can add straight to your cart! 🛒`;

        setMessages([{ role: 'ai', content: welcomeText }]);
      } catch (err) {
        const welcomeText = `Hi! I'm your AI Recipe Assistant 🍛\n\nI see you're ${diet === 'VEG' ? 'vegetarian 🌱' : diet === 'EGG' ? 'eggetarian 🥚' : 'a non-veg lover 🍗'} with a budget of ₹${budget.toLocaleString()} for ${familySize} people.\n\nAsk me anything — "Suggest Diwali sweets", "Quick dinner", "High protein breakfast" — and I'll give you 10 personalized Indian recipe ideas! 🛒`;
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
    <div style={{ maxWidth: '900px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', background: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Modern Top Bar */}
      <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', background: 'rgba(250, 250, 250, 0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', border: '1px solid #e5e7eb', padding: '0.5rem 1rem', borderRadius: '99px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '1rem' }}>✨</span>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
            {diet === 'VEG' ? 'Veg' : diet === 'EGG' ? 'Egg' : 'Non-Veg'} • ₹{budget.toLocaleString()} • {familySize} serves
          </span>
        </div>
      </div>

      {/* Chat Scroll Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem 120px 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Quick Chips Empty State */}
        {messages.length === 1 && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '2rem', maxWidth: '700px', margin: '2rem auto' }}>
            {QUICK_CHIPS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  padding: '0.6rem 1.2rem', borderRadius: '99px', border: '1px solid #e5e7eb', background: 'white',
                  cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, color: '#374151',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.08)';
                  e.currentTarget.style.borderColor = 'var(--color-primary-light, #f9a8d4)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Message Feed */}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            
            {/* Off-Topic Warning Card */}
            {m.isOffTopic && (
              <div style={{ display: 'flex', gap: '1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '16px', padding: '1.25rem', color: '#9a3412', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.05)' }}>
                <span style={{ fontSize: '1.5rem' }}>🍛</span>
                <span style={{ fontSize: '0.95rem', lineHeight: 1.6, fontWeight: 500 }}>{m.content}</span>
              </div>
            )}

            {/* Standard Chat Bubble */}
            {!m.isOffTopic && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                
                {/* AI Avatar */}
                {m.role === 'ai' && (
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, #ea580c))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.1rem', flexShrink: 0, boxShadow: '0 4px 10px rgba(234, 88, 12, 0.2)' }}>
                    ✨
                  </div>
                )}
                
                {/* Text Content */}
                <div style={{
                  whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.6,
                  color: m.role === 'user' ? '#111827' : '#374151',
                  maxWidth: m.role === 'user' ? '70%' : '85%',
                  background: m.role === 'user' ? '#f3f4f6' : 'white',
                  border: m.role === 'ai' ? '1px solid #e5e7eb' : 'none',
                  padding: '1rem 1.25rem',
                  borderRadius: m.role === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
                  boxShadow: m.role === 'ai' ? '0 2px 8px rgba(0,0,0,0.02)' : 'none',
                }}>
                  {m.content}
                </div>
              </div>
            )}

            {/* Suggestions / Recipe Cards */}
            {m.suggestions && m.suggestions.length > 0 && (
              <div style={{ paddingLeft: m.isOffTopic ? 0 : '3.25rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {m.suggestions.map((s: any, si: number) => (
                    <div
                      key={si}
                      style={{
                        background: 'white', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1rem',
                        display: 'flex', flexDirection: 'column', gap: '0.75rem',
                        transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = 'var(--color-primary)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                        <span style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{s.name}</span>
                        {s.dishType?.name && (
                          <span style={{ fontSize: '0.7rem', background: '#f3f4f6', color: '#4b5563', borderRadius: '4px', padding: '0.2rem 0.5rem', fontWeight: 600, alignSelf: 'flex-start', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {s.dishType.name}
                          </span>
                        )}
                      </div>
                      <button
                        className="btn-primary"
                        style={{ padding: '0.6rem', fontSize: '0.85rem', fontWeight: 600, borderRadius: '10px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', border: 'none', background: 'var(--color-primary)', color: 'white', cursor: 'pointer', transition: 'opacity 0.2s' }}
                        onClick={() => addToCart(s)}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Add to Cart
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '1.1rem', flexShrink: 0 }}>
              ✨
            </div>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', padding: '0.8rem 1.25rem', borderRadius: '4px 20px 20px 20px', display: 'flex', gap: '4px' }}>
              <span className="dot-pulse" style={{ animationDelay: '0s' }}>●</span>
              <span className="dot-pulse" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="dot-pulse" style={{ animationDelay: '0.4s' }}>●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Floating Input Bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1.5rem', background: 'linear-gradient(transparent, #fafafa 30%)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '0.5rem 0.5rem 0.5rem 1.5rem', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', maxWidth: '780px', margin: '0 auto', transition: 'all 0.2s ease',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 10px 40px rgba(224,123,57,0.15)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 10px 40px rgba(0,0,0,0.08)'; }}
        >
          <input
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '1rem', color: '#111827', padding: '0.75rem 0' }}
            placeholder="Ask for a recipe or meal plan..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? '#f3f4f6' : 'var(--color-primary)',
              color: loading || !input.trim() ? '#9ca3af' : 'white',
              border: 'none', width: '44px', height: '44px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', marginLeft: '0.75rem'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>
          Recipe Bot can make mistakes. Always check ingredients before cooking.
        </div>
      </div>

      {/* Required for the loading animation above */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }
        .dot-pulse { display: inline-block; color: #d1d5db; animation: pulse 1.4s infinite ease-in-out both; font-size: 0.5rem; }
      `}} />
    </div> 
  );
}
