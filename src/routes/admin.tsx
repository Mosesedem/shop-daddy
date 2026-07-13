import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

const empty: Omit<Product, "id"> & { id?: string } = {
  name: "",
  slug: "",
  price: 0,
  description: "",
  image: "",
  category: "Home",
  stock: 0,
};

const orderStatuses: Order["status"][] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "fulfilled",
  "cancelled",
  "failed",
  "abandoned",
];

function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<Partial<Order>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!user.isAdmin) {
      navigate({ to: "/" });
      return;
    }
    refreshProducts();
    refreshOrders();
  }, [user, loading, navigate]);

  async function refreshProducts() {
    try {
      const list = await fetchProducts();
      setProducts(list);
      log.info("admin:products:loaded", { count: list.length });
    } catch (err) {
      log.exception("admin:products:load-failed", err);
      alert(String(err));
    }
  }

  async function refreshOrders() {
    try {
      const list = await fetchAllOrders();
      setOrders(list);
      log.info("admin:orders:loaded", { count: list.length });
    } catch (err) {
      log.exception("admin:orders:load-failed", err);
      alert(String(err));
    }
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
      setDraft(empty);
      setEditingId(null);
      await refreshProducts();
    } catch (err) {
      log.exception("admin:save:failed", err);
      alert(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    log.event("admin:delete:click", { id });
    if (!confirm("Delete this product?")) {
      log.warn("admin:delete:cancelled", { id });
      return;
    }
    try {
      await deleteProduct(id);
      await refreshProducts();
    } catch (err) {
      log.exception("admin:delete:failed", err, { id });
      alert(String(err));
    }
  }

  function startOrderEdit(order: Order) {
    const id = getOrderId(order);
    log.event("admin:order:edit:click", { id, reference: order.reference });
    setEditingOrderId(id);
    setOrderDraft({
      status: order.status,
      shipping: order.shipping,
    });
  }

  async function saveOrder(order: Order) {
    const id = getOrderId(order);
    setBusy(true);
    try {
      await updateOrder(id, orderDraft);
      setEditingOrderId(null);
      setOrderDraft({});
      await refreshOrders();
      log.info("admin:order:saved", { id, reference: order.reference });
    } catch (err) {
      log.exception("admin:order:save:failed", err, { id });
      alert(String(err));
    } finally {
      setBusy(false);
    }
  }

  function updateShipping(field: keyof ShippingDetails, value: string) {
    const shipping = (orderDraft.shipping ?? {}) as ShippingDetails;
    setOrderDraft({
      ...orderDraft,
      shipping: {
        ...shipping,
        [field]: value,
      },
    });
  }

  if (loading || !user?.isAdmin) return null;

  return (
    <div className="container-page py-12">
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Admin
      </div>
      <h1 className="font-display text-4xl mt-2">Products</h1>
      <div className="mt-6 inline-flex rounded-md border p-1 bg-card">
        <button
          type="button"
          onClick={() => {
            log.event("admin:tab", { tab: "products" });
            setTab("products");
          }}
          className={`px-4 py-2 rounded text-sm ${tab === "products" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => {
            log.event("admin:tab", { tab: "orders" });
            setTab("orders");
          }}
          className={`px-4 py-2 rounded text-sm ${tab === "orders" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          Orders
        </button>
      </div>

      {tab === "products" ? (
        <div className="mt-10 grid lg:grid-cols-3 gap-10">
          <form
            onSubmit={submit}
            className="card-surface p-6 space-y-3 lg:sticky lg:top-24 h-fit"
          >
            <h2 className="font-display text-2xl">
              {editingId ? "Edit product" : "New product"}
            </h2>
            <F
              label="Name"
              v={draft.name}
              on={(v) =>
                setDraft({
                  ...draft,
                  name: v,
                  slug: draft.slug || v.toLowerCase().replace(/\s+/g, "-"),
                })
              }
            />
            <F
              label="Slug"
              v={draft.slug}
              on={(v) => setDraft({ ...draft, slug: v })}
            />
            <F
              label="Category"
              v={draft.category}
              on={(v) => setDraft({ ...draft, category: v })}
            />
            <F
              label="Image URL"
              v={draft.image}
              on={(v) => setDraft({ ...draft, image: v })}
            />
            <F
              label="Price (NGN)"
              v={String(draft.price)}
              on={(v) => setDraft({ ...draft, price: Number(v) || 0 })}
            />
            <F
              label="Stock"
              v={String(draft.stock)}
              on={(v) => setDraft({ ...draft, stock: Number(v) || 0 })}
            />
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Description
              </span>
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                rows={4}
                className="mt-1 w-full rounded-md border bg-card px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              <button disabled={busy} className="btn-primary flex-1">
                {editingId ? "Save" : "Create"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setDraft(empty);
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="lg:col-span-2 space-y-3">
            {products.map((p) => (
              <div
                key={p._id ?? p.id}
                className="card-surface p-4 flex items-center gap-4"
              >
                <img
                  src={p.image}
                  alt={p.name}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-lg object-cover bg-secondary"
                />
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.category} · {formatNGN(p.price)} · {p.stock} in stock
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-outline text-sm"
                    onClick={() => {
                      log.event("admin:edit:click", { id: p._id ?? p.id });
                      setEditingId(p._id ?? p.id);
                      setDraft(p);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-outline text-sm"
                    onClick={() => onDelete(p._id ?? p.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-10 space-y-4">
          {orders.length === 0 ? (
            <div className="card-surface p-8 text-sm text-muted-foreground">
              No orders yet.
            </div>
          ) : (
            orders.map((order) => {
              const id = getOrderId(order);
              const editing = editingOrderId === id;
              const shipping = (
                editing ? orderDraft.shipping : order.shipping
              ) as ShippingDetails;
              return (
                <div key={id} className="card-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">
                        {order.reference}
                      </div>
                      <div className="mt-1 font-medium">{order.email}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {order.items
                          .map((item) => `${item.name} x ${item.quantity}`)
                          .join(", ")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {formatNGN(order.total)}
                      </div>
                      {!editing && (
                        <div className="mt-1 text-xs uppercase tracking-widest text-accent">
                          {order.status}
                        </div>
                      )}
                    </div>
                  </div>

                  {editing ? (
                    <div className="mt-5 grid md:grid-cols-3 gap-3">
                      <label className="block">
                        <span className="text-xs uppercase tracking-widest text-muted-foreground">
                          Status
                        </span>
                        <select
                          value={orderDraft.status ?? order.status}
                          onChange={(event) =>
                            setOrderDraft({
                              ...orderDraft,
                              status: event.target.value as Order["status"],
                            })
                          }
                          className="mt-1 w-full rounded-md border bg-card px-3 py-2"
                        >
                          {orderStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <F
                        label="Name"
                        v={shipping?.name ?? ""}
                        on={(value) => updateShipping("name", value)}
                      />
                      <F
                        label="Phone"
                        v={shipping?.phone ?? ""}
                        on={(value) => updateShipping("phone", value)}
                      />
                      <F
                        label="Address"
                        v={shipping?.address ?? ""}
                        on={(value) => updateShipping("address", value)}
                      />
                      <F
                        label="City"
                        v={shipping?.city ?? ""}
                        on={(value) => updateShipping("city", value)}
                      />
                      <F
                        label="State"
                        v={shipping?.state ?? ""}
                        on={(value) => updateShipping("state", value)}
                      />
                      <div className="md:col-span-3 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOrderId(null);
                            setOrderDraft({});
                          }}
                          className="btn-outline"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveOrder(order)}
                          className="btn-primary"
                        >
                          Save order
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t pt-4">
                      <div className="text-sm text-muted-foreground">
                        <div>{shipping?.name}</div>
                        <div>
                          {shipping?.address}, {shipping?.city},{" "}
                          {shipping?.state}
                        </div>
                        <div>{shipping?.phone}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startOrderEdit(order)}
                        className="btn-outline"
                      >
                        Edit order
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function F(props: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">
        {props.label}
      </span>
      <input
        value={props.v}
        onChange={(e) => props.on(e.target.value)}
        className="mt-1 w-full rounded-md border bg-card px-3 py-2"
      />
    </label>
  );
}
