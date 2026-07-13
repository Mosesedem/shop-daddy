import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { createProduct, deleteProduct, fetchProducts, updateProduct, type Product } from "@/lib/products";
import { paperdbEnabled } from "@/lib/paperdb";
import { formatNGN } from "@/lib/cart";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Maison" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

const empty: Omit<Product, "id"> & { id?: string } = {
  name: "", slug: "", price: 0, description: "", image: "", category: "Home", stock: 0,
};

function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    if (!user.isAdmin) { navigate({ to: "/" }); return; }
    refresh();
  }, [user, loading, navigate]);

  async function refresh() {
    const list = await fetchProducts();
    setProducts(list);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await updateProduct(editingId, draft);
      } else {
        await createProduct(draft);
      }
      setDraft(empty); setEditingId(null);
      await refresh();
    } catch (err) {
      log.error("admin:save:failed", { error: String(err) });
      alert(String(err));
    } finally { setBusy(false); }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      await refresh();
    } catch (err) {
      alert(String(err));
    }
  }

  if (loading || !user?.isAdmin) return null;

  return (
    <div className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin</div>
      <h1 className="font-display text-4xl mt-2">Products</h1>

      {!paperdbEnabled && (
        <div className="mt-4 card-surface p-4 text-sm">
          PaperDB isn't configured yet. Add <code className="font-mono">VITE_PAPERDB_API_KEY</code> to enable admin writes.
          The shop below runs on demo data.
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-3 gap-10">
        <form onSubmit={submit} className="card-surface p-6 space-y-3 lg:sticky lg:top-24 h-fit">
          <h2 className="font-display text-2xl">{editingId ? "Edit product" : "New product"}</h2>
          <F label="Name" v={draft.name} on={(v) => setDraft({ ...draft, name: v, slug: draft.slug || v.toLowerCase().replace(/\s+/g, "-") })} />
          <F label="Slug" v={draft.slug} on={(v) => setDraft({ ...draft, slug: v })} />
          <F label="Category" v={draft.category} on={(v) => setDraft({ ...draft, category: v })} />
          <F label="Image URL" v={draft.image} on={(v) => setDraft({ ...draft, image: v })} />
          <F label="Price (NGN)" v={String(draft.price)} on={(v) => setDraft({ ...draft, price: Number(v) || 0 })} />
          <F label="Stock" v={String(draft.stock)} on={(v) => setDraft({ ...draft, stock: Number(v) || 0 })} />
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Description</span>
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={4} className="mt-1 w-full rounded-md border bg-card px-3 py-2" />
          </label>
          <div className="flex gap-2">
            <button disabled={busy || !paperdbEnabled} className="btn-primary flex-1">{editingId ? "Save" : "Create"}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(empty); }} className="btn-outline">Cancel</button>}
          </div>
        </form>

        <div className="lg:col-span-2 space-y-3">
          {products.map((p) => (
            <div key={p._id ?? p.id} className="card-surface p-4 flex items-center gap-4">
              <img src={p.image} alt={p.name} width={64} height={64} className="w-16 h-16 rounded-lg object-cover bg-secondary" />
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.category} · {formatNGN(p.price)} · {p.stock} in stock</div>
              </div>
              <div className="flex gap-2">
                <button className="btn-outline text-sm" disabled={!paperdbEnabled} onClick={() => { setEditingId(p._id ?? p.id); setDraft(p); }}>Edit</button>
                <button className="btn-outline text-sm" disabled={!paperdbEnabled} onClick={() => onDelete(p._id ?? p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function F(props: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{props.label}</span>
      <input value={props.v} onChange={(e) => props.on(e.target.value)} className="mt-1 w-full rounded-md border bg-card px-3 py-2" />
    </label>
  );
}
