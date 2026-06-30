import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Recipe-to-Cart | Royal MVP',
  description: 'A classic and royal recipe planning and grocery shopping experience.',
};

import { CartProvider } from './cart-context';
import { PreferencesProvider } from './preferences-context';
import { AuthProvider } from './auth-context';
import { ClientNav } from './client-nav';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <PreferencesProvider>
            <CartProvider>
              <nav className="navbar">
                <div className="container">
                  <a href="/" className="navbar-brand">Royal Recipes</a>
                  <ClientNav />
                </div>
              </nav>
              <main className="container" style={{ marginTop: '2rem' }}>
                {children}
              </main>
            </CartProvider>
          </PreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
