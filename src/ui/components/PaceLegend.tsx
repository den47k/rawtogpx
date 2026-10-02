import { formatPace } from '../../core/format.ts';
import { divergingColor, type PaceScale } from '../lib/paceColor.ts';

const GRADIENT = `linear-gradient(to right, ${[-1, -0.5, 0, 0.5, 1].map(divergingColor).join(', ')})`;

function Marker({ fill, ring, label }: { fill: string; ring: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block size-3.5 rounded-full border-[3px] ring-1 ring-slate-400"
        style={{ background: fill, borderColor: ring }}
      />
      {label}
    </span>
  );
}

/** Explains the map: pace colours (relative to average) and start/finish markers. */
export function PaceLegend({ scale, hasRests }: { scale: PaceScale | null; hasRests: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
      {scale && (
        <div className="flex items-center gap-2">
          <span>Faster</span>
          <span aria-hidden className="h-2 w-28 rounded-full" style={{ background: GRADIENT }} />
          <span>Slower</span>
          <span className="text-slate-500 tabular-nums dark:text-slate-400">
            than average {formatPace(scale.averageSPerKm)}
          </span>
        </div>
      )}
      <Marker fill="#ffffff" ring="#111827" label="Start" />
      <Marker fill="#111827" ring="#ffffff" label="Finish" />
      {hasRests && (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-flex size-4 items-center justify-center rounded-full bg-gray-700 text-[9px] font-bold text-white ring-1 ring-slate-400"
          >
            ‖
          </span>
          Rest
        </span>
      )}
    </div>
  );
}
