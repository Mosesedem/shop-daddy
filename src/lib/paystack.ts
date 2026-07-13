// Paystack Inline (client-side popup). Loads the script on demand.
// Note: this uses the Paystack public key; verification of the charge
// should ideally happen server-side, but this project is intentionally
// frontend-only per user requirements. We log every event.
import { log } from "./logger";
import { env } from "./env";

type PaystackHandler = {
  openIframe: () => void;
};
type PaystackPopStatic = {
  setup: (opts: Record<string, unknown>) => PaystackHandler;
};
declare global {
  interface Window {
    PaystackPop?: PaystackPopStatic;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("no window"));
  if (window.PaystackPop) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.async = true;
    s.onload = () => {
      log.info("paystack:script:loaded");
      resolve();
    };
    s.onerror = () => {
      log.error("paystack:script:failed");
      reject(new Error("Paystack script failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type PayInput = {
  email: string;
  amountNGN: number; // whole naira; converted to kobo
  reference: string;
  onSuccess: (ref: string) => void;
  onCancel?: () => void;
  metadata?: Record<string, unknown>;
};

export async function payWithPaystack(input: PayInput): Promise<void> {
  const pk = env("VITE_PAYSTACK_PUBLIC_KEY");
  log.event("paystack:start", {
    reference: input.reference,
    amountNGN: input.amountNGN,
    hasKey: Boolean(pk),
  });

  if (!pk) {
    log.error("paystack:no-public-key");
    throw new Error("Paystack public key is not configured.");
  }

  await loadScript();
  const handler = window.PaystackPop!.setup({
    key: pk,
    email: input.email,
    amount: Math.round(input.amountNGN * 100), // kobo
    currency: "NGN",
    ref: input.reference,
    metadata: input.metadata ?? {},
    callback: (r: { reference: string }) => {
      log.info("paystack:callback:success", { reference: r.reference });
      input.onSuccess(r.reference);
    },
    onClose: () => {
      log.warn("paystack:closed");
      input.onCancel?.();
    },
  });
  handler.openIframe();
}
