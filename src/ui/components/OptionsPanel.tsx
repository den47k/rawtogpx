import { useId } from 'react';
import type { MismatchMode } from '../../core/types.ts';
import { SAMPLE_INTERVAL_MAX_S, SAMPLE_INTERVAL_MIN_S } from '../lib/settings.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

interface OptionsPanelProps {
  mismatch: MismatchMode;
  onMismatch: (m: MismatchMode) => void;
  sampleText: string;
  onSampleText: (s: string) => void;
  sampleError: string | null;
  name: string;
  onName: (s: string) => void;
  defaultName: string;
}

const MISMATCH = [
  { value: 'scale', label: 'Stretch splits' },
  { value: 'trim', label: 'Cut route' },
] as const;

const MISMATCH_HINT: Record<MismatchMode, string> = {
  scale: 'Split distances are stretched so the run covers the whole route.',
  trim: 'The route is cut where your last split ends (must not be longer than the route).',
};

const fieldClass =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm aria-invalid:border-red-400 md:min-h-9 dark:border-slate-700 dark:bg-slate-950';

export function OptionsPanel(props: OptionsPanelProps) {
  const nameId = useId();
  const sampleId = useId();
  const sampleHintId = useId();

  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-sm font-semibold tracking-wide text-slate-500 uppercase focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none md:min-h-10 lg:px-4 dark:text-slate-400 [&::-webkit-details-marker]:hidden">
        Options
        <span aria-hidden className="transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="space-y-3 px-3 pb-3 lg:px-4 lg:pb-4">
        <div>
          <p className="mb-1 text-sm font-medium">If route and splits differ in length</p>
          <SegmentedControl
            legend="If route and splits differ in length"
            value={props.mismatch}
            options={MISMATCH}
            onChange={props.onMismatch}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {MISMATCH_HINT[props.mismatch]}
          </p>
        </div>

        <div>
          <label htmlFor={sampleId} className="mb-1 block text-sm font-medium">
            Point every (seconds)
          </label>
          <input
            id={sampleId}
            type="number"
            inputMode="decimal"
            min={SAMPLE_INTERVAL_MIN_S}
            max={SAMPLE_INTERVAL_MAX_S}
            step={0.1}
            value={props.sampleText}
            onChange={(e) => props.onSampleText(e.target.value)}
            aria-invalid={props.sampleError ? true : undefined}
            aria-describedby={sampleHintId}
            className={`${fieldClass} max-w-32`}
          />
          <p
            id={sampleHintId}
            className={`mt-1 text-xs ${props.sampleError ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {props.sampleError ?? 'Plus every route vertex. 1 s keeps Strava from auto-pausing.'}
          </p>
        </div>

        <div>
          <label htmlFor={nameId} className="mb-1 block text-sm font-medium">
            Activity name
          </label>
          <input
            id={nameId}
            type="text"
            maxLength={100}
            autoComplete="off"
            placeholder={props.defaultName}
            value={props.name}
            onChange={(e) => props.onName(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>
    </details>
  );
}
