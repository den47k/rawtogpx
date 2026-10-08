import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, prepareRoute } from '../../src/core/geo.ts';
import {
  createTimeModel,
  MIN_POINT_GAP_S,
  rebuild,
  type RebuildResult,
} from '../../src/core/rebuild.ts';
import type { Anchor, PreparedRoute, Split } from '../../src/core/types.ts';

const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;
const T0 = Date.parse('2026-09-30T15:00:00Z');

/** Straight north-bound route of `lengthM`, with a vertex every `stepM`. */
function straight(lengthM: number, stepM = 100, withEle = true): PreparedRoute {
  const pts = [];
  for (let d = 0; d <= lengthM + 1e-9; d += stepM) {
    pts.push(withEle ? { lat: d / DEG_M, lon: 0, ele: d / 100 } : { lat: d / DEG_M, lon: 0 });
  }
  return prepareRoute(pts);
}

function run(
  route: PreparedRoute,
  splits: Split[],
  anchor: Anchor = { kind: 'start', epochMs: T0 },
  opts = {},
): RebuildResult {
  const r = rebuild(route, splits, anchor, opts);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('createTimeModel', () => {
  const m = createTimeModel(
    [
      { distanceM: 1000, timeS: 300 },
      { distanceM: 2000, timeS: 900 },
    ],
    0,
  );

  it('without easing, is piecewise linear through (0, 0) and every split', () => {
    expect(m.totalS).toBe(900);
    expect(m.totalM).toBe(2000);
    expect(m.timeAt(0)).toBe(0);
    expect(m.timeAt(500)).toBe(150);
    expect(m.timeAt(1000)).toBe(300);
    expect(m.timeAt(1500)).toBe(600);
    expect(m.distanceAt(600)).toBe(1500);
    expect(m.distanceAt(900)).toBe(2000);
  });

  it('clamps outside the range', () => {
    expect(m.timeAt(-1)).toBe(0);
    expect(m.timeAt(5000)).toBe(900);
    expect(m.distanceAt(1e6)).toBe(2000);
  });

  it('round-trips', () => {
    for (const d of [0, 123, 999, 1000, 1777, 2000])
      expect(m.distanceAt(m.timeAt(d))).toBeCloseTo(d, 9);
  });

  describe('with easing', () => {
    const splits: Split[] = [
      { distanceM: 1000, timeS: 300 }, // 3.33 m/s
      { distanceM: 2000, timeS: 900 }, // 1.67 m/s
      { distanceM: 3000, timeS: 1200 },
    ];
    const e = createTimeModel(splits, 8);
    const speed = (t: number) => (e.distanceAt(t + 0.01) - e.distanceAt(t - 0.01)) / 0.02;

    it('still passes through every split exactly', () => {
      for (const s of splits) {
        expect(e.distanceAt(s.timeS)).toBeCloseTo(s.distanceM, 9);
        expect(e.timeAt(s.distanceM)).toBeCloseTo(s.timeS, 9);
      }
    });

    it('changes speed gradually across a boundary', () => {
      expect(speed(300)).toBeCloseTo(2.5, 3); // the mean of both splits
      expect(speed(296)).toBeGreaterThan(speed(300));
      expect(speed(304)).toBeLessThan(speed(300));
      // Steady in the middle, a touch faster than the average to make up for the ramp.
      expect(speed(150)).toBeCloseTo(speed(100), 9);
      expect(speed(150)).toBeGreaterThan(1000 / 300);
    });

    it('starts and finishes at the steady pace', () => {
      expect(speed(0.02)).toBeCloseTo(speed(100), 6);
      expect(speed(1199.98)).toBeCloseTo(speed(1100), 6);
    });

    it('is monotonic and round-trips', () => {
      let prev = -1;
      for (let t = 0; t <= 1200; t += 0.5) {
        const d = e.distanceAt(t);
        expect(d).toBeGreaterThanOrEqual(prev);
        expect(e.timeAt(d)).toBeCloseTo(t, 6);
        prev = d;
      }
    });

    it('does not ease when a neighbour is far faster', () => {
      const f = createTimeModel(
        [
          { distanceM: 2000, timeS: 200 },
          { distanceM: 2010, timeS: 210 },
        ],
        8,
      );
      expect(f.distanceAt(205)).toBeCloseTo(2005, 9);
    });
  });
});

describe('rebuild', () => {
  const route = straight(2000);
  const splits: Split[] = [
    { distanceM: 1000, timeS: 300 },
    { distanceM: 2000, timeS: 900 },
  ];

  it('anchors on start', () => {
    const r = run(route, splits, { kind: 'start', epochMs: T0 });
    expect(r.startMs).toBe(T0);
    expect(r.endMs).toBe(T0 + 900_000);
    expect(r.points[0]!.timeMs).toBe(T0);
    expect(r.points.at(-1)!.timeMs).toBe(T0 + 900_000);
  });

  it('anchors on finish', () => {
    const r = run(route, splits, { kind: 'finish', epochMs: T0 });
    expect(r.startMs).toBe(T0 - 900_000);
    expect(r.points.at(-1)!.timeMs).toBe(T0);
  });

  it('anchors on finish with fractional total time', () => {
    const r = run(route, [{ distanceM: 2000, timeS: 600.3 }], { kind: 'finish', epochMs: T0 });
    expect(r.endMs).toBe(T0);
    expect(r.startMs).toBe(T0 - 600_300);
    expect(r.points.at(-1)!.timeMs).toBe(T0);
  });

  it('emits strictly increasing times and every vertex', () => {
    const r = run(route, splits, undefined, { paceRampS: 0 });
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i]!.timeMs).toBeGreaterThan(r.points[i - 1]!.timeMs);
    }
    // 901 one-second samples + 21 vertices; vertices at 0, 1000, 2000 m collide with samples
    // at whole seconds, as do those every 100 m in the first split (30 s apart).
    const times = new Set(r.points.map((p) => p.timeMs));
    for (let d = 0; d <= 2000; d += 100) {
      const t = d <= 1000 ? d * 0.3 : 300 + (d - 1000) * 0.6;
      expect(times.has(T0 + Math.round(t * 1000))).toBe(true);
    }
    expect(r.points).toHaveLength(901);
  });

  it('places uniform samples by pace', () => {
    const r = run(route, splits, undefined, { includeVertices: false, paceRampS: 0 });
    // At 150 s the runner is halfway through the first split.
    const p = r.points.find((q) => q.timeMs === T0 + 150_000)!;
    expect(p.lat * DEG_M).toBeCloseTo(500, 6);
    // At 600 s, halfway through the second.
    const q = r.points.find((x) => x.timeMs === T0 + 600_000)!;
    expect(q.lat * DEG_M).toBeCloseTo(1500, 6);
    expect(q.ele).toBeCloseTo(15, 9);
  });

  it('honours the sample interval', () => {
    const r = run(route, splits, undefined, { sampleIntervalS: 5, includeVertices: false });
    expect(r.points).toHaveLength(181);
  });

  it('adds a final sample when the total is off-grid and vertices are off', () => {
    const r = run(route, [{ distanceM: 2000, timeS: 600.5 }], undefined, {
      includeVertices: false,
    });
    expect(r.points.at(-1)!.timeMs).toBe(T0 + 600_500);
  });

  it('keeps samples away from vertices, so no tiny gap turns into a pace spike', () => {
    const r = run(straight(1000, 7), [{ distanceM: 1000, timeS: 333 }]);
    const gaps = r.points.slice(1).map((p, i) => p.timeMs - r.points[i]!.timeMs);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_POINT_GAP_S * 1000);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1000);
    // Every vertex is still there.
    const lats = new Set(r.points.map((p) => Math.round(p.lat * DEG_M * 1000)));
    for (let d = 0; d <= 1000; d += 7) expect(lats.has(d * 1000)).toBe(true);
  });

  it('eases pace between splits instead of stepping', () => {
    const r = run(route, splits, undefined, { includeVertices: false });
    const paces = r.points.slice(1).map((p, i) => {
      const q = r.points[i]!;
      return (p.timeMs - q.timeMs) / (p.lat - q.lat) / DEG_M; // ms per metre
    });
    const jumps = paces.slice(1).map((p, i) => Math.abs(p - paces[i]!));
    // 0.3 -> 0.6 s/m over ~16 s: no single step anywhere near the whole change.
    expect(Math.max(...jumps)).toBeLessThan(40);
  });

  it('rejects negative easing', () => {
    expect(rebuild(route, splits, { kind: 'start', epochMs: T0 }, { paceRampS: -1 }).ok).toBe(
      false,
    );
  });

  it('keeps ms-precision vertex timestamps', () => {
    const r = run(straight(1000, 7), [{ distanceM: 1000, timeS: 333 }]);
    expect(r.points.some((p) => p.timeMs % 1000 !== 0)).toBe(true);
  });

  it('omits elevation when the route has none', () => {
    const r = run(straight(2000, 100, false), splits);
    expect(r.points.every((p) => p.ele === undefined)).toBe(true);
  });

  describe('distance mismatch', () => {
    const stated: Split[] = [
      { distanceM: 1000, timeS: 300 },
      { distanceM: 1900, timeS: 600 },
    ];

    it('scales split distances onto the route', () => {
      const r = run(route, stated);
      expect(r.scale).toBeCloseTo(2000 / 1900, 12);
      expect(r.splits[0]!.distanceM).toBeCloseTo(1000 * (2000 / 1900), 9);
      expect(r.splits[1]!.distanceM).toBe(route.lengthM);
      expect(r.points.at(-1)!.lat * DEG_M).toBeCloseTo(2000, 6);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toMatch(/5\.3% difference/);
    });

    it('trims the route at the stated distance', () => {
      const r = run(route, stated, undefined, { mismatch: 'trim' });
      expect(r.scale).toBe(1);
      expect(r.route.lengthM).toBe(1900);
      expect(r.points.at(-1)!.lat * DEG_M).toBeCloseTo(1900, 6);
      expect(r.points.at(-1)!.timeMs).toBe(T0 + 600_000);
    });

    it('refuses to trim beyond the route end', () => {
      const r = rebuild(
        route,
        [{ distanceM: 2500, timeS: 600 }],
        { kind: 'start', epochMs: T0 },
        {
          mismatch: 'trim',
        },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/scale/);
    });

    it('does not warn within 2%', () => {
      expect(run(route, [{ distanceM: 1970, timeS: 600 }]).warnings).toEqual([]);
      expect(run(route, [{ distanceM: 2030, timeS: 600 }]).warnings).toEqual([]);
    });
  });

  it.each<[string, PreparedRoute, Split[], object, RegExp]>([
    ['one-point route', prepareRoute([{ lat: 0, lon: 0 }]), splits, {}, /two distinct points/],
    ['no splits', route, [], {}, /at least one split/],
    [
      'non-increasing splits',
      route,
      [
        { distanceM: 1000, timeS: 300 },
        { distanceM: 900, timeS: 400 },
      ],
      {},
      /increase/,
    ],
    ['zero interval', route, splits, { sampleIntervalS: 0 }, /Sample interval/],
    ['huge output', route, splits, { sampleIntervalS: 0.001 }, /Too many/],
  ])('rejects %s', (_name, r, s, opts, message) => {
    const res = rebuild(r, s, { kind: 'start', epochMs: T0 }, opts);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(message);
  });
});
