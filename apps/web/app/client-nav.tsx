'use client';
import { useCart } from './cart-context';
import { useAuth } from './auth-context';

export function ClientNav() {
  const { cartCount } = useCart();
  const { user, logout, isLoggedIn } = useAuth();

  return (
    <ul className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', listStyle: 'none', margin: 0, padding: 0 }}>
      <li><a href="/catalog">Catalog</a></li>
      <li><a href="/bot">Recipe Bot</a></li>
      <li><a href="/planners">Planners</a></li>
      <li><a href="/preferences">Preferences</a></li>
      <li><a href="/admin">Admin</a></li>
      <li>
        <a href="/cart" style={{ fontWeight: 'bold' }}>
          Cart {cartCount > 0 && <span style={{ background: 'var(--color-primary-dark)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.8rem', marginLeft: '0.3rem' }}>{cartCount}</span>}
        </a>
      </li>
      <li style={{ marginLeft: '0.75rem' }}>
        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              👤 {user?.name || user?.email?.split('@')[0]}
            </span>
            <button onClick={logout} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Sign Out
            </button>
          </div>
        ) : (
          <a href="/auth" style={{ background: 'var(--color-primary)', color: 'white', padding: '0.35rem 0.9rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
            Sign In
          </a>
        )}
      </li>
    </ul>
  );
}
