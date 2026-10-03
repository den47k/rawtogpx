import { useId, useRef, useState } from 'react';
import { parseSplits } from '../../core/parseSplits.ts';
import { Dialog } from './Dialog.tsx';
import { Field, Segmented } from './ui.tsx';
import { btnPrimary, btnSecondary, inputCls } from '../lib/styles.ts';

type RepKind = 'time' | 'pace';
type Recovery = 'jog' | 'walk' | 'stand' | 'none';

const MAX_INDIVIDUAL = 40;

/**
 * One small input per rep or recovery. Plain ←/→ jump to the previous/next input and select
 * its text, so a run of times can be typed straight through.
 */
function EachInputs({
  count,
  values,
  onChange,
  label,
  plural,
  placeholder,
}: {
  count: number;
  values: string[];
  onChange: (values: string[]) => void;
  /** Singular noun for input labels ("Rep"), plural for the hint ("reps"). */
  label: string;
  plural: string;
  placeholder: string;
}) {
  const hintId = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => {
    const el = refs.current[i];
    if (!el) return;
    el.focus();
    el.select();
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={`${label} ${i + 1}`}
            aria-describedby={hintId}
            inputMode="decimal"
            value={values[i] ?? ''}
            placeholder={placeholder}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
              const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
              if (to < 0 || to >= count) return;
              e.preventDefault();
              focus(to);
            }}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={`${inputCls} px-1.5 text-center text-xs`}
          />
        ))}
      </div>
    </div>
  );
}

/** Non-empty values, space-separated. */
const joinTimes = (values: string[], count: number, fmt = (v: string) => v): string =>
  Array.from({ length: count }, (_, i) => (values[i] ?? '').trim())
    .filter((v) => v !== '')
    .map(fmt)
    .join(' ');

