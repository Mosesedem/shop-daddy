import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchProduct } from "@/lib/products";
import { useCart, formatNGN } from "@/lib/cart";
import { log } from "@/lib/logger";
import { Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/products/$id")({
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id),
  });
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const navigate = useNavigate();

  if (isLoading) {
    return <div className="container-page py-16"><div className="h-96 bg-muted rounded-2xl animate-pulse" /></div>;
  }
  if (!product) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-display text-3xl">Not found</h1>
        <Link to="/shop" className="btn-outline mt-6 inline-flex">Back to shop</Link>
      </div>
    );
  }

  return (
    <div className="container-page py-10 md:py-16">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16">
        <div className="aspect-square rounded-3xl overflow-hidden bg-secondary">
          <img src={product.image} alt={product.name} width={1024} height={1024} className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{product.category}</div>
          <h1 className="font-display text-4xl md:text-5xl mt-2">{product.name}</h1>
          <div className="mt-4 text-2xl">{formatNGN(product.price)}</div>
          <p className="mt-6 text-muted-foreground leading-relaxed">{product.description}</p>

          <div className="mt-8 flex items-center gap-4">
            <div className="inline-flex items-center border rounded-full">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-3" aria-label="Decrease"><Minus className="w-4 h-4" /></button>
              <span className="w-8 text-center">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} className="p-3" aria-label="Increase"><Plus className="w-4 h-4" /></button>
            </div>
            <button
              className="btn-accent"
              onClick={() => {
                add(product, qty);
                log.event("product:added-to-cart", { productId: product.id, qty });
              }}
            >
              Add to cart
            </button>
            <button
              className="btn-outline"
              onClick={() => {
                add(product, qty);
                navigate({ to: "/checkout" });
              }}
            >
              Buy now
            </button>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-muted-foreground">Materials</dt><dd className="mt-1">Handcrafted, natural</dd></div>
            <div><dt className="text-muted-foreground">Shipping</dt><dd className="mt-1">2–5 business days</dd></div>
            <div><dt className="text-muted-foreground">Stock</dt><dd className="mt-1">{product.stock} left</dd></div>
            <div><dt className="text-muted-foreground">Returns</dt><dd className="mt-1">30 days</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
