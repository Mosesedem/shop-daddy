import { requirePaperDB } from "./paperdb";
import { log } from "./logger";

export type Product = {
  _id?: string;
  id: string;
  name: string;
  slug: string;
  price: number; // in kobo cents? we'll use whole units NGN
  description: string;
  image: string;
  category: string;
  stock: number;
  featured?: boolean;
};

export async function fetchProducts(): Promise<Product[]> {
  log.event("products:list", { source: "paperdb" });
  try {
    const docs = await requirePaperDB().products.find({
      limit: 100,
    });
    const list = (docs?.documents ?? docs ?? []) as Product[];
    if (!list.length)
      log.warn("products:empty", { action: "run pnpm seed:paperdb" });
    log.info("products:list:loaded", { count: list.length });
    return list;
  } catch (err) {
    log.error("products:fetch:failed", { error: String(err) });
    throw err;
  }
}

export async function fetchProduct(slug: string): Promise<Product | null> {
  log.event("product:get", { slug });
  const docs = await requirePaperDB().products.find({
    filter: { slug },
    limit: 1,
  });
  const bySlug = ((docs?.documents ?? docs ?? []) as Product[])[0];
  if (bySlug) return bySlug;
  const byId = await requirePaperDB().products.find({
    filter: { id: slug },
    limit: 1,
  });
  return ((byId?.documents ?? byId ?? []) as Product[])[0] ?? null;
}

export async function createProduct(
  input: Omit<Product, "id"> & { id?: string },
) {
  log.event("product:create", { name: input.name });
  const now = new Date().toISOString();
  return await requirePaperDB().products.insert({
    ...input,
    id: input.id ?? input.slug,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateProduct(id: string, patch: Partial<Product>) {
  log.event("product:update", { id });
  return await requirePaperDB().products.update(id, patch);
}

export async function deleteProduct(id: string) {
  log.event("product:delete", { id });
  return await requirePaperDB().products.delete(id);
}
