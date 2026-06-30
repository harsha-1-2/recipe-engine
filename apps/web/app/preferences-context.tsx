'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_URL } from './config';

const API = API_URL;

type PreferencesContextType = {
  budget: number; setBudget: (b: number) => void;
  diet: string; setDiet: (d: string) => void;
  familySize: number; setFamilySize: (s: number) => void;
  priceTier: string; setPriceTier: (p: string) => void;
  cuisinePref: string; setCuisinePref: (c: string) => void;
  allergies: string[]; addAllergy: (a: string) => void; removeAllergy: (a: string) => void;
  brandPrefs: string[]; addBrand: (b: string) => void; removeBrand: (b: string) => void;
  ingredientPrefs: { id: string; type: string; ingredient: { id: string; canonicalName: string } }[];
  addIngredientPref: (name: string, type: 'ALLERGIC' | 'DISLIKED' | 'PREFERRED') => void;
  removeIngredientPref: (ingredientId: string) => void;
  syncWithServer: (token: string | null) => Promise<void>;
  saveToServer: (token: string | null) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [budget, setBudgetState] = useState(2500);
  const [diet, setDietState] = useState('VEG');
  const [familySize, setFamilySizeState] = useState(2);
  const [priceTier, setPriceTierState] = useState('MIXED');
  const [cuisinePref, setCuisinePrefState] = useState('');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [brandPrefs, setBrandPrefs] = useState<string[]>([]);
  const [ingredientPrefs, setIngredientPrefs] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('royal-prefs');
      if (saved) {
        const p = JSON.parse(saved);
        if (p.budget) setBudgetState(p.budget);
        if (p.diet) setDietState(p.diet);
        if (p.familySize) setFamilySizeState(p.familySize);
        if (p.priceTier) setPriceTierState(p.priceTier);
        if (p.cuisinePref) setCuisinePrefState(p.cuisinePref);
        if (p.allergies) setAllergies(p.allergies);
        if (p.brandPrefs) setBrandPrefs(p.brandPrefs);
      }
    } catch {}
    setMounted(true);
  }, []);

  // Persist to localStorage whenever prefs change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('royal-prefs', JSON.stringify({ budget, diet, familySize, priceTier, cuisinePref, allergies, brandPrefs }));
    }
  }, [budget, diet, familySize, priceTier, cuisinePref, allergies, brandPrefs, mounted]);

  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('rtc_token') : null;

  // Sync from server (called after login)
  const syncWithServer = useCallback(async (token: string | null) => {
    const t = token || getToken();
    if (!t) return;
    try {
      const res = await fetch(`${API}/api/preferences`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.budget !== undefined) setBudgetState(data.budget);
      if (data.dietTypePref) setDietState(data.dietTypePref);
      if (data.familySize !== undefined) setFamilySizeState(data.familySize);
      if (data.defaultPriceTier) setPriceTierState(data.defaultPriceTier);
      if (data.cuisinePref !== undefined) setCuisinePrefState(data.cuisinePref || '');
      if (data.brandPrefs) setBrandPrefs(data.brandPrefs.map((b: any) => b.brandName));
      if (data.ingredientPrefs) {
        setIngredientPrefs(data.ingredientPrefs);
        const allergicNames = data.ingredientPrefs
          .filter((p: any) => p.type === 'ALLERGIC')
          .map((p: any) => p.ingredient.canonicalName);
        setAllergies(allergicNames);
      }
    } catch {}
  }, []);

  // Save core prefs to server
  const saveToServer = useCallback(async (token: string | null) => {
    const t = token || getToken();
    if (!t) return;
    try {
      await fetch(`${API}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ budget, familySize, dietTypePref: diet, defaultPriceTier: priceTier, cuisinePref })
      });
    } catch {}
  }, [budget, diet, familySize, priceTier, cuisinePref]);

  const setBudget = (b: number) => setBudgetState(b);
  const setDiet = (d: string) => setDietState(d);
  const setFamilySize = (s: number) => setFamilySizeState(s);
  const setPriceTier = (p: string) => setPriceTierState(p);
  const setCuisinePref = (c: string) => setCuisinePrefState(c);

  const addAllergy = async (a: string) => {
    if (!a || allergies.includes(a)) return;
    setAllergies(prev => [...prev, a]);
    const t = getToken();
    if (t) {
      try {
        const res = await fetch(`${API}/api/preferences/ingredients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ ingredientName: a, type: 'ALLERGIC' })
        });
        if (res.ok) {
          const pref = await res.json();
          setIngredientPrefs(prev => [...prev.filter(p => p.ingredient?.canonicalName !== a.toLowerCase()), { ...pref, ingredient: { id: pref.ingredientId, canonicalName: a.toLowerCase() } }]);
        }
      } catch {}
    }
  };

  const removeAllergy = async (a: string) => {
    setAllergies(prev => prev.filter(x => x !== a));
    const pref = ingredientPrefs.find(p => p.ingredient?.canonicalName === a.toLowerCase() && p.type === 'ALLERGIC');
    if (pref) {
      const t = getToken();
      if (t) {
        try {
          await fetch(`${API}/api/preferences/ingredients/${pref.ingredientId}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${t}` }
          });
          setIngredientPrefs(prev => prev.filter(p => p.id !== pref.id));
        } catch {}
      }
    }
  };

  const addBrand = async (b: string) => {
    if (!b || brandPrefs.includes(b)) return;
    setBrandPrefs(prev => [...prev, b]);
    const t = getToken();
    if (t) {
      try {
        await fetch(`${API}/api/preferences/brands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ brandName: b })
        });
      } catch {}
    }
  };

  const removeBrand = async (b: string) => {
    setBrandPrefs(prev => prev.filter(x => x !== b));
    const t = getToken();
    if (t) {
      try {
        await fetch(`${API}/api/preferences/brands/${encodeURIComponent(b)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${t}` }
        });
      } catch {}
    }
  };

  const addIngredientPref = async (name: string, type: 'ALLERGIC' | 'DISLIKED' | 'PREFERRED') => {
    const t = getToken();
    if (!t) return;
    try {
      const res = await fetch(`${API}/api/preferences/ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ingredientName: name, type })
      });
      if (res.ok) {
        const pref = await res.json();
        setIngredientPrefs(prev => [...prev.filter(p => p.ingredient?.canonicalName !== name.toLowerCase()), pref]);
        if (type === 'ALLERGIC') addAllergy(name);
      }
    } catch {}
  };

  const removeIngredientPref = async (ingredientId: string) => {
    const t = getToken();
    if (!t) return;
    try {
      await fetch(`${API}/api/preferences/ingredients/${ingredientId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${t}` }
      });
      setIngredientPrefs(prev => prev.filter(p => p.ingredientId !== ingredientId));
    } catch {}
  };

  return (
    <PreferencesContext.Provider value={{
      budget, setBudget, diet, setDiet, familySize, setFamilySize, priceTier, setPriceTier,
      cuisinePref, setCuisinePref,
      allergies, addAllergy, removeAllergy,
      brandPrefs, addBrand, removeBrand,
      ingredientPrefs, addIngredientPref, removeIngredientPref,
      syncWithServer, saveToServer,
    }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be inside PreferencesProvider');
  return ctx;
}
