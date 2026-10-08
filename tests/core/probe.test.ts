import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, prepareRoute } from '../../src/core/geo.ts';
import { ascentTo, pickPass, polylinePasses, probeRoute } from '../../src/core/probe.ts';
import { createTimeModel } from '../../src/core/rebuild.ts';

const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;
// 400 m due north: up 10 m, down 4 m, flat.
const route = prepareRoute(
  [
    [0, 100],
    [100, 110],
    [200, 106],
    [400, 106],
  ].map(([d, ele]) => ({ lat: d! / DEG_M, lon: 0, ele: ele! })),
);
const flat = prepareRoute([0, 100, 200].map((d) => ({ lat: d / DEG_M, lon: 0 })));

describe('polylinePasses', () => {
  const xy = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  const cum = [0, 1000, 2000];
  const at = (p: { x: number; y: number }, max = 10) =>
    polylinePasses(xy, cum, p, max).map((h) => h.distanceM);

  it('projects onto the nearest segment and maps to route distance', () => {
    expect(at({ x: 25, y: 5 })[0]).toBeCloseTo(250, 9);
    expect(at({ x: 104, y: 50 })[0]).toBeCloseTo(1500, 9);
  });

  it('finds nothing beyond the tolerance', () => {
    expect(at({ x: 50, y: 30 })).toEqual([]);
  });

  it('clamps to the ends', () => {
    expect(at({ x: -5, y: 0 })).toEqual([0]);
    expect(at({ x: 100, y: 108 })).toEqual([2000]);
  });

  it('treats a corner as one pass', () => {
    const hits = at({ x: 97, y: 3 });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeCloseTo(970, 9);
  });

  it('handles a single-point route', () => {
    expect(polylinePasses([{ x: 0, y: 0 }], [0], { x: 3, y: 4 }, 5)).toEqual([
      { distanceM: 0, dist: 5 },
    ]);
    expect(polylinePasses([{ x: 0, y: 0 }], [0], { x: 3, y: 4 }, 4)).toEqual([]);
  });

  // Out and back over the same line: x=40 is at 400 m and 1600 m.
  const lap = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 0 },
  ];
  const lapCum = [0, 1000, 2000];

  it('reports every pass over the same spot, in route order', () => {
    const hits = polylinePasses(lap, lapCum, { x: 40, y: 1 }, 10).map((h) => h.distanceM);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBeCloseTo(400, 9);
    expect(hits[1]).toBeCloseTo(1600, 9);
  });

  it('separates passes even when the line never leaves reach in between', () => {
    // Out along y=0 to x=30, tight turn, back along y=2: all within 25 px of (10, 1).
    const hairpin = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 2 },
      { x: 0, y: 2 },
    ];
    const hits = polylinePasses(hairpin, [0, 300, 320, 620], { x: 10, y: 1 }, 25);
    expect(hits.map((h) => Math.round(h.distanceM))).toEqual([100, 520]);
  });

  it('leaves out a neighbouring line clearly farther than the nearest', () => {
    // Two parallel lines 9 px apart, joined far away.
    const u = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 9 },
      { x: 0, y: 9 },
    ];
    const hits = polylinePasses(u, [0, 1000, 1090, 2090], { x: 50, y: 0 }, 10, 6);
    expect(hits.map((h) => h.distanceM)).toEqual([500]);
    expect(polylinePasses(u, [0, 1000, 1090, 2090], { x: 50, y: 0 }, 10, 10)).toHaveLength(2);
  });

  it('picks the pass nearest the previous distance, else nearest the pointer', () => {
    const passes = [
      { distanceM: 400, dist: 3 },
      { distanceM: 1600, dist: 1 },
    ];
    expect(pickPass(passes)).toBe(1);
    expect(pickPass(passes, 380)).toBe(0);
    expect(pickPass(passes, 1500)).toBe(1);
  });
});

describe('probeRoute', () => {
  it('reads elevation, grade and ascent at a distance', () => {
    const p = probeRoute(route, 50);
    expect(p.distanceM).toBe(50);
    expect(p.ele).toBeCloseTo(105, 6);
    expect(p.gradePct).toBeCloseTo(10, 6);
    expect(p.ascentM).toBeCloseTo(5, 6);
    expect(p.elapsedS).toBeUndefined();
  });

  it('measures grade over the window, clamped at the ends', () => {
    expect(probeRoute(route, 150).gradePct).toBeCloseTo(-4, 6);
    expect(probeRoute(route, 0).gradePct).toBeCloseTo(10, 6);
    expect(probeRoute(route, 400).gradePct).toBeCloseTo(0, 6);
  });

  it('counts only rises in the ascent', () => {
    expect(ascentTo(route, 0)).toBe(0);
    expect(ascentTo(route, 100)).toBeCloseTo(10, 6);
    expect(ascentTo(route, 400)).toBeCloseTo(10, 6);
  });

  it('omits elevation stats when the route has none', () => {
    const p = probeRoute(flat, 120);
    expect(p).toEqual({ distanceM: 120 });
  });

  it('times the point and finds its split', () => {
    const splits = [
      { distanceM: 100, timeS: 30 },
      { distanceM: 100, timeS: 90, rest: true },
      { distanceM: 400, timeS: 210 },
    ];
    // Timed by the same (eased) model as the rebuilt file.
    const model = createTimeModel(splits);
    expect(probeRoute(route, 50, splits)).toMatchObject({
      elapsedS: model.timeAt(50),
      splitIndex: 0,
    });
    // On the rest spot: belongs to the split that ends there, timed as the runner leaves.
    expect(probeRoute(route, 100, splits)).toMatchObject({ elapsedS: 90, splitIndex: 0 });
    expect(probeRoute(route, 250, splits)).toMatchObject({
      elapsedS: model.timeAt(250),
      splitIndex: 2,
    });
    expect(probeRoute(route, 999, splits)).toMatchObject({
      distanceM: 400,
      elapsedS: 210,
      splitIndex: 2,
    });
  });
});
