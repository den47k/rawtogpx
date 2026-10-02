import { describe, expect, it } from 'vitest';
import type { Split } from '../../src/core/types.ts';
import type { Verification } from '../../src/core/verify.ts';
import { buildCheckRows, formatDiff, formatTableDistance } from '../../src/ui/lib/checkRows.ts';

function verification(fileTimes: (number | null)[], splits: Split[]): Verification {
  return {
    splits: splits.map((s, i) => ({
      distanceM: s.distanceM,
      expectedS: s.timeS,
      fileS: fileTimes[i] ?? null,
      deltaS: fileTimes[i] == null ? null : fileTimes[i]! - s.timeS,
      ok: true,
    })),
    totalDistanceM: 0,
    startMs: 0,
    endMs: 0,
    pointCount: 0,
    allOk: true,
  };
}

describe('split check rows', () => {
  it('compares cumulative times for cumulative splits, durations for rests', () => {
    const splits: Split[] = [
      { distanceM: 1000, timeS: 292 },
      { distanceM: 1000, timeS: 352, rest: true },
      { distanceM: 2000, timeS: 650 },
    ];
    const rows = buildCheckRows(splits, verification([292.2, 352, 650], splits), 'cumulative');
    expect(rows.map((r) => [r.n, r.type, r.dist, r.mine, r.file, formatDiff(r.diffS)])).toEqual([
      ['1', 'Split', '1.00 km', '4:52', '4:52.2', '+0.2 s'],
      ['–', 'Rest', '—', '1:00', '0:59.8', '−0.2 s'],
      ['2', 'Split', '2.00 km', '10:50', '10:50.0', '0.0 s'],
    ]);
    expect(rows.every((r) => !r.flagged)).toBe(true);
  });

  it('compares per-part durations for laps, reps and recoveries, numbering reps', () => {
    const splits: Split[] = [
      { distanceM: 2000, timeS: 630 },
      { distanceM: 2400, timeS: 710, label: 'Rep 1/2' },
      { distanceM: 2600, timeS: 770, label: 'Recovery', recovery: true },
      { distanceM: 3000, timeS: 850, label: 'Rep 2/2' },
      { distanceM: 3100, timeS: 920, label: 'Walk', recovery: true },
    ];
    const rows = buildCheckRows(splits, verification([630, 711.4, 770, 850, 920], splits), 'laps');
    expect(
      rows.map((r) => [r.n, r.type, r.dist, r.mine, r.file, formatDiff(r.diffS), r.flagged]),
    ).toEqual([
      ['1', 'Lap', '2.00 km', '10:30', '10:30.0', '0.0 s', false],
      ['1', 'Rep', '400 m', '1:20', '1:21.4', '+1.4 s', true],
      ['–', 'Recovery', '200 m', '1:00', '0:58.6', '−1.4 s', true],
      ['2', 'Rep', '400 m', '1:20', '1:20.0', '0.0 s', false],
      ['–', 'Walk', '100 m', '1:10', '1:10.0', '0.0 s', false],
    ]);
  });

  it('flags splits the file never reaches', () => {
    const splits: Split[] = [{ distanceM: 1000, timeS: 300 }];
    const [row] = buildCheckRows(splits, verification([null], splits), 'cumulative');
    expect(row).toMatchObject({ file: 'not reached', diffS: null, flagged: true });
  });

  it('formats distances and diffs for the table', () => {
    expect(formatTableDistance(5021.7)).toBe('5.02 km');
    expect(formatTableDistance(400.2)).toBe('400 m');
    expect(formatDiff(0.04)).toBe('0.0 s');
    expect(formatDiff(-0.96)).toBe('−1.0 s');
    expect(formatDiff(null)).toBe('—');
  });
});
