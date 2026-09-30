import type { ReactNode } from 'react';
import { formatDistance, formatDuration, formatPace } from '../../core/format.ts';
import type { RunOutput } from '../../core/pipeline.ts';
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
          <Stat label={result ? 'Stated → route distance' : 'Stated distance'}>
            {formatDistance(stated, 3)}
            {result && result.routeLengthM !== stated && (
              <> → {formatDistance(result.route.lengthM, 3)}</>
            )}
          </Stat>
        )}
        {timing && (
          <Stat label="Total time">{formatDuration(timing.totalS, timing.totalS % 1 ? 1 : 0)}</Stat>
        )}
        {timing && <Stat label="Average pace">{formatPace(timing.totalS / (stated! / 1000))}</Stat>}
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
