import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/use-auth";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
  type Product,
} from "@/lib/products";
import { formatNGN } from "@/lib/cart";
import { log } from "@/lib/logger";
import {
  fetchAllOrders,
  getOrderId,
  updateOrder,
  type Order,
  type ShippingDetails,
} from "@/lib/orders";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Maison" }, { name: "robots", content: "noindex" }],
  }),
  component: Admin,
});

const emptyProduct: Omit<Product, "id"> & { id?: string } = {
  name: "",
  slug: "",
  price: 0,
  description: "",
  image: "",
  category: "Home",
  stock: 0,
};

const ORDER_STATUSES: Order["status"][] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "fulfilled",
  "cancelled",
  "failed",
  "abandoned",
];

const STATUS_COLORS: Record<Order["status"], { bg: string; text: string }> = {
  pending:    { bg: "bg-amber-100",  text: "text-amber-800" },
  paid:       { bg: "bg-emerald-100", text: "text-emerald-800" },
  processing: { bg: "bg-blue-100",   text: "text-blue-800" },
  shipped:    { bg: "bg-indigo-100", text: "text-indigo-800" },
  fulfilled:  { bg: "bg-green-100",  text: "text-green-800" },
  cancelled:  { bg: "bg-gray-100",   text: "text-gray-600" },
  failed:     { bg: "bg-red-100",    text: "text-red-700" },
  abandoned:  { bg: "bg-orange-100", text: "text-orange-700" },
};

