import { formatDuration } from '../../core/format.ts';
import type { SplitMode } from '../../core/parseSplits.ts';
import type { Split } from '../../core/types.ts';
import { VERIFY_TOLERANCE_S, type Verification } from '../../core/verify.ts';

export type CheckRowType = 'Split' | 'Lap' | 'Rep' | 'Recovery' | 'Walk' | 'Rest';

export interface CheckRow {
  /** Running number for splits/laps, the rep number for reps, "–" otherwise. */
  n: string;
  type: CheckRowType;
  /** Index into the splits (for pace colour lookups). */
  index: number;
  dist: string;
  mine: string;
  file: string;
  /** File minus input, seconds; null when the file never reaches this point. */
  diffS: number | null;
  flagged: boolean;
}

/** `1.00 km` / `400 m`: fixed decimals so the column lines up. */
export function formatTableDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** `0.0 s`, `+0.2 s`, `−1.4 s`. */
export function formatDiff(s: number | null): string {
  if (s === null) return '—';
  const r = Math.round(s * 10) / 10;
  if (r === 0) return '0.0 s';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} s`;
}

/**
 * Rows for the split check. A cumulative split compares cumulative times (what the runner
 * typed); laps, reps, recoveries and rests compare their own durations, again matching what
 * was typed. File times come from the generated file read back.
 */
export function buildCheckRows(
  splits: Split[],
  verification: Verification,
  mode: SplitMode,
): CheckRow[] {
  const decimals = splits.some((s) => s.timeS % 1 !== 0) ? 1 : 0;
  let counter = 0;
  return splits.map((s, i) => {
    const prev = i > 0 ? splits[i - 1]! : { distanceM: 0, timeS: 0 };
    const fileS = verification.splits[i]?.fileS ?? null;
    const prevFileS = i > 0 ? (verification.splits[i - 1]?.fileS ?? null) : 0;

    let type: CheckRowType;
    let n = '–';
    if (s.rest) type = 'Rest';
    else if (s.label?.startsWith('Rep')) {
      type = 'Rep';
      n = /\d+/.exec(s.label)?.[0] ?? '–';
    } else if (s.recovery) type = s.label === 'Walk' ? 'Walk' : 'Recovery';
    else {
      type = mode === 'cumulative' ? 'Split' : 'Lap';
      n = String(++counter);
    }

    const cumulative = type === 'Split';
    const mineS = cumulative ? s.timeS : s.timeS - prev.timeS;
    const fileVal = cumulative
      ? fileS
      : fileS !== null && prevFileS !== null
        ? fileS - prevFileS
        : null;
    const diffS = fileVal === null ? null : fileVal - mineS;
    return {
      n,
      type,
      index: i,
      dist:
        type === 'Rest'
          ? '—'
          : formatTableDistance(cumulative ? s.distanceM : s.distanceM - prev.distanceM),
      mine: formatDuration(mineS, decimals),
      file: fileVal === null ? 'not reached' : formatDuration(fileVal, 1),
      diffS,
      flagged: diffS === null || Math.abs(Math.round(diffS * 10) / 10) > VERIFY_TOLERANCE_S,
    };
  });
}
