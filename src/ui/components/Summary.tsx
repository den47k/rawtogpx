import type { ReactNode } from 'react';
import { formatDistance, formatDuration, formatPace } from '../../core/format.ts';
import type { RunOutput } from '../../core/pipeline.ts';
import { restSeconds } from '../../core/segments.ts';
import { formatClock } from '../lib/datetime.ts';
import { Card } from './Card.tsx';

interface SummaryProps {
  output: RunOutput;
  hasRoute: boolean;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export function Summary({ output, hasRoute }: SummaryProps) {
  const { parsed, timing, result, error } = output;
  const stated = parsed.splits[parsed.splits.length - 1]?.distanceM;
  const rest = restSeconds(parsed.splits);
  // Only worth showing when the route differs by more than rounding (half a metre).
  const differs =
    result !== null && stated !== undefined && Math.abs(result.routeLengthM - stated) > 0.5;
  const missing = [
    !hasRoute && 'a route',
    stated === undefined && 'valid splits',
    !timing && stated !== undefined && 'a time',
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <Card title="Summary">
      {missing && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add {missing} to build the file.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm empty:hidden">
        {stated !== undefined && (
          <Stat label={differs ? 'Stated → route distance' : 'Distance'}>
            {formatDistance(stated, 3)}
            {result && differs && <> → {formatDistance(result.route.lengthM, 3)}</>}
          </Stat>
        )}
        {timing && (
          <Stat label={rest > 0 ? 'Total time (incl. rests)' : 'Total time'}>
            {formatDuration(timing.totalS, timing.totalS % 1 ? 1 : 0)}
            {rest > 0 && (
              <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                {formatDuration(rest)} rest
              </span>
            )}
          </Stat>
        )}
        {timing && (
          <Stat label={rest > 0 ? 'Moving pace' : 'Average pace'}>
            {formatPace((timing.totalS - rest) / (stated! / 1000))}
          </Stat>
        )}
        {timing && (
          <Stat label="Start → finish">
            {formatClock(timing.startMs)} → {formatClock(timing.endMs, timing.startMs)}
          </Stat>
        )}
      </dl>
      {result?.warnings.map((w) => (
        <p
          key={w}
          className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {w}
        </p>
      ))}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </Card>
  );
}
