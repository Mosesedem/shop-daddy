import { createFileRoute, Link } from "@tanstack/react-router";
import { useCart, formatNGN } from "@/lib/cart";
import { Minus, Plus, X } from "lucide-react";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your cart — Maison" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotal, setQty, remove } = useCart();

  if (!items.length) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-display text-4xl">Your cart is empty</h1>
        <p className="mt-3 text-muted-foreground">A quiet cart is a good place to start.</p>
        <Link to="/shop" className="btn-primary mt-8 inline-flex">Start browsing</Link>
      </div>
    );
  }

  return (
    <div className="container-page py-10 md:py-16 grid md:grid-cols-3 gap-10">
      <div className="md:col-span-2">
        <h1 className="font-display text-4xl mb-8">Your cart</h1>
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.productId} className="py-5 flex gap-4 items-center">
              <img src={it.image} alt={it.name} width={96} height={96} className="w-24 h-24 rounded-xl object-cover bg-secondary" />
              <div className="flex-1">
                <div className="font-medium">{it.name}</div>
                <div className="text-sm text-muted-foreground mt-1">{formatNGN(it.price)}</div>
                <div className="mt-3 inline-flex items-center border rounded-full">
                  <button className="p-2" onClick={() => setQty(it.productId, it.quantity - 1)}><Minus className="w-3.5 h-3.5" /></button>
                  <span className="w-8 text-center text-sm">{it.quantity}</span>
                  <button className="p-2" onClick={() => setQty(it.productId, it.quantity + 1)}><Plus className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">{formatNGN(it.price * it.quantity)}</div>
                <button onClick={() => remove(it.productId)} className="mt-2 text-muted-foreground hover:text-destructive text-xs inline-flex items-center gap-1"><X className="w-3 h-3" /> Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <aside className="card-surface p-6 h-fit">
        <h2 className="font-display text-2xl">Summary</h2>
        <div className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatNGN(subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>Calculated at checkout</span></div>
        </div>
        <div className="mt-4 pt-4 border-t flex justify-between font-medium">
          <span>Total</span><span>{formatNGN(subtotal)}</span>
        </div>
        <Link to="/checkout" className="btn-primary w-full mt-6">Checkout</Link>
      </aside>
    </div>
  );
}