// ── Icons ────────────────────────────────────────────────────────────────────
function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  grid:     "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  package:  "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  orders:   "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2",
  revenue:  "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  trending: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  plus:     "M12 5v14M5 12h14",
  edit:     "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash:    "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  check:    "M20 6L9 17l-5-5",
  x:        "M18 6L6 18M6 6l12 12",
  refresh:  "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  save:     "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  store:    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
};

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, iconD, accent }: { label: string; value: string | number; sub?: string; iconD: string; accent: string }) {
  return (
    <div className="card-surface p-6 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon d={iconD} size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">{label}</p>
        <p className="mt-1 text-2xl font-display font-semibold leading-none">{value}</p>
        {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Order["status"] }) {
  const c = STATUS_COLORS[status] ?? { bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {status}
    </span>
  );
}

// ── Field input ──────────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">
        {label}{required && <span className="text-accent ml-0.5">*</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
      />
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "products" | "orders">("overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draft, setDraft] = useState(emptyProduct);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<Partial<Order>>({});
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<Order["status"] | "all">("all");

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!user.isAdmin) { navigate({ to: "/" }); return; }
    loadAll();
  }, [user, loading, navigate]);

  async function loadAll() {
    setLoadingData(true);
    try {
      const [p, o] = await Promise.all([fetchProducts(), fetchAllOrders()]);
      setProducts(p);
      setOrders(o);
    } catch (err) {
      log.exception("admin:load-failed", err);
    } finally {
      setLoadingData(false);
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const revenue = orders.filter(o => ["paid", "processing", "shipped", "fulfilled"].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const pending = orders.filter(o => o.status === "pending").length;
    const lowStock = products.filter(p => p.stock <= 3).length;
    return { revenue, pending, lowStock, totalOrders: orders.length };
  }, [orders, products]);

  // ── Filtered orders ────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !orderSearch || o.email.toLowerCase().includes(orderSearch.toLowerCase()) || o.reference.toLowerCase().includes(orderSearch.toLowerCase());
      const matchStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, orderSearch, orderStatusFilter]);

  // ── Product actions ────────────────────────────────────────────────────────
  async function submitProduct(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) await updateProduct(editingId, draft);
      else await createProduct(draft);
      setDraft(emptyProduct);
      setEditingId(null);
      setShowForm(false);
      const list = await fetchProducts();
      setProducts(list);
    } catch (err) {
      log.exception("admin:save:failed", err);
      alert(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await deleteProduct(id);
      const list = await fetchProducts();
      setProducts(list);
    } catch (err) {
      alert(String(err));
    }
  }

  // ── Order actions ──────────────────────────────────────────────────────────
  function startOrderEdit(order: Order) {
    setEditingOrderId(getOrderId(order));
    setOrderDraft({ status: order.status, shipping: order.shipping });
  }

  async function saveOrder(order: Order) {
    setBusy(true);
    try {
      await updateOrder(getOrderId(order), orderDraft);
      setEditingOrderId(null);
      setOrderDraft({});
      const list = await fetchAllOrders();
      setOrders(list);
    } catch (err) {
      alert(String(err));
    } finally {
      setBusy(false);
    }
  }

  function patchShipping(field: keyof ShippingDetails, value: string) {
    setOrderDraft(d => ({ ...d, shipping: { ...(d.shipping ?? {}) as ShippingDetails, [field]: value } }));
  }

  if (loading || !user?.isAdmin) return null;

  // ── Sidebar nav tabs ───────────────────────────────────────────────────────
  const navItems: { id: typeof tab; label: string; iconD: string; count?: number }[] = [
    { id: "overview",  label: "Overview",  iconD: ICONS.grid },
    { id: "products",  label: "Products",  iconD: ICONS.package, count: products.length },
    { id: "orders",    label: "Orders",    iconD: ICONS.orders,  count: orders.length },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--color-background)" }}>
      {/* ── Top bar ── */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="container-page h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Icon d={ICONS.store} size={14} />
            </div>
            <span className="font-display font-semibold text-base tracking-tight">Maison Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadAll}
              className="w-8 h-8 rounded-full border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="Refresh"
            >
              <Icon d={ICONS.refresh} size={15} />
            </button>
            <div className="text-xs text-muted-foreground hidden sm:block">{user.email}</div>
            <a href="/" className="btn-outline !py-1.5 !px-3 text-xs">← Store</a>
          </div>
        </div>
      </header>

      <div className="container-page py-8">
        <div className="flex gap-8">

          {/* ── Sidebar ── */}
          <aside className="w-52 shrink-0 hidden lg:block">
            <nav className="space-y-1 sticky top-24">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    tab === item.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon d={item.iconD} size={16} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-md ${tab === item.id ? "bg-white/20" : "bg-muted"}`}>
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* ── Mobile tabs ── */}
          <div className="lg:hidden flex gap-2 mb-6 w-full">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition ${
                  tab === item.id ? "bg-primary text-primary-foreground" : "bg-card border"
                }`}
              >
                <Icon d={item.iconD} size={14} />
                {item.label}
              </button>
            ))}
          </div>

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0">

            {/* ── Loading state ── */}
            {loadingData && (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card-surface h-24 animate-pulse opacity-50" />
                ))}
              </div>
            )}

            {!loadingData && (
              <>
                {/* ══ OVERVIEW ══════════════════════════════════════════════════ */}
                {tab === "overview" && (
                  <div className="space-y-8">
                    <div>
                      <h1 className="font-display text-3xl">Overview</h1>
                      <p className="text-muted-foreground text-sm mt-1">Your store at a glance</p>
                    </div>

                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      <StatCard label="Total Revenue" value={formatNGN(stats.revenue)} sub="From paid orders" iconD={ICONS.revenue} accent="bg-emerald-100 text-emerald-700" />
                      <StatCard label="Total Orders" value={stats.totalOrders} sub={`${stats.pending} pending`} iconD={ICONS.orders} accent="bg-blue-100 text-blue-700" />
                      <StatCard label="Products" value={products.length} sub={`${stats.lowStock} low stock`} iconD={ICONS.package} accent="bg-amber-100 text-amber-700" />
                      <StatCard label="Pending Orders" value={stats.pending} sub="Awaiting payment" iconD={ICONS.trending} accent="bg-rose-100 text-rose-700" />
                    </div>

                    {/* Recent orders */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl">Recent Orders</h2>
                        <button onClick={() => setTab("orders")} className="text-xs text-accent hover:underline">View all →</button>
                      </div>
                      {orders.length === 0 ? (
                        <div className="card-surface p-10 text-center text-muted-foreground text-sm">No orders yet.</div>
                      ) : (
                        <div className="card-surface overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">Reference</th>
                                <th className="text-left px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium hidden sm:table-cell">Email</th>
                                <th className="text-right px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">Amount</th>
                                <th className="text-center px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.slice(0, 5).map(order => (
                                <tr key={getOrderId(order)} className="border-b last:border-0 hover:bg-muted/40 transition">
                                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{order.reference}</td>
                                  <td className="px-5 py-3 hidden sm:table-cell">{order.email}</td>
                                  <td className="px-5 py-3 text-right font-medium">{formatNGN(order.total)}</td>
                                  <td className="px-5 py-3 text-center"><StatusBadge status={order.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Low stock */}
                    {stats.lowStock > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="font-display text-xl text-destructive">⚠ Low Stock</h2>
                          <button onClick={() => setTab("products")} className="text-xs text-accent hover:underline">Manage →</button>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {products.filter(p => p.stock <= 3).map(p => (
                            <div key={p._id ?? p.id} className="card-surface p-4 flex items-center gap-3 border-l-4 border-l-destructive">
                              <img src={p.image} alt={p.name} className="w-12 h-12 rounded-lg object-cover bg-secondary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{p.name}</div>
                                <div className="text-xs text-destructive font-semibold mt-0.5">{p.stock} left in stock</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ PRODUCTS ══════════════════════════════════════════════════ */}
                {tab === "products" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="font-display text-3xl">Products</h1>
                        <p className="text-muted-foreground text-sm mt-1">{products.length} items in your catalogue</p>
                      </div>
                      <button
                        onClick={() => { setShowForm(true); setEditingId(null); setDraft(emptyProduct); }}
                        className="btn-primary text-sm gap-2"
                      >
                        <Icon d={ICONS.plus} size={15} /> New product
                      </button>
                    </div>

                    {/* Product form modal */}
                    {showForm && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm" onClick={() => setShowForm(false)}>
                        <div className="card-surface w-full max-w-lg shadow-2xl p-7 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-5">
                            <h2 className="font-display text-2xl">{editingId ? "Edit product" : "New product"}</h2>
                            <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full border flex items-center justify-center text-muted-foreground hover:text-foreground transition">
                              <Icon d={ICONS.x} size={15} />
                            </button>
                          </div>
                          <form onSubmit={submitProduct} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="col-span-2">
                                <Field label="Name" value={draft.name} required onChange={v => setDraft(d => ({ ...d, name: v, slug: d.slug || v.toLowerCase().replace(/\s+/g, "-") }))} />
                              </div>
                              <Field label="Slug" value={draft.slug} required onChange={v => setDraft(d => ({ ...d, slug: v }))} />
                              <Field label="Category" value={draft.category} required onChange={v => setDraft(d => ({ ...d, category: v }))} />
                              <Field label="Price (NGN)" value={String(draft.price)} type="number" required onChange={v => setDraft(d => ({ ...d, price: Number(v) || 0 }))} />
                              <Field label="Stock" value={String(draft.stock)} type="number" required onChange={v => setDraft(d => ({ ...d, stock: Number(v) || 0 }))} />
                              <div className="col-span-2">
                                <Field label="Image URL" value={draft.image} required onChange={v => setDraft(d => ({ ...d, image: v }))} />
                                {draft.image && <img src={draft.image} className="mt-2 w-full h-36 object-cover rounded-lg bg-secondary" alt="preview" />}
                              </div>
                              <div className="col-span-2">
                                <label className="block">
                                  <span className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">Description</span>
                                  <textarea
                                    value={draft.description}
                                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                                    rows={3}
                                    className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 transition resize-none"
                                  />
                                </label>
                              </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                              <button type="submit" disabled={busy} className="btn-primary flex-1 text-sm">
                                <Icon d={ICONS.save} size={15} /> {busy ? "Saving…" : editingId ? "Save changes" : "Create product"}
                              </button>
                              <button type="button" onClick={() => setShowForm(false)} className="btn-outline text-sm">Cancel</button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* Products table */}
                    {products.length === 0 ? (
                      <div className="card-surface p-16 text-center">
                        <Icon d={ICONS.package} size={40} />
                        <p className="mt-4 text-muted-foreground">No products yet. Create your first one.</p>
                      </div>
                    ) : (
                      <div className="card-surface overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">Product</th>
                              <th className="text-left px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium hidden md:table-cell">Category</th>
                              <th className="text-right px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium">Price</th>
                              <th className="text-right px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground font-medium hidden sm:table-cell">Stock</th>
                              <th className="text-right px-5 py-3" />
                            </tr>
                          </thead>
                          <tbody>
                            {products.map(p => (
                              <tr key={p._id ?? p.id} className="border-b last:border-0 hover:bg-muted/20 transition group">
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-3">
                                    <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-secondary shrink-0" />
                                    <div>
                                      <div className="font-medium">{p.name}</div>
                                      <div className="text-xs text-muted-foreground">{p.slug}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3 hidden md:table-cell text-muted-foreground">{p.category}</td>
                                <td className="px-5 py-3 text-right font-medium tabular-nums">{formatNGN(p.price)}</td>
                                <td className="px-5 py-3 text-right hidden sm:table-cell">
                                  <span className={`font-medium ${p.stock <= 3 ? "text-destructive" : ""}`}>{p.stock}</span>
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button
                                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition"
                                      onClick={() => { setEditingId(p._id ?? p.id); setDraft(p); setShowForm(true); }}
                                      title="Edit"
                                    >
                                      <Icon d={ICONS.edit} size={14} />
                                    </button>
                                    <button
                                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition"
                                      onClick={() => onDelete(p._id ?? p.id, p.name)}
                                      title="Delete"
                                    >
                                      <Icon d={ICONS.trash} size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ ORDERS ════════════════════════════════════════════════════ */}
                {tab === "orders" && (
                  <div className="space-y-6">
                    <div>
                      <h1 className="font-display text-3xl">Orders</h1>
                      <p className="text-muted-foreground text-sm mt-1">{orders.length} total orders</p>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                      <input
                        type="search"
                        placeholder="Search by email or reference…"
                        value={orderSearch}
                        onChange={e => setOrderSearch(e.target.value)}
                        className="flex-1 min-w-48 rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                      />
                      <select
                        value={orderStatusFilter}
                        onChange={e => setOrderStatusFilter(e.target.value as Order["status"] | "all")}
                        className="rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                      >
                        <option value="all">All statuses</option>
                        {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <div className="text-sm text-muted-foreground self-center">{filteredOrders.length} result{filteredOrders.length !== 1 ? "s" : ""}</div>
                    </div>

                    {filteredOrders.length === 0 ? (
                      <div className="card-surface p-16 text-center text-muted-foreground text-sm">No orders match your filters.</div>
                    ) : (
                      <div className="space-y-3">
                        {filteredOrders.map(order => {
                          const id = getOrderId(order);
                          const editing = editingOrderId === id;
                          const shipping = (editing ? orderDraft.shipping : order.shipping) as ShippingDetails;
                          return (
                            <div key={id} className="card-surface overflow-hidden">
                              {/* Order header */}
                              <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-4 bg-muted/20">
                                <div className="space-y-0.5">
                                  <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">{order.reference}</div>
                                  <div className="font-medium text-sm">{order.email}</div>
                                  <div className="text-xs text-muted-foreground">{order.items.map(i => `${i.name} ×${i.quantity}`).join(" · ")}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <StatusBadge status={editing ? (orderDraft.status ?? order.status) : order.status} />
                                  <div className="font-display font-semibold">{formatNGN(order.total)}</div>
                                </div>
                              </div>

                              {/* Edit form */}
                              {editing ? (
                                <div className="p-5 border-t">
                                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    <div>
                                      <label className="block">
                                        <span className="text-[11px] uppercase tracking-widest font-semibold text-muted-foreground">Status</span>
                                        <select
                                          value={orderDraft.status ?? order.status}
                                          onChange={e => setOrderDraft(d => ({ ...d, status: e.target.value as Order["status"] }))}
                                          className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                                        >
                                          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                      </label>
                                    </div>
                                    <Field label="Name" value={shipping?.name ?? ""} onChange={v => patchShipping("name", v)} />
                                    <Field label="Phone" value={shipping?.phone ?? ""} onChange={v => patchShipping("phone", v)} />
                                    <div className="sm:col-span-2 md:col-span-1">
                                      <Field label="Address" value={shipping?.address ?? ""} onChange={v => patchShipping("address", v)} />
                                    </div>
                                    <Field label="City" value={shipping?.city ?? ""} onChange={v => patchShipping("city", v)} />
                                    <Field label="State" value={shipping?.state ?? ""} onChange={v => patchShipping("state", v)} />
                                  </div>
                                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
                                    <button onClick={() => { setEditingOrderId(null); setOrderDraft({}); }} className="btn-outline text-sm !py-2 !px-4">Cancel</button>
                                    <button onClick={() => saveOrder(order)} disabled={busy} className="btn-primary text-sm !py-2 !px-4">
                                      <Icon d={ICONS.save} size={14} /> {busy ? "Saving…" : "Save order"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="px-5 py-3 border-t flex items-center justify-between gap-4">
                                  <div className="text-xs text-muted-foreground">
                                    {shipping?.name && <span>{shipping.name} · </span>}
                                    {shipping?.address && <span>{shipping.address}, {shipping.city}, {shipping.state}</span>}
                                    {shipping?.phone && <span> · {shipping.phone}</span>}
                                  </div>
                                  <button onClick={() => startOrderEdit(order)} className="btn-outline text-xs !py-1.5 !px-3 shrink-0">
                                    <Icon d={ICONS.edit} size={13} /> Edit
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
