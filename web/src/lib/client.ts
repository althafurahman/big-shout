"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Tiny fetch helpers + polling hook — realtime UI without a socket stack. */

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
  return data;
}

export function usePoll<T = any>(path: string | null, intervalMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const refresh = useCallback(async () => {
    if (!pathRef.current) return;
    try {
      setData(await api<T>(pathRef.current));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [path, intervalMs, refresh]);

  return { data, error, refresh };
}

export interface Me {
  username: string;
  points: number;
  streak: number;
  bestStreak: number;
  correct: number;
  total: number;
}

export function useMe() {
  const { data, refresh } = usePoll<{ user: Me | null }>("/api/me", 15_000);
  return { me: data?.user ?? null, loaded: data !== null, refresh };
}

/** Guest swipes live in localStorage until the fan signs up. */
export interface GuestCall {
  question: string;
  side: boolean;
  oddsBps: number;
  ts: number;
}

export function recordGuestCall(call: GuestCall) {
  try {
    const all = JSON.parse(localStorage.getItem("bigshout_guest") ?? "[]");
    all.push(call);
    localStorage.setItem("bigshout_guest", JSON.stringify(all.slice(-50)));
  } catch {
    /* storage unavailable — guest play is best-effort */
  }
}

export function guestCalls(): GuestCall[] {
  try {
    return JSON.parse(localStorage.getItem("bigshout_guest") ?? "[]");
  } catch {
    return [];
  }
}
