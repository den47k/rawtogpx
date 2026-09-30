import { formatDistance, formatDuration, formatPace } from '../../core/format.ts';
import type { RunOutput } from '../../core/pipeline.ts';
import { VERIFY_TOLERANCE_S } from '../../core/verify.ts';
import { formatClock } from '../lib/datetime.ts';
import type { PaceScale } from '../lib/paceColor.ts';

interface VerificationTableProps {
  output: RunOutput;
  scale: PaceScale | null;
}

function formatDelta(s: number): string {
  const r = Math.round(s * 10) / 10;
  if (r === 0) return '0.0 s';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} s`;
}

/** Split | pace | your time | file time | delta, re-measured from the generated GPX. */
export function VerificationTable({ output, scale }: VerificationTableProps) {
  const { parsed, verification: v, result } = output;
  const splits = parsed.splits;
  if (splits.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Your splits appear here as you type them, checked against the generated file.
      </p>
    );
  }
  const decimals = splits.some((s) => s.timeS % 1 !== 0) ? 1 : 0;
  const failing = v?.splits.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="space-y-2">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-white dark:bg-slate-900">
          <tr className="text-left text-xs text-slate-500 uppercase dark:text-slate-400">
            <th scope="col" className="py-1 pr-3 font-medium">
              Split
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Pace
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Your time
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              File time
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Δ
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {splits.map((s, i) => {
            const prev = i > 0 ? splits[i - 1]! : { distanceM: 0, timeS: 0 };
            const pace = (s.timeS - prev.timeS) / ((s.distanceM - prev.distanceM) / 1000);
            const row = v?.splits[i];
            const bad = row !== undefined && !row.ok;
            return (
              <tr key={i}>
                <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                  <span className="inline-flex items-center gap-2">
                    {scale && (
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-4 rounded-full"
                        style={{ background: scale.color(pace) }}
                      />
                    )}
                    {formatDistance(s.distanceM)}
                  </span>
                </th>
                <td className="py-1.5 pr-3 text-right text-slate-500 dark:text-slate-400">
                  {formatPace(pace)}
                </td>
                <td className="py-1.5 pr-3 text-right">{formatDuration(s.timeS, decimals)}</td>
                <td className="py-1.5 pr-3 text-right">
                  {row?.fileS == null ? (
                    <span className="text-slate-400">{row ? 'not reached' : '—'}</span>
                  ) : (
                    formatDuration(row.fileS, 1)
                  )}
                </td>
                <td
                  className={`py-1.5 text-right ${bad ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {row?.deltaS == null ? '—' : formatDelta(row.deltaS)}
                  {bad && (
                    <span role="img" aria-label="more than 1 second off" className="ml-1">
                      ⚠
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {v && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Measured from the generated file: {formatDistance(v.totalDistanceM, 3)} ·{' '}
          {v.pointCount.toLocaleString()} points · {formatClock(v.startMs)} →{' '}
          {formatClock(v.endMs, v.startMs)}.{' '}
          {failing > 0 ? (
            <span className="font-medium text-red-600 dark:text-red-400">
              {failing} split{failing > 1 ? 's' : ''} off by more than {VERIFY_TOLERANCE_S} s.
            </span>
          ) : (
            <>All splits within ±{VERIFY_TOLERANCE_S} s.</>
          )}
          {result && result.scale !== 1 && (
            <>
              {' '}
              Split distances were stretched ×{result.scale.toFixed(4)} to fit the route; times are
              checked at your stated distances, as Strava will measure them.
            </>
          )}
        </p>
      )}
    </div>
  );
}
