import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Maison" },
      { name: "description", content: "Browse the full catalog of Maison ceramics, textiles and home essentials." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["All", ...Array.from(set)];
  }, [products]);
  const [cat, setCat] = useState<string>("All");
  const filtered = cat === "All" ? products : products.filter((p) => p.category === cat);

  return (
    <div className="container-page py-12 md:py-16">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">The Shop</div>
        <h1 className="font-display text-4xl md:text-5xl mt-2">All objects</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-10">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-transparent hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}
