"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/client";

/** Shown to signed-out visitors: you can look at everything and try the
 *  swipe, but nothing counts until there's an account behind it. */
export default function GuestBanner() {
  const { me, loaded } = useMe();
  const path = usePathname();
  if (!loaded || me) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5 text-sm">
      <span>
        <strong>You&apos;re trying BigShout as a guest.</strong>{" "}
        <span className="text-muted">Swipes here don&apos;t count yet — sign up to lock real calls and earn points.</span>
      </span>
      <Link
        href={`/auth?next=${encodeURIComponent(path ?? "/feed")}`}
        className="shrink-0 rounded-full bg-brand px-4 py-1 text-sm font-bold text-black transition hover:brightness-110"
      >
        Start calling it
      </Link>
    </div>
  );
}
