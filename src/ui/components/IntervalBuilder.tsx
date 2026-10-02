import { useId, useState } from 'react';
import { parseSplits } from '../../core/parseSplits.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

interface IntervalBuilderProps {
  /** Receives one interval-block line, e.g. `6x400m @1:20 jog 200m 1:00`. */
  onAdd: (line: string) => void;
  onClose: () => void;
}

type RecoveryKind = 'jog' | 'rest' | 'none';

const RECOVERY = [
  { value: 'jog', label: 'Jog' },
  { value: 'rest', label: 'Stand' },
  { value: 'none', label: 'None' },
] as const;

const fieldClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 font-mono text-sm md:min-h-9 dark:border-slate-700 dark:bg-slate-950';
const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

/** Small form for "N × distance @ time, recovery" that writes the compact text syntax. */
export function IntervalBuilder({ onAdd, onClose }: IntervalBuilderProps) {
  const ids = { reps: useId(), dist: useId(), time: useId(), recDist: useId(), recTime: useId() };
  const [reps, setReps] = useState('6');
  const [dist, setDist] = useState('400m');
  const [time, setTime] = useState('');
  const [recovery, setRecovery] = useState<RecoveryKind>('jog');
  const [recDist, setRecDist] = useState('200m');
  const [recTime, setRecTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const line = [
    `${reps.trim()}x${dist.trim().replace(/\s+/g, '')} @${time.trim()}`,
    recovery === 'jog' ? `jog ${recDist.trim()} ${recTime.trim()}` : '',
    recovery === 'rest' ? `rest ${recTime.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const add = () => {
    const { errors } = parseSplits(line, { mode: 'laps' });
    if (errors.length > 0) {
      setError(errors[0]!.message);
      return;
    }
    onAdd(line);
    onClose();
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50">
      <div className="grid grid-cols-[4rem_1fr_1.4fr] gap-2">
        <div>
          <label htmlFor={ids.reps} className={labelClass}>
            Reps
          </label>
          <input
            id={ids.reps}
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={ids.dist} className={labelClass}>
            Distance
          </label>
          <input
            id={ids.dist}
            value={dist}
            onChange={(e) => setDist(e.target.value)}
            placeholder="400m"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={ids.time} className={labelClass}>
            Rep time or pace
          </label>
          <input
            id={ids.time}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="1:20 or 3:20/km"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="shrink-0">
          <span className={labelClass}>Recovery</span>
          <SegmentedControl
            legend="Recovery between reps"
            value={recovery}
            options={RECOVERY}
            onChange={setRecovery}
          />
        </div>
        {recovery === 'jog' && (
          <div className="w-20">
            <label htmlFor={ids.recDist} className={labelClass}>
              Distance
            </label>
            <input
              id={ids.recDist}
              value={recDist}
              onChange={(e) => setRecDist(e.target.value)}
              className={fieldClass}
            />
          </div>
        )}
        {recovery !== 'none' && (
          <div className="min-w-24 flex-1">
            <label htmlFor={ids.recTime} className={labelClass}>
              {recovery === 'jog' ? 'Time or pace' : 'Time'}
            </label>
            <input
              id={ids.recTime}
              value={recTime}
              onChange={(e) => setRecTime(e.target.value)}
              placeholder={recovery === 'jog' ? '1:00 or 6:00/km' : '1:30'}
              className={fieldClass}
            />
          </div>
        )}
      </div>

      <p className="font-mono text-xs break-all text-slate-600 dark:text-slate-300">{line}</p>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Logged each rep? After adding, replace “@1:20” with every rep's time: 6x400m 1:21 1:20 1:19…
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={add}
          className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 md:min-h-9"
        >
          Add to splits
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-100 md:min-h-9 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
