import type { PreparedRoute, RoutePoint } from './types.ts';

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6371008.8;

/** Consecutive points closer than this are treated as duplicates. */
export const DEDUPE_THRESHOLD_M = 0.05;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two points. */
export function haversine(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Drop consecutive points closer than `thresholdM` to the last kept point. */
export function dedupe(points: RoutePoint[], thresholdM = DEDUPE_THRESHOLD_M): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last === undefined || haversine(last, p) >= thresholdM) out.push(p);
  }
  return out;
}

/** Cumulative polyline distance at each vertex; `result[0] === 0`. */
export function cumulativeDistances(points: RoutePoint[]): number[] {
  const cum: number[] = new Array<number>(points.length);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversine(points[i - 1]!, points[i]!);
    cum[i] = total;
  }
  return cum;
}

/** Dedupe a raw route and precompute cumulative distances. */
export function prepareRoute(raw: RoutePoint[]): PreparedRoute {
  const points = dedupe(raw);
  const cum = cumulativeDistances(points);
  return {
    points,
    cum,
    lengthM: cum[cum.length - 1] ?? 0,
    hasElevation: points.length > 0 && points.every((p) => p.ele !== undefined),
  };
}

/**
 * Index `i` of the segment containing `x`, i.e. `xs[i] <= x <= xs[i + 1]`, for a
 * non-decreasing array. Clamped to `[0, xs.length - 2]`.
 */
export function segmentIndex(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 1) return 0;
  if (x <= xs[0]!) return 0;
  if (x >= xs[hi]!) return hi - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** First index `i` with `xs[i] >= x` in a non-decreasing array, or `xs.length` if none. */
export function lowerBound(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Linear interpolation between two route points (fine at segment scale). */
export function interpolate(a: RoutePoint, b: RoutePoint, f: number): RoutePoint {
  const p: RoutePoint = { lat: lerp(a.lat, b.lat, f), lon: lerp(a.lon, b.lon, f) };
  if (a.ele !== undefined && b.ele !== undefined) p.ele = lerp(a.ele, b.ele, f);
  return p;
}

/** The point at distance `d` along the route, clamped to its ends. */
export function pointAtDistance(route: PreparedRoute, d: number): RoutePoint {
  const { points, cum } = route;
  if (points.length === 1) return points[0]!;
  const i = segmentIndex(cum, d);
  const d0 = cum[i]!;
  const d1 = cum[i + 1]!;
  const f = d1 > d0 ? Math.min(1, Math.max(0, (d - d0) / (d1 - d0))) : 0;
  return interpolate(points[i]!, points[i + 1]!, f);
}

/** Cut the route at distance `d` (0 < d <= length), interpolating the final point. */
export function trimRoute(route: PreparedRoute, d: number): PreparedRoute {
  if (d >= route.lengthM) return route;
  const i = segmentIndex(route.cum, d);
  const points = route.points.slice(0, i + 1);
  const cum = route.cum.slice(0, i + 1);
  if (d - cum[i]! > 0) {
    points.push(pointAtDistance(route, d));
    cum.push(d);
  }
  return { points, cum, lengthM: d, hasElevation: route.hasElevation };
}
