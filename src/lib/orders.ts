import { log } from "./logger";
import { requirePaperDB } from "./paperdb";

export type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

export type ShippingDetails = {
  email: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
};

export type Order = {
  _id?: string;
  id?: string;
  userId?: string | null;
  email: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "paid" | "failed" | "abandoned";
  reference: string;
  shipping: ShippingDetails;
  paymentProvider?: string;
  paystackEvent?: Record<string, unknown>;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

function documents<T>(result: unknown): T[] {
  const wrapped = result as { documents?: T[] } | undefined;
  return wrapped?.documents ?? (Array.isArray(result) ? (result as T[]) : []);
}

function documentId(order: Order): string {
  return order._id ?? order.id ?? order.reference;
}

export async function createPendingOrder(input: {
  userId?: string | null;
  email: string;
  items: OrderItem[];
  total: number;
  reference: string;
  shipping: ShippingDetails;
}) {
  const now = new Date().toISOString();
  log.event("order:create-pending", {
    reference: input.reference,
    total: input.total,
    itemCount: input.items.length,
  });
  return await requirePaperDB().orders.insert({
    ...input,
    status: "pending",
    paymentProvider: "paystack",
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateOrderStatusByReference(
  reference: string,
  patch: Partial<Order>,
) {
  log.event("order:update-by-reference", { reference, status: patch.status });
  const result = await requirePaperDB().orders.find({
    filter: { reference },
    limit: 1,
  });
  const order = documents<Order>(result)[0];
  if (!order) {
    log.warn("order:update-by-reference:not-found", { reference });
    return null;
  }
  return await requirePaperDB().orders.update(documentId(order), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function markOrderPaid(
  reference: string,
  paystackEvent?: Record<string, unknown>,
) {
  log.event("order:mark-paid", { reference });
  return await updateOrderStatusByReference(reference, {
    status: "paid",
    paidAt: new Date().toISOString(),
    paystackEvent,
  });
}

export async function markOrderFailed(
  reference: string,
  paystackEvent?: Record<string, unknown>,
) {
  log.event("order:mark-failed", { reference });
  return await updateOrderStatusByReference(reference, {
    status: "failed",
    paystackEvent,
  });
}

export async function fetchOrdersForEmail(email: string): Promise<Order[]> {
  log.event("orders:list-for-email", { email });
  const result = await requirePaperDB().orders.find({
    filter: { email },
    sort: "-createdAt",
    limit: 25,
  });
  const list = documents<Order>(result);
  log.info("orders:list-for-email:loaded", { email, count: list.length });
  return list;
}
