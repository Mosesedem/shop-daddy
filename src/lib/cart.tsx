import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "./products";
import { log } from "./logger";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
};

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (p: Product, qty?: number) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "shop.cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch (err) {
      log.warn("cart:restore:failed", { error: String(err) });
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const value = useMemo<CartCtx>(() => ({
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
    add(p, qty = 1) {
      log.event("cart:add", { productId: p.id, qty });
      setItems((prev) => {
        const found = prev.find((x) => x.productId === p.id);
        if (found) return prev.map((x) => x.productId === p.id ? { ...x, quantity: x.quantity + qty } : x);
        return [...prev, { productId: p.id, name: p.name, price: p.price, image: p.image, quantity: qty }];
      });
    },
    remove(id) {
      log.event("cart:remove", { productId: id });
      setItems((prev) => prev.filter((x) => x.productId !== id));
    },
    setQty(id, qty) {
      log.event("cart:setQty", { productId: id, qty });
      setItems((prev) => prev.map((x) => x.productId === id ? { ...x, quantity: Math.max(1, qty) } : x));
    },
    clear() {
      log.event("cart:clear");
      setItems([]);
    },
  }), [items]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside CartProvider");
  return v;
}

export function formatNGN(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", maximumFractionDigits: 0,
  }).format(amount);
}
