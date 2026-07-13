import { createClient } from "paperdb-js";

const apiKey =
  process.env.PAPERDB_API_KEY ?? process.env.VITE_PAPERDB_API_KEY ?? "";

if (!apiKey) {
  console.error("Missing PAPERDB_API_KEY or VITE_PAPERDB_API_KEY.");
  process.exit(1);
}

const schema = {
  products: {
    properties: {
      id: { type: "string", required: true, unique: true },
      name: { type: "string", required: true },
      slug: { type: "string", required: true, unique: true },
      price: { type: "number", required: true },
      description: { type: "string" },
      image: { type: "string", required: true },
      category: { type: "string", required: true },
      stock: { type: "number", required: true },
      featured: { type: "boolean" },
      createdAt: { type: "string" },
      updatedAt: { type: "string" },
    },
  },
};

const products = [
  {
    id: "vase-terracotta",
    name: "Terracotta Vase",
    slug: "vase-terracotta",
    price: 24000,
    image:
      "https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=1200&q=80",
    category: "Ceramics",
    stock: 12,
    featured: true,
    description: "Hand-thrown terracotta vase with a subtle wheel-line finish.",
  },
  {
    id: "linen-towel-set",
    name: "Linen Towel Set",
    slug: "linen-towel-set",
    price: 18500,
    image:
      "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=80",
    category: "Textiles",
    stock: 30,
    featured: true,
    description:
      "Set of four heavyweight linen tea towels in warm oat and cocoa.",
  },
  {
    id: "walnut-pepper-mill",
    name: "Walnut Pepper Mill",
    slug: "walnut-pepper-mill",
    price: 32000,
    image:
      "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1200&q=80",
    category: "Kitchen",
    stock: 8,
    featured: true,
    description: "Turned walnut pepper mill with a ceramic grinding mechanism.",
  },
  {
    id: "stoneware-mug",
    name: "Stoneware Mug",
    slug: "stoneware-mug",
    price: 9500,
    image:
      "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=80",
    category: "Ceramics",
    stock: 40,
    featured: false,
    description: "Everyday stoneware mug with a matte cocoa glaze.",
  },
  {
    id: "amber-soy-candle",
    name: "Amber Soy Candle",
    slug: "amber-soy-candle",
    price: 15000,
    image:
      "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?auto=format&fit=crop&w=1200&q=80",
    category: "Home",
    stock: 25,
    featured: false,
    description:
      "Hand-poured soy candle with warm notes of amber, oat milk, and vetiver.",
  },
  {
    id: "jute-market-basket",
    name: "Jute Market Basket",
    slug: "jute-market-basket",
    price: 21000,
    image:
      "https://images.unsplash.com/photo-1597484661643-2f5fef640dd1?auto=format&fit=crop&w=1200&q=80",
    category: "Home",
    stock: 15,
    featured: false,
    description:
      "Sturdy handwoven jute basket with vegetable-tanned leather handles.",
  },
];

const db = createClient({ apiKey, schema });

for (const product of products) {
  const now = new Date().toISOString();
  const existing = await db.products.find({
    filter: { slug: product.slug },
    limit: 1,
  });
  const doc =
    existing?.documents?.[0] ?? (Array.isArray(existing) ? existing[0] : null);

  if (doc?._id || doc?.id) {
    const id = doc._id ?? doc.id;
    await db.products.update(id, { ...product, updatedAt: now });
    console.log(`updated ${product.slug}`);
  } else {
    await db.products.insert({ ...product, createdAt: now, updatedAt: now });
    console.log(`inserted ${product.slug}`);
  }
}
