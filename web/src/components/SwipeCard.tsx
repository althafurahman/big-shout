"use client";

import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { api, recordGuestCall, usePoll } from "@/lib/client";
import { fmtOdds, rarity } from "@/lib/meta";
import ConsensusBar from "./ConsensusBar";

export interface CardData {
  marketId?: number;
  question: string;
  triggerLabel?: string;
  yesOddsBps: number;
  noOddsBps: number;
  openingYesOddsBps?: number;
  timeLeft?: number;
  yesCount?: number;
  noCount?: number;
  /** practice cards know their outcome up front */
  practiceOutcome?: boolean;
  practiceReveal?: string;
}

export type SwipeMode = "live" | "guest" | "practice";

interface LockedState {
  side: boolean;
  oddsBps: number;
  positionPda?: string;
  consensus?: { yesPct: number; yesCount: number; noCount: number };
  practiceCorrect?: boolean;
  reveal?: string;
  error?: string;
}

const STAKES = [25, 50, 100, 250];

export default function SwipeCard({
  card,
  mode,
  maxStake,
  onDone,
  onSkip,
  windowSecs,
}: {
  card: CardData;
  mode: SwipeMode;
  maxStake?: number;
  onDone?: (locked: LockedState | null) => void;
  /** Lets a fan pass on a question without answering it. */
  onSkip?: () => void;
  /** Full prediction window, for the draining time bar. */
  windowSecs?: number;
}) {
  const [stake, setStake] = useState(50);
  const [locked, setLocked] = useState<LockedState | null>(null);
  const [pending, setPending] = useState<boolean | null>(null); // side while sealing
  const [timeLeft, setTimeLeft] = useState(card.timeLeft ?? 0);
  const x = useMotionValue(0);
  const controls = useAnimation();
  const rotate = useTransform(x, [-240, 240], [-10, 10]);
  const yesOpacity = useTransform(x, [40, 140], [0, 1]);
  const noOpacity = useTransform(x, [-140, -40], [1, 0]);

  // Live odds drift on open cards: poll and flash on change.
  const { data: liveOdds } = usePoll<any>(
    mode !== "practice" && card.marketId && !locked ? `/api/card/${card.marketId}` : null,
    3000
  );
  const yesBps = liveOdds?.yesOddsBps ?? card.yesOddsBps;
  const noBps = liveOdds?.noOddsBps ?? card.noOddsBps;
  const openingYes = liveOdds?.openingYesOddsBps ?? card.openingYesOddsBps;
  const prevYes = useRef(yesBps);
  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    if (prevYes.current !== yesBps) {
      prevYes.current = yesBps;
      setFlashKey((k) => k + 1);
    }
  }, [yesBps]);

  useEffect(() => {
    if (liveOdds?.timeLeft !== undefined) setTimeLeft(liveOdds.timeLeft);
  }, [liveOdds?.timeLeft]);
  useEffect(() => {
    if (locked || mode === "practice") return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [locked, mode]);

  const expired = mode !== "practice" && (timeLeft <= 0 || liveOdds?.status === "yes_won" || liveOdds?.status === "no_won");

  async function commit(side: boolean) {
    const oddsBps = side ? yesBps : noBps;
    if (mode === "practice") {
      const correct = side === card.practiceOutcome;
      const state: LockedState = {
        side,
        oddsBps,
        practiceCorrect: correct,
        reveal: card.practiceReveal,
      };
      setLocked(state);
      onDone?.(state);
      return;
    }
    if (mode === "guest") {
      recordGuestCall({ question: card.question, side, oddsBps, ts: Date.now() });
      const yes = (card.yesCount ?? 0) + (side ? 1 : 0);
      const total = (card.yesCount ?? 0) + (card.noCount ?? 0) + 1;
      const state: LockedState = {
        side,
        oddsBps,
        consensus: {
          yesPct: Math.round((yes / total) * 100),
          yesCount: yes,
          noCount: total - yes,
        },
      };
      setLocked(state);
      onDone?.(state);
      return;
    }
    setPending(side);
    try {
      const res = await api("/api/predict", {
        method: "POST",
        body: JSON.stringify({ marketId: card.marketId, side, stake }),
      });
      const state: LockedState = {
        side,
        oddsBps: res.oddsBps,
        positionPda: res.positionPda,
        consensus: res.consensus,
      };
      setLocked(state);
      onDone?.(state);
    } catch (e: any) {
      setLocked({ side, oddsBps, error: e.message });
    } finally {
      setPending(null);
    }
  }

  async function onDragEnd(_: unknown, info: { offset: { x: number } }) {
    if (expired || locked || pending !== null) return;
    if (info.offset.x > 120) {
      await controls.start({ x: 500, opacity: 0, transition: { duration: 0.25 } });
      commit(true);
    } else if (info.offset.x < -120) {
      await controls.start({ x: -500, opacity: 0, transition: { duration: 0.25 } });
      commit(false);
    } else {
      controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 28 } });
    }
  }

  if (locked) {
    if (locked.error) {
      return (
        <div className="card-enter rounded-2xl border border-no/40 bg-surface p-6 text-center">
          <p className="text-lg font-bold text-no">{locked.error}</p>
          <p className="mt-1 text-sm text-muted">{card.question}</p>
        </div>
      );
    }
    const r = rarity(locked.oddsBps);
    return (
      <div className={`card-enter rounded-2xl p-6 rarity-${r.tier} receipt-frame`}>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          {mode === "practice" ? "Practice call" : "Locked & sealed"}
        </p>
        <p className="mt-2 text-lg font-semibold">{card.question}</p>
        <p className="mt-3 text-2xl font-black">
          <span className={locked.side ? "text-yes" : "text-no"}>
            {locked.side ? "YES" : "NO"}
          </span>{" "}
          <span className="text-muted">@</span> {fmtOdds(locked.oddsBps)}
          <span className="ml-2 rounded-full border border-line px-2 py-0.5 align-middle text-xs font-bold" style={{ color: "var(--rc)" }}>
            {r.label}
          </span>
        </p>
        {mode === "practice" ? (
          <div className="mt-4">
            <p className={`text-xl font-black ${locked.practiceCorrect ? "text-yes" : "text-no"}`}>
              {locked.practiceCorrect ? "CALLED IT ✓" : "WRONG ✗"}
            </p>
            <p className="mt-1 text-sm text-muted">{locked.reveal}</p>
          </div>
        ) : locked.consensus ? (
          <div className="mt-5">
            <ConsensusBar
              yesPct={locked.consensus.yesPct}
              yourSide={locked.side}
              totalCalls={locked.consensus.yesCount + locked.consensus.noCount}
            />
          </div>
        ) : null}
        {mode === "guest" && (
          <p className="mt-4 rounded-lg border border-brand/40 bg-brand/10 p-3 text-sm">
            That one&apos;s off the record. <a href="/auth" className="font-bold text-brand underline">Sign up in 10 seconds</a>{" "}
            and your next call is sealed on-chain — provable forever.
          </p>
        )}
        {mode === "live" && locked.positionPda && (
          <a
            href={`/r/${locked.positionPda}`}
            className="mt-4 inline-block text-sm font-bold text-brand hover:underline"
          >
            View your receipt →
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <motion.div
        drag={expired ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.8}
        onDragEnd={onDragEnd}
        animate={controls}
        style={{ x, rotate }}
        className={`relative cursor-grab touch-pan-y select-none rounded-2xl border border-line bg-surface p-6 active:cursor-grabbing ${expired ? "opacity-60" : ""}`}
      >
        <motion.span
          style={{ opacity: yesOpacity }}
          className="display absolute right-4 top-4 rounded-lg border-2 border-yes px-2 py-0.5 text-xl text-yes"
        >
          YES
        </motion.span>
        <motion.span
          style={{ opacity: noOpacity }}
          className="display absolute left-4 top-4 rounded-lg border-2 border-no px-2 py-0.5 text-xl text-no"
        >
          NO
        </motion.span>

        {mode !== "practice" && windowSecs && !expired ? (
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-2xl bg-surface2">
            <div
              className="h-full transition-[width] duration-1000 ease-linear"
              style={{
                width: `${Math.max(0, Math.min(100, (timeLeft / windowSecs) * 100))}%`,
                background: timeLeft <= 20 ? "var(--no)" : "var(--brand)",
              }}
            />
          </div>
        ) : null}
        {card.triggerLabel && (
          <p className="text-xs font-bold uppercase tracking-widest text-info">
            ⚡ {card.triggerLabel}
          </p>
        )}
        <p className="mt-3 min-h-16 text-xl font-bold leading-snug">{card.question}</p>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">NO pays</p>
            <p className="text-lg font-black text-no">{fmtOdds(noBps)}</p>
          </div>
          {mode !== "practice" && (
            <div className="text-center">
              <p className="text-xs text-muted">window</p>
              <p
                className={`text-lg font-black tabular-nums ${timeLeft <= 20 ? "countdown-urgent" : ""}`}
              >
                {expired ? "CLOSED" : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`}
              </p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-muted">YES pays</p>
            <p key={flashKey} className="odds-flash text-lg font-black text-yes">
              {fmtOdds(yesBps)}
              {openingYes && Math.abs(openingYes - yesBps) / openingYes > 0.05 && (
                <span className="ml-1.5 text-xs font-medium text-muted line-through">
                  {fmtOdds(openingYes)}
                </span>
              )}
            </p>
          </div>
        </div>

        {pending !== null && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-bg/70">
            <p className="display animate-pulse text-2xl">Sealing your call…</p>
          </div>
        )}
      </motion.div>

      {mode === "live" && !expired && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="mr-1 text-xs text-muted">Stake</span>
          {STAKES.map((s) => (
            <button
              key={s}
              onClick={() => setStake(s)}
              disabled={maxStake !== undefined && s > maxStake}
              className={`rounded-full border px-3 py-1 text-sm font-bold tabular-nums transition disabled:opacity-30 ${
                stake === s
                  ? "border-brand bg-brand text-black"
                  : "border-line bg-surface hover:border-brand"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted">
        <span>
          {expired
            ? "This window has closed — the next moment is coming."
            : "Swipe right for YES · left for NO"}
        </span>
        {onSkip && !expired && pending === null && (
          <button
            onClick={onSkip}
            className="rounded-full border border-line px-2.5 py-0.5 font-semibold transition hover:border-brand hover:text-ink"
          >
            Skip →
          </button>
        )}
      </div>
    </div>
  );
}
