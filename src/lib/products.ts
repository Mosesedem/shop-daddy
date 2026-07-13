import { db, paperdbEnabled } from "./paperdb";
import { log } from "./logger";
import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";
import p4 from "@/assets/p4.jpg";
import p5 from "@/assets/p5.jpg";
import p6 from "@/assets/p6.jpg";

export type Product = {
  _id?: string;
  id: string;
  name: string;
  slug: string;
  price: number;      // in kobo cents? we'll use whole units NGN
  description: string;
  image: string;
  category: string;
  stock: number;
};

// Seed data used when PaperDB isn't configured (or as demo fallback).
export const seedProducts: Product[] = [
  { id: "vase-terracotta",   name: "Terracotta Vase",        slug: "vase-terracotta",   price: 24000, image: p1, category: "Ceramics", stock: 12, description: "Hand-thrown terracotta vase with a subtle wheel-line finish. A quiet centerpiece for dried grasses or a single stem." },
  { id: "linen-towel-set",   name: "Linen Towel Set",        slug: "linen-towel-set",   price: 18500, image: p2, category: "Textiles", stock: 30, description: "Set of four heavyweight linen tea towels in warm oat and cocoa. Softens beautifully with every wash." },
  { id: "walnut-pepper-mill",name: "Walnut Pepper Mill",     slug: "walnut-pepper-mill",price: 32000, image: p3, category: "Kitchen",  stock: 8,  description: "Turned walnut pepper mill with a ceramic grinding mechanism. Includes a small brass measuring scoop." },
  { id: "stoneware-mug",     name: "Stoneware Mug",          slug: "stoneware-mug",     price: 9500,  image: p4, category: "Ceramics", stock: 40, description: "Everyday stoneware mug with a matte cocoa glaze. Wheel-thrown, dishwasher safe, quietly perfect." },
  { id: "amber-soy-candle",  name: "Amber Soy Candle",       slug: "amber-soy-candle",  price: 15000, image: p5, category: "Home",     stock: 25, description: "Hand-poured soy candle with warm notes of amber, oat milk, and vetiver. 50-hour burn time." },
  { id: "jute-market-basket",name: "Jute Market Basket",     slug: "jute-market-basket",price: 21000, image: p6, category: "Home",     stock: 15, description: "Sturdy handwoven jute basket with vegetable-tanned leather handles. Made for market days and quiet weekends." },
];

export async function fetchProducts(): Promise<Product[]> {
  log.event("products:list", { source: paperdbEnabled ? "paperdb" : "seed" });
  if (!paperdbEnabled) return seedProducts;
  try {
    const docs = await db.products.find({ limit: 100 });
    const list = (docs?.documents ?? docs ?? []) as Product[];
    if (!list.length) {
      log.warn("products:empty:seeding");
      return seedProducts;
    }
    return list;
  } catch (err) {
    log.error("products:fetch:failed", { error: String(err) });
    return seedProducts;
  }
}

export async function fetchProduct(slug: string): Promise<Product | null> {
  log.event("product:get", { slug });
  const all = await fetchProducts();
  return all.find((p) => p.slug === slug || p.id === slug || p._id === slug) ?? null;
}

export async function createProduct(input: Omit<Product, "id"> & { id?: string }) {
  log.event("product:create", { name: input.name });
  if (!paperdbEnabled) throw new Error("PaperDB not configured");
  return await db.products.insert({ ...input, id: input.id ?? input.slug });
}

export async function updateProduct(id: string, patch: Partial<Product>) {
  log.event("product:update", { id });
  if (!paperdbEnabled) throw new Error("PaperDB not configured");
  return await db.products.update(id, patch);
}

export async function deleteProduct(id: string) {
  log.event("product:delete", { id });
  if (!paperdbEnabled) throw new Error("PaperDB not configured");
  return await db.products.delete(id);
}
