import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, haversine, prepareRoute } from '../../src/core/geo.ts';
import { parseSplits } from '../../src/core/parseSplits.ts';
import { createTimeModel, rebuild } from '../../src/core/rebuild.ts';
import { serializeGpx } from '../../src/core/serializeGpx.ts';
import { serializeTcx } from '../../src/core/serializeTcx.ts';
import type { Split } from '../../src/core/types.ts';
import { verifyFile } from '../../src/core/verify.ts';

const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;
const T0 = Date.parse('2026-09-30T15:00:00Z');
const route = prepareRoute(
  [0, 250, 500, 750, 1000, 1500, 2000].map((d) => ({ lat: d / DEG_M, lon: 0 })),
);

describe('rest entries in the splits parser', () => {
  it.each<[string, string, Parameters<typeof parseSplits>[1], Split[]]>([
    [
      'cumulative: later times include the rest',
      '1k 5:00, rest 1:30, 2k 11:30',
      { mode: 'cumulative' },
      [
        { distanceM: 1000, timeS: 300 },
        { distanceM: 1000, timeS: 390, rest: true },
        { distanceM: 2000, timeS: 690 },
      ],
    ],
    [
      'laps with a lap distance',
      '5:00 rest 1:30 5:00',
      { mode: 'laps', lapDistanceM: 1000 },
      [
        { distanceM: 1000, timeS: 300 },
        { distanceM: 1000, timeS: 390, rest: true },
        { distanceM: 2000, timeS: 690 },
      ],
    ],
    [
      'synonyms, bare seconds, upper case, colon',
      '400m 75\nPAUSE: 90\n400m 76\nbreak 45',
      { mode: 'laps' },
      [
        { distanceM: 400, timeS: 75 },
        { distanceM: 400, timeS: 165, rest: true },
        { distanceM: 800, timeS: 241 },
        { distanceM: 800, timeS: 286, rest: true },
      ],
    ],
    [
      'a leading rest',
      'rest 0:30, 1k 5:30',
      { mode: 'cumulative' },
      [
        { distanceM: 0, timeS: 30, rest: true },
        { distanceM: 1000, timeS: 330 },
      ],
    ],
  ])('%s', (_name, text, options, expected) => {
    const r = parseSplits(text, options);
    expect(r.errors).toEqual([]);
    expect(r.splits).toEqual(expected);
  });

  it.each([
    ['rest without a duration', '1k 5:00, rest', /needs a duration/],
    ['zero rest', '1k 5:00, rest 0', /Rest time can't be zero/],
    ['rests only', 'rest 1:00', /at least one split with a distance/],
    ['time not past the rest (cumulative)', '1k 5:00, rest 1:30, 2k 6:00', /Time must increase/],
  ])('rejects %s', (_name, text, message) => {
    const r = parseSplits(text, { mode: 'cumulative' });
    expect(r.splits).toEqual([]);
    expect(r.errors.some((e) => message.test(e.message))).toBe(true);
  });
});

describe('rests in the time model and rebuild', () => {
  const splits: Split[] = [
    { distanceM: 1000, timeS: 300 },
    { distanceM: 1000, timeS: 390, rest: true },
    { distanceM: 2000, timeS: 690 },
  ];

  it('holds distance while time advances', () => {
    const m = createTimeModel(splits, 0);
    expect(m.distanceAt(300)).toBe(1000);
    expect(m.distanceAt(350)).toBe(1000);
    expect(m.distanceAt(390)).toBe(1000);
    expect(m.distanceAt(540)).toBe(1500);
    expect(m.timeAt(1000)).toBe(390); // leaves the rest spot
    expect(m.timeAt(500)).toBe(150);
  });

  it('with easing, stops abruptly and pulls away gradually', () => {
    const m = createTimeModel(splits);
    expect(m.distanceAt(300)).toBeCloseTo(1000, 9);
    expect(m.distanceAt(350)).toBe(1000);
    expect(m.timeAt(1000)).toBe(390);
    // Arriving: full speed up to the stop.
    expect(1000 - m.distanceAt(299)).toBeCloseTo(1000 / 300, 6);
    // Leaving: slower than the steady pace for the first seconds.
    expect(m.distanceAt(391) - 1000).toBeLessThan(m.distanceAt(500) - m.distanceAt(499));
    expect(m.distanceAt(690)).toBeCloseTo(2000, 9);
  });

  it('handles a trailing rest', () => {
    const m = createTimeModel([...splits, { distanceM: 2000, timeS: 750, rest: true }]);
    expect(m.timeAt(2000)).toBe(750);
    expect(m.distanceAt(720)).toBe(2000);
  });

  it('writes stationary points for the rest, with exact arrival and departure', () => {
    const r = rebuild(route, splits, { kind: 'start', epochMs: T0 }, { sampleIntervalS: 7 });
    if (!r.ok) throw new Error(r.error);
    const still = r.value.points.filter((p) => Math.abs(p.lat * DEG_M - 1000) < 1e-6);
    const times = still.map((p) => (p.timeMs - T0) / 1000);
    expect(times[0]).toBe(300);
    expect(times[times.length - 1]).toBe(390);
    expect(times.length).toBeGreaterThan(10);
    expect(r.value.points.at(-1)!.timeMs).toBe(T0 + 690_000);
  });

  it('rejects a rest that moves', () => {
    const r = rebuild(
      route,
      [
        { distanceM: 1000, timeS: 300 },
        { distanceM: 1100, timeS: 390, rest: true },
      ],
      { kind: 'start', epochMs: T0 },
    );
    expect(r.ok).toBe(false);
  });

  it.each(['gpx', 'tcx'] as const)('verifies rests from the %s file', (format) => {
    const all: Split[] = [
      { distanceM: 0, timeS: 20, rest: true },
      { distanceM: 1000, timeS: 320 },
      { distanceM: 1000, timeS: 410, rest: true },
      { distanceM: 2000, timeS: 710 },
      { distanceM: 2000, timeS: 740, rest: true },
    ];
    const r = rebuild(route, all, { kind: 'start', epochMs: T0 });
    if (!r.ok) throw new Error(r.error);
    const { points, splits: placed, startMs } = r.value;
    const text =
      format === 'gpx'
        ? serializeGpx(points, { name: 'x' })
        : serializeTcx(points, placed, { startMs, name: 'x' });
    const v = verifyFile(text, all);
    if (!v.ok) throw new Error(v.error);
    expect(v.value.splits.map((s) => s.fileS)).toEqual([20, 320, 410, 710, 740]);
    expect(v.value.allOk).toBe(true);
    // The rest adds time but no distance.
    expect(v.value.totalDistanceM).toBeCloseTo(2000, 1);
    expect(v.value.endMs - v.value.startMs).toBe(740_000);
  });

  it('does not count rest points towards distance', () => {
    const r = rebuild(route, splits, { kind: 'start', epochMs: T0 });
    if (!r.ok) throw new Error(r.error);
    const pts = r.value.points;
    const d = pts.slice(1).reduce((sum, p, i) => sum + haversine(pts[i]!, p), 0);
    expect(d).toBeCloseTo(2000, 3);
  });
});
