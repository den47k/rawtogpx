import { useId } from 'react';
import type { AnchorKind } from '../../core/types.ts';
import { formatClock, localTimeZone } from '../lib/datetime.ts';
import { Card } from './Card.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';

interface TimeInputProps {
  kind: AnchorKind;
  onKind: (kind: AnchorKind) => void;
  value: string;
  onValue: (value: string) => void;
  onNow: () => void;
  invalid: boolean;
  /** Start and end of the run, once splits and time are valid. */
  timing: { startMs: number; endMs: number } | null;
}

const KINDS = [
  { value: 'start', label: 'Start time' },
  { value: 'finish', label: 'Finish time' },
] as const;

export function TimeInput({
  kind,
  onKind,
  value,
  onValue,
  onNow,
  invalid,
  timing,
}: TimeInputProps) {
  const inputId = useId();
  const tzId = useId();
  const other = kind === 'finish' ? 'Start' : 'Finish';

  return (
    <Card
      title="3 · Time"
      aside={
        <SegmentedControl
          legend="The time entered is the run's"
          value={kind}
          options={KINDS}
          onChange={onKind}
        />
      }
    >
      <div className="space-y-2">
        <div className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">
            {kind === 'finish' ? 'Finish time' : 'Start time'}
          </label>
          <input
            id={inputId}
            type="datetime-local"
            step={1}
            value={value}
            onChange={(e) => onValue(e.target.value)}
            aria-describedby={tzId}
            aria-invalid={invalid ? true : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm aria-invalid:border-red-400 md:min-h-9 dark:border-slate-700 dark:bg-slate-950 dark:[color-scheme:dark]"
          />
          <button
            type="button"
            onClick={onNow}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 md:min-h-9 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Now
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <p className="text-slate-600 tabular-nums dark:text-slate-300" aria-live="polite">
            {invalid ? (
              <span className="text-red-600 dark:text-red-400">Enter a valid date and time.</span>
            ) : timing ? (
              <>
                {other}:{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatClock(
                    kind === 'finish' ? timing.startMs : timing.endMs,
                    kind === 'finish' ? timing.endMs : timing.startMs,
                  )}
                </span>
              </>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {other} time appears once splits are valid.
              </span>
            )}
          </p>
          <span id={tzId} className="truncate text-xs text-slate-500 dark:text-slate-400">
            {localTimeZone()}
          </span>
        </div>
      </div>
    </Card>
  );
}
