"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/client";

/** Two fields. Appears only when you want your calls to count. Honors
 *  ?next= so a shared room/receipt link lands you back where you were. */
function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only ever follow internal paths — a link can't bounce users off-site.
  const rawNext = params.get("next") ?? "/feed";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/feed";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.push(next);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-14">
      <h1 className="display text-center text-4xl">
        {mode === "signup" ? "Make it count" : "Welcome back"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted">
        {mode === "signup"
          ? "A name and a password — that's the whole form. Your calls, points and streak are saved from here on."
          : "Pick up where you left off."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-brand"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none transition focus:border-brand"
        />
        {error && <p className="text-sm font-semibold text-no">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-brand py-3 font-bold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        className="mt-4 w-full text-center text-sm text-muted hover:text-ink"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Sign up"}
      </button>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
