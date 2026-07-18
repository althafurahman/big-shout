"use client";

/**
 * The "we're drowning here" validator: event-density per team over the last
 * five minutes, growing from the middle toward each side.
 */
export default function PressureMeter({
  p1,
  p2,
  name1,
  name2,
}: {
  p1: number;
  p2: number;
  name1: string;
  name2: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span>{name1}</span>
        <span>Pressure</span>
        <span>{name2}</span>
      </div>
      <div className="pressure-track mt-2 flex h-2 overflow-hidden rounded-full">
        <div className="flex flex-1 justify-end">
          <div
            className="h-full rounded-l-full bg-info transition-all duration-1000"
            style={{ width: `${Math.round(p1 * 100)}%` }}
          />
        </div>
        <div className="mx-px w-px bg-line" />
        <div className="flex flex-1">
          <div
            className="h-full rounded-r-full bg-no transition-all duration-1000"
            style={{ width: `${Math.round(p2 * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
