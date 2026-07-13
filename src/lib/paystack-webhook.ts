import { env } from "./env";
import { log } from "./logger";
import { markOrderFailed, markOrderPaid } from "./orders";

type PaystackEvent = {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

async function hmacSha512Hex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function verifyPaystackSignature(request: Request, body: string) {
  const secret = env("PAYSTACK_SECRET_KEY") || env("VITE_PAYSTACK_SECRET_KEY");
  if (!secret) {
    log.error("paystack:webhook:missing-secret");
    return false;
  }
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = await hmacSha512Hex(secret, body);
  return constantTimeEqual(signature, expected);
}

async function processPaystackEvent(event: PaystackEvent) {
  const reference = event.data?.reference;
  log.event("paystack:webhook:event", {
    event: event.event,
    reference,
    status: event.data?.status,
  });

  if (!reference) {
    log.warn("paystack:webhook:missing-reference", { event: event.event });
    return;
  }

  const eventPayload = event as Record<string, unknown>;
  if (event.event === "charge.success" || event.data?.status === "success") {
    await markOrderPaid(reference, eventPayload);
    return;
  }

  if (event.event?.includes("failed") || event.data?.status === "failed") {
    await markOrderFailed(reference, eventPayload);
  }
}

export async function handlePaystackWebhook(request: Request) {
  if (request.method !== "POST") {
    return Response.json({ ok: false }, { status: 405 });
  }

  const body = await request.text();
  if (!(await verifyPaystackSignature(request, body))) {
    log.error("paystack:webhook:invalid-signature", {
      hasSignature: Boolean(request.headers.get("x-paystack-signature")),
    });
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const event = JSON.parse(body) as PaystackEvent;
    await processPaystackEvent(event);
    return Response.json({ ok: true });
  } catch (error) {
    log.exception("paystack:webhook:failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
