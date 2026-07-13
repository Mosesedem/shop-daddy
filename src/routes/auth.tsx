import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Maison" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "signin") await signIn(form.email, form.password);
      else await signUp(form.email, form.password, form.name);
      log.info("auth:redirect-after-login");
      navigate({ to: "/account" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-16 md:py-24 max-w-md">
      <h1 className="font-display text-4xl">{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {mode === "signin" ? "Sign in to view your orders and check out faster." : "Save your shipping details and track orders."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        {mode === "signup" && (
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        )}
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
        <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-6 text-sm text-muted-foreground underline underline-offset-4"
      >
        {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        className="mt-1 w-full rounded-md border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
