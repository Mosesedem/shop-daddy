import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/products";
import { formatNGN } from "@/lib/cart";
import { log } from "@/lib/logger";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      to="/products/$id"
      params={{ id: product.slug }}
      className="group block"
      onClick={() =>
        log.event("product-card:click", {
          productId: product.id,
          slug: product.slug,
        })
      }
    >
      <div className="aspect-square overflow-hidden rounded-2xl bg-secondary">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          width={800}
          height={800}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {product.category}
          </div>
          <h3 className="font-display text-lg mt-1">{product.name}</h3>
        </div>
        <div className="font-medium">{formatNGN(product.price)}</div>
      </div>
    </Link>
  );
}
