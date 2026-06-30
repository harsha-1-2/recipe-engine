'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_URL } from './config';

const API = API_URL;

type User = {
  id: string; email: string; name?: string;
  dietTypePref?: string; budget: number; familySize: number; defaultPriceTier: string;
  ingredientPrefs?: any[]; brandPrefs?: any[];
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  isLoggedIn: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const storeToken = (t: string) => {
    setToken(t);
    if (typeof window !== 'undefined') localStorage.setItem('rtc_token', t);
  };

  const clearAuth = () => {
    setUser(null);
    setToken(null);
    if (typeof window !== 'undefined') localStorage.removeItem('rtc_token');
  };

  const refreshProfile = useCallback(async () => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('rtc_token') : null);
    if (!t) return;
    try {
      const res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) { clearAuth(); return; }
      const profile = await res.json();
      setUser(profile);
    } catch { clearAuth(); }
  }, [token]);

  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('rtc_token') : null;
    if (savedToken) {
      setToken(savedToken);
      fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } })
        .then(r => r.ok ? r.json() : null)
        .then(profile => { if (profile) setUser(profile); else clearAuth(); })
        .catch(() => clearAuth())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    storeToken(data.token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, name?: string) => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    storeToken(data.token);
    setUser(data.user);
  };

  const logout = () => clearAuth();

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, refreshProfile, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
