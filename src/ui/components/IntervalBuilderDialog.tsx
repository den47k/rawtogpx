import { useId, useState } from 'react';
import { parseSplits } from '../../core/parseSplits.ts';
import { Dialog } from './Dialog.tsx';
import { Field, Segmented } from './ui.tsx';
import { btnPrimary, btnSecondary, inputCls } from '../lib/styles.ts';

type RepKind = 'time' | 'pace';
type Recovery = 'jog' | 'walk' | 'stand' | 'none';

const MAX_INDIVIDUAL = 40;

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
  const [error, setError] = useState<string | null>(null);

  const n = Math.max(1, Math.min(MAX_INDIVIDUAL, Math.floor(Number(reps)) || 1));
  const unit = repKind === 'pace' ? '/km' : '';
  const withUnit = (v: string) => (v.trim() === '' ? '' : `${v.trim()}${unit}`);
  const repPart = repSame
    ? `@${withUnit(repVal)}`
    : Array.from({ length: n }, (_, i) => withUnit(repList[i] ?? '')).join(' ');
  const recDistText = /^\d+(\.\d+)?$/.test(recDist.trim()) ? `${recDist.trim()}m` : recDist.trim();
  // "Stand" is a standing rest; the parser calls it `rest`.
  const recPart =
    rec === 'none'
      ? ''
      : rec === 'stand'
        ? `rest ${recTime.trim()}`
        : `${rec} ${recDistText} ${recTime.trim()}`;
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
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
              {Array.from({ length: n }, (_, i) => (
                <input
                  key={i}
                  aria-label={`Rep ${i + 1} ${repKind}`}
                  inputMode="decimal"
                  value={repList[i] ?? ''}
                  placeholder={repKind === 'pace' ? '3:20' : '1:20'}
                  onChange={(e) => {
                    const next = [...repList];
                    next[i] = e.target.value;
                    setRepList(next);
                  }}
                  className={`${inputCls} px-1.5 text-center text-xs`}
                />
              ))}
            </div>
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
              <Field label={rec === 'stand' ? 'Time' : 'Time or pace'} htmlFor={ids.recTime}>
                <input
                  id={ids.recTime}
                  inputMode="decimal"
                  value={recTime}
                  onChange={(e) => setRecTime(e.target.value)}
                  placeholder={rec === 'stand' ? '1:30' : '1:00 or 6:00/km'}
                  className={inputCls}
                />
              </Field>
            </div>
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
