"use client";

const ICONS: [RegExp, string][] = [
  [/^goal/, "⚽"],
  [/^corner/, "🚩"],
  [/^yellow/, "🟨"],
  [/^red/, "🟥"],
  [/^var/, "📺"],
  [/^shot/, "🎯"],
  [/^freekick/, "🎯"],
  [/^penalty/, "⚡"],
  [/^sub/, "🔁"],
  [/^offside/, "🚫"],
];

function icon(kind: string): string {
  return ICONS.find(([re]) => re.test(kind))?.[1] ?? "•";
}

export default function Ticker({
  events,
}: {
  events: { id: number; kind: string; label: string; ts: number }[];
}) {
  if (!events.length) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
        Waiting for something to happen on the pitch…
      </p>
    );
  }
  return (
    <ul className="ticker-scroll max-h-72 space-y-1 overflow-y-auto pr-1">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-3 rounded-lg border border-line/60 bg-surface px-3 py-2 text-sm"
        >
          <span className="text-base">{icon(e.kind)}</span>
          <span className="flex-1">{e.label}</span>
          <span className="text-xs tabular-nums text-muted">
            {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </li>
      ))}
    </ul>
  );
}
