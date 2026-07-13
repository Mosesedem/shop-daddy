import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCart, formatNGN } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { payWithPaystack } from "@/lib/paystack";
import { db, paperdbEnabled } from "@/lib/paperdb";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Maison" }] }),
  component: Checkout,
});

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: user?.email ?? "",
    name: user?.name ?? "",
    address: "",
    city: "",
    state: "",
    phone: "",
  });
  const [placing, setPlacing] = useState(false);

  if (!items.length) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-display text-3xl">Nothing to checkout</h1>
        <Link to="/shop" className="btn-primary mt-6 inline-flex">Browse shop</Link>
      </div>
    );
  }

  async function saveOrder(reference: string) {
    const payload = {
      userId: user?.id ?? null,
      email: form.email,
      items: items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, quantity: i.quantity })),
      total: subtotal,
      status: "paid",
      reference,
      shipping: form,
    };
    log.event("order:save", { reference, total: subtotal, itemCount: items.length });
    try {
      if (paperdbEnabled) await db.orders.insert(payload);
      else {
        const key = "shop.orders";
        const existing = JSON.parse(window.localStorage.getItem(key) ?? "[]");
        existing.push({ ...payload, _id: reference, createdAt: new Date().toISOString() });
        window.localStorage.setItem(key, JSON.stringify(existing));
      }
      log.info("order:saved", { reference });
    } catch (err) {
      log.error("order:save:failed", { error: String(err) });
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email) return;
    setPlacing(true);
    const reference = `MSN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    log.event("checkout:submit", { reference, total: subtotal });
    try {
      await payWithPaystack({
        email: form.email,
        amountNGN: subtotal,
        reference,
        metadata: { name: form.name, phone: form.phone },
        onSuccess: async (ref) => {
          await saveOrder(ref);
          clear();
          navigate({ to: "/account", search: { ok: ref } as never });
        },
        onCancel: () => {
          setPlacing(false);
          log.warn("checkout:cancelled", { reference });
        },
      });
    } catch (err) {
      setPlacing(false);
      log.error("checkout:error", { error: String(err) });
      alert("Payment could not start. Please try again.");
    }
  }

  return (
    <div className="container-page py-10 md:py-16 grid md:grid-cols-5 gap-10">
      <form onSubmit={handlePay} className="md:col-span-3 space-y-5">
        <h1 className="font-display text-4xl">Checkout</h1>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
          <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} required />
          <div className="col-span-2">
            <Field label="Street address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} required />
          </div>
          <div className="col-span-2">
            <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} required />
          </div>
        </div>
        <button type="submit" disabled={placing} className="btn-accent w-full">
          {placing ? "Processing…" : `Pay ${formatNGN(subtotal)} with Paystack`}
        </button>
        <p className="text-xs text-muted-foreground">
          Payments are processed securely by Paystack. You'll receive an email receipt on success.
        </p>
      </form>

      <aside className="md:col-span-2 card-surface p-6 h-fit">
        <h2 className="font-display text-2xl mb-4">Order</h2>
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.productId} className="py-3 flex justify-between text-sm">
              <span>{it.name} × {it.quantity}</span>
              <span>{formatNGN(it.price * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-4 border-t flex justify-between font-medium">
          <span>Total</span><span>{formatNGN(subtotal)}</span>
        </div>
      </aside>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        className="mt-1 w-full rounded-md border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
