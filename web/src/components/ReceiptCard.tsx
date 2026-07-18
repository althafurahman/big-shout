"use client";

import { useState } from "react";
import { fmtOdds, rarity } from "@/lib/meta";

export interface ReceiptData {
  username: string;
  question: string;
  side: boolean;
  amount: number;
  oddsBps: number;
  lockedTs: number;
  status: string; // open | yes_won | no_won
  won: boolean;
  claimed: boolean;
  fixture: { p1: string; p2: string; simulated?: boolean } | null;
  links?: { lockTx?: string | null; settleTx?: string | null; verify?: string | null };
  positionPda?: string;
}

/** The flex object. Built to be screenshotted into a group chat. */
export default function ReceiptCard({ receipt }: { receipt: ReceiptData }) {
  const [copied, setCopied] = useState(false);
  const r = rarity(receipt.oddsBps);
  const settled = receipt.status !== "open" && receipt.claimed;
  const lockDate = new Date(receipt.lockedTs * 1000);

  async function share() {
    const url = receipt.positionPda
      ? `${location.origin}/r/${receipt.positionPda}`
      : location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "BigShout receipt", url });
        return;
      }
    } catch { /* fall through to clipboard */ }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`rarity-${r.tier}`}>
      <div className={`receipt-frame relative rounded-2xl p-6 ${r.tier === "legendary" || r.tier === "big" ? "shimmer" : ""}`}>
        <div className="flex items-baseline justify-between">
          <p className="display text-sm tracking-wider text-muted">
            BIG<span className="text-brand">SHOUT</span> RECEIPT
          </p>
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ color: "var(--rc)", borderColor: "var(--rc)" }}>
            {r.label}
          </span>
        </div>

        <p className="mt-4 text-lg font-bold leading-snug">{receipt.question}</p>
        {receipt.fixture && (
          <p className="mt-1 text-sm text-muted">
            {receipt.fixture.p1} vs {receipt.fixture.p2}
            {receipt.fixture.simulated ? " · simulated live" : ""}
          </p>
        )}

        <p className="mt-4 text-2xl font-black">
          @{receipt.username} called{" "}
          <span className={receipt.side ? "text-yes" : "text-no"}>
            {receipt.side ? "YES" : "NO"}
          </span>{" "}
          <span className="text-muted">@</span> {fmtOdds(receipt.oddsBps)}
        </p>
        <p className="mt-1 text-xs tabular-nums text-muted">
          Sealed {lockDate.toUTCString()} — before the outcome was known
        </p>

        <div className="mt-5 border-t border-line pt-4">
          {settled ? (
            receipt.won ? (
              <p className="text-xl font-black text-yes">
                PROVEN RIGHT ✓ <span className="text-sm font-semibold text-muted">paid {fmtOdds(receipt.oddsBps)} on {receipt.amount} pts</span>
              </p>
            ) : (
              <p className="text-xl font-black text-no">
                WRONG ✗ <span className="text-sm font-semibold text-muted">and it&apos;s on the record</span>
              </p>
            )
          ) : (
            <p className="text-xl font-black text-info">
              SEALED <span className="text-sm font-semibold text-muted">waiting on the pitch</span>
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold">
          <button
            onClick={share}
            className="rounded-full bg-brand px-3 py-1.5 font-bold text-black transition hover:brightness-110"
          >
            {copied ? "Link copied ✓" : "Share receipt"}
          </button>
          {receipt.links?.verify && (
            <a href={receipt.links.verify} className="text-info hover:underline">
              Verify on-chain →
            </a>
          )}
          {receipt.links?.lockTx && (
            <a href={receipt.links.lockTx} target="_blank" className="text-muted hover:text-ink">
              Lock tx ↗
            </a>
          )}
          {receipt.links?.settleTx && (
            <a href={receipt.links.settleTx} target="_blank" className="text-muted hover:text-ink">
              Settle tx ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