/** Form that writes one interval-block line, e.g. `6x400 @1:20 jog 200m 1:00`. */
export function IntervalBuilderDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (line: string) => void;
}) {
  const ids = { reps: useId(), dist: useId(), rep: useId(), recDist: useId(), recTime: useId() };
  const [reps, setReps] = useState('6');
  const [dist, setDist] = useState('400');
  const [repKind, setRepKind] = useState<RepKind>('time');
  const [repSame, setRepSame] = useState(true);
  const [repVal, setRepVal] = useState('1:20');
  const [repList, setRepList] = useState<string[]>([]);
  const [rec, setRec] = useState<Recovery>('jog');
  const [recDist, setRecDist] = useState('200');
  const [recTime, setRecTime] = useState('1:00');
  const [recSame, setRecSame] = useState(true);
  const [recList, setRecList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const n = Math.max(1, Math.min(MAX_INDIVIDUAL, Math.floor(Number(reps)) || 1));
  const unit = repKind === 'pace' ? '/km' : '';
  const withUnit = (v: string) => (v.trim() === '' ? '' : `${v.trim()}${unit}`);
  const repPart = repSame ? `@${withUnit(repVal)}` : joinTimes(repList, n, withUnit);
  // One recovery between each pair of reps.
  const recCount = n - 1;
  const recTimes = recSame ? recTime.trim() : joinTimes(recList, recCount);
  const recDistText = /^\d+(\.\d+)?$/.test(recDist.trim()) ? `${recDist.trim()}m` : recDist.trim();
  // "Stand" is a standing rest; the parser calls it `rest`.
  const recPart =
    rec === 'none' || (!recSame && recCount === 0)
      ? ''
      : rec === 'stand'
        ? `rest ${recTimes}`
        : `${rec} ${recDistText} ${recTimes}`;
  const line = [`${reps.trim()}x${dist.trim().replace(/\s+/g, '')}`, repPart, recPart]
    .filter((p) => p !== '')
    .join(' ');

  const insert = () => {
    const { errors } = parseSplits(line, { mode: 'laps' });
    if (errors.length > 0) {
      setError(errors[0]!.message);
      return;
    }
    setError(null);
    onInsert(line);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Interval builder"
      footer={
        <div className="flex justify-end gap-2 border-t border-line2 px-5 pt-3 pb-4">
          <button type="button" onClick={onClose} className={`${btnSecondary} text-[13px]`}>
            Cancel
          </button>
          <button type="button" onClick={insert} className={btnPrimary}>
            Insert line
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Reps" htmlFor={ids.reps}>
            <input
              id={ids.reps}
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Rep distance (m)" htmlFor={ids.dist}>
            <input
              id={ids.dist}
              inputMode="decimal"
              value={dist}
              onChange={(e) => setDist(e.target.value)}
              title="Metres, or with a unit: 1k, 1mi"
              className={inputCls}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold">Rep</div>
          <div className="grid grid-cols-2 gap-2.5">
            <Segmented
              legend="Rep given as"
              value={repKind}
              options={[
                { value: 'time', label: 'Time' },
                { value: 'pace', label: 'Pace' },
              ]}
              onChange={(v) => {
                setRepKind(v);
                setRepVal(v === 'pace' ? '3:20' : '1:20');
              }}
            />
            <Segmented
              legend="Rep times"
              value={repSame ? 'same' : 'each'}
              options={[
                { value: 'same', label: 'Same for all' },
                { value: 'each', label: 'Individual' },
              ]}
              onChange={(v) => setRepSame(v === 'same')}
            />
          </div>
          {repSame ? (
            <>
              <label htmlFor={ids.rep} className="sr-only">
                {repKind === 'pace' ? 'Rep pace per km' : 'Rep time'}
              </label>
              <input
                id={ids.rep}
                inputMode="decimal"
                value={repVal}
                onChange={(e) => setRepVal(e.target.value)}
                placeholder={repKind === 'pace' ? '3:20 /km' : '1:20'}
                className={inputCls}
              />
            </>
          ) : (
            <EachInputs
              count={n}
              values={repList}
              onChange={setRepList}
              label="Rep"
              plural="reps"
              placeholder={repKind === 'pace' ? '3:20' : '1:20'}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold">Recovery</div>
          <Segmented
            legend="Recovery between reps"
            value={rec}
            options={[
              { value: 'jog', label: 'Jog' },
              { value: 'walk', label: 'Walk' },
              { value: 'stand', label: 'Stand' },
              { value: 'none', label: 'None' },
            ]}
            onChange={setRec}
          />
          {rec !== 'none' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Distance (m)" htmlFor={ids.recDist}>
                  <input
                    id={ids.recDist}
                    inputMode="decimal"
                    value={rec === 'stand' ? '' : recDist}
                    onChange={(e) => setRecDist(e.target.value)}
                    disabled={rec === 'stand'}
                    placeholder="—"
                    className={inputCls}
                  />
                </Field>
                <div className="flex min-w-0 flex-col gap-[5px]">
                  <span aria-hidden className="text-xs text-muted">
                    {rec === 'stand' ? 'Times' : 'Times or paces'}
                  </span>
                  <Segmented
                    legend="Recovery times"
                    value={recSame ? 'same' : 'each'}
                    options={[
                      { value: 'same', label: 'Same for all' },
                      { value: 'each', label: 'Individual' },
                    ]}
                    onChange={(v) => setRecSame(v === 'same')}
                  />
                </div>
              </div>
              {recSame ? (
                <>
                  <label htmlFor={ids.recTime} className="sr-only">
                    {rec === 'stand' ? 'Recovery time' : 'Recovery time or pace'}
                  </label>
                  <input
                    id={ids.recTime}
                    inputMode="decimal"
                    value={recTime}
                    onChange={(e) => setRecTime(e.target.value)}
                    placeholder={rec === 'stand' ? '1:30' : '1:00 or 6:00/km'}
                    className={inputCls}
                  />
                </>
              ) : recCount === 0 ? (
                <p className="m-0 text-xs text-muted">A single rep has no recovery.</p>
              ) : (
                <EachInputs
                  count={recCount}
                  values={recList}
                  onChange={setRecList}
                  label="Recovery"
                  plural="recoveries"
                  placeholder={rec === 'stand' ? '1:30' : '1:00'}
                />
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-[5px]">
          <span className="text-xs text-muted">Writes</span>
          <div className="rounded-md bg-ink-bg px-3 py-2.5 font-mono text-[13px] font-medium break-all text-on-ink">
            {line}
          </div>
          {error && (
            <p role="alert" className="m-0 text-xs text-bad">
              {error}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
