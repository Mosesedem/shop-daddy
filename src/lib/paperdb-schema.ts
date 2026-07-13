export const schema = {
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
  orders: {
    properties: {
      userId: { type: "string" },
      email: { type: "string", required: true },
      items: { type: "array", required: true },
      total: { type: "number", required: true },
      status: { type: "string", required: true },
      reference: { type: "string", required: true, unique: true },
      shipping: { type: "object", required: true },
      paymentProvider: { type: "string" },
      paystackEvent: { type: "object" },
      paidAt: { type: "string" },
      createdAt: { type: "string" },
      updatedAt: { type: "string" },
    },
  },
} as const;
