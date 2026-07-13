import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db, paperdbEnabled } from "@/lib/paperdb";
import { formatNGN } from "@/lib/cart";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — Maison" }] }),
  component: Account,
});

type Order = {
  _id?: string;
  reference?: string;
  total: number;
  status: string;
  createdAt?: string;
  items: Array<{ name: string; quantity: number }>;
};

function Account() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    (async () => {
      try {
        if (paperdbEnabled) {
          const res = await db.orders.find({ filter: { email: user.email }, sort: "-createdAt", limit: 25 });
          setOrders((res?.documents ?? res ?? []) as Order[]);
        } else {
          const raw = window.localStorage.getItem("shop.orders");
          const list: Order[] = raw ? JSON.parse(raw) : [];
          setOrders(list.filter((o: Order & { email?: string }) => o.email === user.email).reverse());
        }
        log.info("account:orders:loaded");
      } catch (err) {
        log.error("account:orders:failed", { error: String(err) });
      } finally {
        setLoadingOrders(false);
      }
    })();
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  return (
    <div className="container-page py-12 md:py-16">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Account</div>
          <h1 className="font-display text-4xl mt-2">Hello, {user.name ?? user.email}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{user.email}</p>
        </div>
        <button onClick={() => { signOut(); navigate({ to: "/" }); }} className="btn-outline">Sign out</button>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-2xl mb-4">Recent orders</h2>
        {loadingOrders ? (
          <div className="h-24 rounded-xl bg-muted animate-pulse" />
        ) : orders.length === 0 ? (
          <div className="card-surface p-8 text-center text-muted-foreground">
            No orders yet. <Link to="/shop" className="underline">Start shopping</Link>.
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o, i) => (
              <li key={o._id ?? o.reference ?? i} className="card-surface p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">#{o.reference ?? o._id}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {o.items.map((it) => `${it.name} × ${it.quantity}`).join(", ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatNGN(o.total)}</div>
                  <div className="text-xs text-accent uppercase tracking-widest mt-0.5">{o.status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
