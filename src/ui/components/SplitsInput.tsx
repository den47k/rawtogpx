import { useId, useState } from 'react';
import type { SplitError, SplitMode } from '../../core/parseSplits.ts';
import { Card } from './Card.tsx';
import { IntervalBuilder } from './IntervalBuilder.tsx';
import { SegmentedControl } from './SegmentedControl.tsx';

interface SplitsInputProps {
  text: string;
  onText: (text: string) => void;
  mode: SplitMode;
  /** True when the mode was picked by the user rather than auto-detected. */
  modeIsManual: boolean;
  onMode: (mode: SplitMode) => void;
  /** A different mode the input looks like, offered as a one-click switch. */
  suggestion: SplitMode | null;
  lapText: string;
  onLapText: (text: string) => void;
  lapError: string | null;
  errors: SplitError[];
}

const MODES = [
  { value: 'cumulative', label: 'Cumulative' },
  { value: 'laps', label: 'Laps' },
] as const;

const HINT: Record<SplitMode, string> = {
  cumulative: 'Distance and total elapsed time at each split',
  laps: 'Distance and time of each lap (only times if you set a lap distance above)',
};

const PLACEHOLDER: Record<SplitMode, string> = {
  cumulative: '1k 6:10\n2k 12:19\n3k 18:13\n4k 24:21\n5.37k 31:31',
  laps: '6:10 6:09 5:54 6:08\n1.37k 7:10',
};

export function SplitsInput(props: SplitsInputProps) {
  const { text, mode, errors, lapError } = props;
  const textId = useId();
  const hintId = useId();
  const errorsId = useId();
  const lapId = useId();
  const lapErrorId = useId();
  const [building, setBuilding] = useState(false);

  return (
    <Card
      title="2 · Splits"
      aside={
        <div className="flex items-center gap-2">
          {mode === 'laps' && (
            <>
              <label htmlFor={lapId} className="sr-only">
                Lap distance (optional)
              </label>
              <input
                id={lapId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="lap: 1k?"
                title="Optional lap distance: then each lap needs only a time"
                value={props.lapText}
                onChange={(e) => props.onLapText(e.target.value)}
                aria-invalid={lapError ? true : undefined}
                aria-describedby={lapError ? lapErrorId : undefined}
                className="min-h-11 w-24 rounded-lg border border-slate-300 bg-white px-2 font-mono text-sm aria-invalid:border-red-400 md:min-h-9 dark:border-slate-700 dark:bg-slate-950"
              />
            </>
          )}
          <SegmentedControl
            legend="Split mode"
            value={mode}
            options={MODES}
            onChange={props.onMode}
          />
        </div>
      }
    >
      <div className="space-y-2">
        {props.suggestion && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This looks like {props.suggestion}.{' '}
            <button
              type="button"
              className="font-medium text-orange-600 underline dark:text-orange-400"
              onClick={() => props.onMode(props.suggestion!)}
            >
              Switch to {props.suggestion === 'laps' ? 'Laps' : 'Cumulative'}
            </button>
          </p>
        )}

        {mode === 'laps' && lapError && (
          <p id={lapErrorId} className="text-sm text-red-600 dark:text-red-400">
            {lapError}
          </p>
        )}

        <div>
          <label htmlFor={textId} className="sr-only">
            Splits
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => props.onText(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={PLACEHOLDER[mode]}
            aria-invalid={errors.length > 0 ? true : undefined}
            aria-describedby={`${hintId} ${errorsId}`}
            className="block max-h-56 min-h-[5.25rem] w-full resize-y rounded-lg [field-sizing:content] border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-6 aria-invalid:border-red-400 dark:border-slate-700 dark:bg-slate-950"
          />
          <p id={hintId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {HINT[mode]}, one per line or comma-separated. Stops: “rest 1:30”.
            {!props.modeIsManual && text.trim() !== '' && ' Mode auto-detected.'}{' '}
            {!building && (
              <button
                type="button"
                onClick={() => setBuilding(true)}
                className="font-medium text-orange-600 underline dark:text-orange-400"
              >
                Add intervals…
              </button>
            )}
          </p>
        </div>

        {building && (
          <IntervalBuilder
            onClose={() => setBuilding(false)}
            onAdd={(line) => props.onText(text.trim() === '' ? line : `${text.trimEnd()}\n${line}`)}
          />
        )}

        <ul
          id={errorsId}
          aria-live="polite"
          className="space-y-1 text-sm text-red-600 empty:hidden dark:text-red-400"
        >
          {errors.map((e, i) => (
            <li key={i}>
              {e.line !== null && <span className="font-medium">Line {e.line}: </span>}
              {e.message}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
