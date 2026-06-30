'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

type CartContextType = {
  cart: any[];
  addToCart: (recipe: any) => void;
  removeFromCart: (recipeId: string) => void;
  clearCart: () => void;
  cartCount: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('royal-cart');
    if (saved) {
      try { setCart(JSON.parse(saved)); } catch (e) {}
    }
    setMounted(true);
  }, []);

  // Save to local storage on change
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('royal-cart', JSON.stringify(cart));
    }
  }, [cart, mounted]);

  const addToCart = (recipe: any) => {
    setCart(prev => [...prev, recipe]);
  };

  const removeFromCart = (recipeId: string) => {
    setCart(prev => prev.filter(r => r.id !== recipeId));
  };

  const clearCart = () => setCart([]);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, cartCount: cart.length }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
