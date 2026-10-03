import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, prepareRoute } from '../../src/core/geo.ts';
import { ascentTo, probeRoute, snapToPolyline } from '../../src/core/probe.ts';

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

describe('snapToPolyline', () => {
  const xy = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  const cum = [0, 1000, 2000];

  it('projects onto the nearest segment and maps to route distance', () => {
    expect(snapToPolyline(xy, cum, { x: 25, y: 5 }, 10)).toBeCloseTo(250, 9);
    expect(snapToPolyline(xy, cum, { x: 104, y: 50 }, 10)).toBeCloseTo(1500, 9);
  });

  it('returns null beyond the tolerance', () => {
    expect(snapToPolyline(xy, cum, { x: 50, y: 30 }, 10)).toBeNull();
  });

  it('clamps to the ends', () => {
    expect(snapToPolyline(xy, cum, { x: -5, y: 0 }, 10)).toBe(0);
    expect(snapToPolyline(xy, cum, { x: 100, y: 108 }, 10)).toBe(2000);
  });

  it('handles a single-point route', () => {
    expect(snapToPolyline([{ x: 0, y: 0 }], [0], { x: 3, y: 4 }, 5)).toBe(0);
    expect(snapToPolyline([{ x: 0, y: 0 }], [0], { x: 3, y: 4 }, 4)).toBeNull();
  });

  it('on overlapping laps keeps to the pass nearest the previous distance', () => {
    // Out and back over the same line: x=40 is at 400 m and 1600 m.
    const lap = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    ];
    const lapCum = [0, 1000, 2000];
    expect(snapToPolyline(lap, lapCum, { x: 40, y: 1 }, 10)).toBeCloseTo(400, 9);
    expect(snapToPolyline(lap, lapCum, { x: 40, y: 1 }, 10, 1700)).toBeCloseTo(1600, 9);
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
    expect(probeRoute(route, 50, splits)).toMatchObject({ elapsedS: 15, splitIndex: 0 });
    // On the rest spot: belongs to the split that ends there, timed as the runner leaves.
    expect(probeRoute(route, 100, splits)).toMatchObject({ elapsedS: 90, splitIndex: 0 });
    expect(probeRoute(route, 250, splits)).toMatchObject({ elapsedS: 150, splitIndex: 2 });
    expect(probeRoute(route, 999, splits)).toMatchObject({
      distanceM: 400,
      elapsedS: 210,
      splitIndex: 2,
    });
  });
});
