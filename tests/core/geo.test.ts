import { describe, expect, it } from 'vitest';
import {
  cumulativeDistances,
  dedupe,
  EARTH_RADIUS_M,
  haversine,
  lowerBound,
  pointAtDistance,
  prepareRoute,
  segmentIndex,
  trimRoute,
} from '../../src/core/geo.ts';

// One degree of latitude along a meridian.
const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine({ lat: 50, lon: 30 }, { lat: 50, lon: 30 })).toBe(0);
  });

  it('matches arc length along a meridian', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(DEG_M, 6);
  });

  it('scales longitude by cos(latitude)', () => {
    const d = haversine({ lat: 60, lon: 0 }, { lat: 60, lon: 0.001 });
    expect(d).toBeCloseTo(0.001 * DEG_M * 0.5, 2);
  });

  it('is symmetric', () => {
    const a = { lat: 50.43509, lon: 30.60916 };
    const b = { lat: 50.43179, lon: 30.61039 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 9);
  });
});

describe('dedupe', () => {
  it('drops consecutive points closer than 5 cm', () => {
    const cm = 0.01 / DEG_M; // 1 cm in degrees of latitude
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 3 * cm, lon: 0 }, // 3 cm: dropped
      { lat: 6 * cm, lon: 0 }, // 6 cm from the kept point: kept
      { lat: 6 * cm, lon: 0 }, // identical: dropped
      { lat: 1, lon: 0 },
    ];
    expect(dedupe(pts)).toEqual([pts[0], pts[2], pts[4]]);
  });
});

describe('cumulative distance and interpolation', () => {
  const route = prepareRoute([
    { lat: 0, lon: 0, ele: 100 },
    { lat: 0.001, lon: 0, ele: 110 },
    { lat: 0.001, lon: 0.001, ele: 100 },
  ]);
  const leg = 0.001 * DEG_M;

  it('accumulates segment lengths', () => {
    expect(route.cum[0]).toBe(0);
    expect(route.cum[1]).toBeCloseTo(leg, 6);
    expect(route.lengthM).toBeCloseTo(2 * leg, 3);
    expect(route.hasElevation).toBe(true);
    expect(cumulativeDistances([])).toEqual([]);
  });

  it('finds the point at a distance, with elevation', () => {
    const p = pointAtDistance(route, leg / 2);
    expect(p.lat).toBeCloseTo(0.0005, 9);
    expect(p.lon).toBe(0);
    expect(p.ele).toBeCloseTo(105, 6);
  });

  it('clamps to the route ends', () => {
    expect(pointAtDistance(route, -5)).toEqual({ lat: 0, lon: 0, ele: 100 });
    expect(pointAtDistance(route, 1e9)).toEqual({ lat: 0.001, lon: 0.001, ele: 100 });
  });

  it('marks routes with any missing elevation as having none', () => {
    const r = prepareRoute([
      { lat: 0, lon: 0, ele: 1 },
      { lat: 0.001, lon: 0 },
    ]);
    expect(r.hasElevation).toBe(false);
  });

  it('trims the route, interpolating the final point', () => {
    const t = trimRoute(route, leg * 1.5);
    expect(t.points).toHaveLength(3);
    expect(t.lengthM).toBeCloseTo(leg * 1.5, 9);
    expect(t.points[2]!.lon).toBeCloseTo(0.0005, 6);
    expect(t.points[2]!.ele).toBeCloseTo(105, 3);
    expect(trimRoute(route, route.lengthM)).toBe(route);
  });

  it('trims exactly on a vertex without adding a point', () => {
    const t = trimRoute(route, route.cum[1]!);
    expect(t.points).toHaveLength(2);
  });
});

describe('search helpers', () => {
  const xs = [0, 10, 10, 20, 30];

  it.each([
    [-1, 0],
    [0, 0],
    [5, 0],
    [10, 2],
    [15, 2],
    [30, 3],
    [99, 3],
  ])('segmentIndex(%d) = %d', (x, i) => {
    expect(segmentIndex(xs, x)).toBe(i);
  });

  it.each([
    [-1, 0],
    [0, 0],
    [5, 1],
    [10, 1],
    [15, 3],
    [30, 4],
    [31, 5],
  ])('lowerBound(%d) = %d', (x, i) => {
    expect(lowerBound(xs, x)).toBe(i);
  });
});
