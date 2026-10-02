import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, prepareRoute } from '../../src/core/geo.ts';
import {
  guessSplitMode,
  parseSplits,
  type ParseSplitsOptions,
} from '../../src/core/parseSplits.ts';
import { rebuild } from '../../src/core/rebuild.ts';
import { serializeTcx } from '../../src/core/serializeTcx.ts';
import type { Split } from '../../src/core/types.ts';
import { verifyFile } from '../../src/core/verify.ts';

const laps: ParseSplitsOptions = { mode: 'laps' };
const cumulative: ParseSplitsOptions = { mode: 'cumulative' };

/** Compact view: [lap distance, lap time, label/rest]. */
function laps_(splits: Split[]): [number, number, string][] {
  return splits.map((s, i) => {
    const prev = i > 0 ? splits[i - 1]! : { distanceM: 0, timeS: 0 };
    return [
      +(s.distanceM - prev.distanceM).toFixed(3),
      +(s.timeS - prev.timeS).toFixed(3),
      s.rest ? 'rest' : (s.label ?? ''),
    ];
  });
}

describe('interval blocks', () => {
  it.each<[string, string, ParseSplitsOptions, [number, number, string][]]>([
    [
      'same time each rep, jog recovery',
      '3x400 @1:20 jog 200m 1:00',
      laps,
      [
        [400, 80, 'Rep 1/3'],
        [200, 60, 'Recovery'],
        [400, 80, 'Rep 2/3'],
        [200, 60, 'Recovery'],
        [400, 80, 'Rep 3/3'],
      ],
    ],
    [
      'spaced "6 x 400 m", per-rep times, recovery by pace',
      '3 x 400 m 1:21 1:20 1:18 jog 200 @6:00/km',
      laps,
      [
        [400, 81, 'Rep 1/3'],
        [200, 72, 'Recovery'],
        [400, 80, 'Rep 2/3'],
        [200, 72, 'Recovery'],
        [400, 78, 'Rep 3/3'],
      ],
    ],
    [
      'rep pace, standing rest',
      '2x1k @3:30/km rest 2:00',
      laps,
      [
        [1000, 210, 'Rep 1/2'],
        [0, 120, 'rest'],
        [1000, 210, 'Rep 2/2'],
      ],
    ],
    [
      'pace per mile, × sign, walk recovery with one time per recovery',
      '3×1mi @6:00/mi walk 100m 1:10 1:20',
      laps,
      [
        [1609.344, 360, 'Rep 1/3'],
        [100, 70, 'Walk'],
        [1609.344, 360, 'Rep 2/3'],
        [100, 80, 'Walk'],
        [1609.344, 360, 'Rep 3/3'],
      ],
    ],
    [
      'recovery after every rep when given one per rep',
      '2x400 @80 jog 200 60 65',
      laps,
      [
        [400, 80, 'Rep 1/2'],
        [200, 60, 'Recovery'],
        [400, 80, 'Rep 2/2'],
        [200, 65, 'Recovery'],
      ],
    ],
    [
      'no recovery',
      '2x200 @0:35',
      laps,
      [
        [200, 35, 'Rep 1/2'],
        [200, 35, 'Rep 2/2'],
      ],
    ],
    [
      'warm-up and cool-down around a block (laps mode)',
      '2k 10:30\n2x400 @1:20 jog 200m 1:00\n1k 5:30',
      laps,
      [
        [2000, 630, ''],
        [400, 80, 'Rep 1/2'],
        [200, 60, 'Recovery'],
        [400, 80, 'Rep 2/2'],
        [1000, 330, ''],
      ],
    ],
    [
      'in cumulative mode the block adds to the clock; later times include it',
      '2k 10:30\n2x400 @1:20 jog 200m 1:00\n4k 22:00',
      cumulative,
      [
        [2000, 630, ''],
        [400, 80, 'Rep 1/2'],
        [200, 60, 'Recovery'],
        [400, 80, 'Rep 2/2'],
        [1000, 470, ''],
      ],
    ],
  ])('%s', (_name, text, options, expected) => {
    const r = parseSplits(text, options);
    expect(r.errors).toEqual([]);
    expect(laps_(r.splits)).toEqual(expected);
  });

  it('marks moving recoveries', () => {
    const r = parseSplits('2x400 @80 jog 200 60', laps);
    expect(r.splits.map((s) => s.recovery === true)).toEqual([false, true, false]);
  });

  it.each([
    ['no rep time', '6x400', /needs a time per rep/],
    ['wrong number of rep times', '3x400 1:20 1:21', /3 reps but 2 rep times/],
    ['wrong number of recovery times', '4x400 @80 jog 200 60 61', /4 reps but 2 recovery times/],
    ['recovery without distance', '3x400 @80 jog 1:00', /needs a distance and time/],
    ['recovery without time', '3x400 @80 jog 200m', /needs a time/],
    ['rest without duration', '3x400 @80 rest', /needs a duration/],
    ['zero reps', '0x400 @80', /Repeat count/],
    ['too many reps', '101x400 @80', /Repeat count/],
    ['bad repeat distance', '6xfoo @80', /Can't read "6xfoo"/],
    ['pace outside a block', '1k 3:30/km', /only works in an interval block/],
    ['jog outside a block', 'jog 200m 1:00', /only works after reps/],
  ])('rejects %s', (_name, text, message) => {
    const r = parseSplits(text, laps);
    expect(r.splits).toEqual([]);
    expect(r.errors.some((e) => message.test(e.message))).toBe(true);
    expect(r.errors[0]!.line).toBe(1);
  });

  it('ignores blocks when guessing the mode', () => {
    expect(guessSplitMode('2k 10:30\n6x400 @1:20 jog 200m 1:00\n2k 11:00')).toBe('laps');
    expect(guessSplitMode('6x400 @1:20 jog 200m 1:00')).toBeNull();
  });
});

describe('a workout end to end', () => {
  const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;
  const route = prepareRoute(
    [0, 1000, 2000, 3000, 4000, 5000, 5200].map((d) => ({ lat: d / DEG_M, lon: 0 })),
  );
  const T0 = Date.parse('2026-10-01T06:00:00Z');

  it('writes a lap per rep and recovery, recoveries resting, and verifies', () => {
    const text = '2k 10:00\n3x400 @1:20 jog 200m 1:00\n1.6k 8:00';
    const { splits, errors } = parseSplits(text, laps);
    expect(errors).toEqual([]);
    const r = rebuild(route, splits, { kind: 'start', epochMs: T0 });
    if (!r.ok) throw new Error(r.error);
    const tcx = serializeTcx(r.value.points, r.value.splits, { startMs: T0, name: 'Intervals' });
    expect([...tcx.matchAll(/<Intensity>(\w+)<\/Intensity>/g)].map((m) => m[1])).toEqual([
      'Active',
      'Active',
      'Resting',
      'Active',
      'Resting',
      'Active',
      'Active',
    ]);
    const v = verifyFile(tcx, splits);
    if (!v.ok) throw new Error(v.error);
    expect(v.value.allOk).toBe(true);
    expect(v.value.totalDistanceM).toBeCloseTo(5200, 0);
  });
});
