import { lowerBound, pointAtDistance } from './geo.ts';
import { createTimeModel } from './rebuild.ts';
import type { PreparedRoute, Split } from './types.ts';

/** A point in a planar coordinate system, e.g. map pixels. */
export interface XY {
  x: number;
  y: number;
}

/** Grade is measured over this distance either side of the probed point, metres. */
export const GRADE_WINDOW_M = 20;

/** Stats at one point along the route, for the map's hover readout. */
export interface RouteProbe {
  /** Distance along the route (as written to the file), metres. */
  distanceM: number;
  ele?: number;
  /** Rise over run around the point, percent. */
  gradePct?: number;
  /** Total ascent from the start up to this point, metres. */
  ascentM?: number;
  /** Elapsed seconds when the runner passes this point (leaves it, for a rest spot). */
  elapsedS?: number;
  /** Index of the split this point belongs to. */
  splitIndex?: number;
}

/**
 * Snap `p` to the polyline `xy` (planar, e.g. map pixels) and return the route distance of
 * the nearest point, using `cum` (metres at each vertex). Null if nothing is within
 * `maxDist`. Where the route passes the same spot more than once (laps on a track), any pass
 * within `tieDist` of the nearest counts, and the one closest to `nearM` wins.
 */
export function snapToPolyline(
  xy: readonly XY[],
  cum: readonly number[],
  p: XY,
  maxDist: number,
  nearM?: number,
  tieDist = 2,
): number | null {
  const hits: { dist: number; d: number }[] = [];
  if (xy.length === 1) {
    const dist = Math.hypot(p.x - xy[0]!.x, p.y - xy[0]!.y);
    return dist <= maxDist ? 0 : null;
  }
  for (let i = 0; i + 1 < xy.length; i++) {
    const a = xy[i]!;
    const b = xy[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const f = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const dist = Math.hypot(p.x - (a.x + f * dx), p.y - (a.y + f * dy));
    if (dist <= maxDist) hits.push({ dist, d: cum[i]! + f * (cum[i + 1]! - cum[i]!) });
  }
  if (hits.length === 0) return null;
  const min = Math.min(...hits.map((h) => h.dist));
  const close = hits.filter((h) => h.dist <= min + tieDist);
  if (nearM === undefined) return close.reduce((best, h) => (h.dist < best.dist ? h : best)).d;
  return close.reduce((best, h) => (Math.abs(h.d - nearM) < Math.abs(best.d - nearM) ? h : best)).d;
}

/** Ascent (sum of rises) from the route start to distance `d`, metres. */
export function ascentTo(route: PreparedRoute, d: number): number {
  const { points, cum } = route;
  let total = 0;
  let prev = points[0]?.ele ?? 0;
  for (let i = 1; i < points.length && cum[i]! <= d; i++) {
    const e = points[i]!.ele ?? prev;
    if (e > prev) total += e - prev;
    prev = e;
  }
  const end = pointAtDistance(route, d).ele ?? prev;
  return end > prev ? total + end - prev : total;
}

/**
 * Stats at distance `d` along `route`. With `splits` (cumulative, laid on this route, i.e.
 * scaled), also the elapsed time and the split the point falls in.
 */
export function probeRoute(route: PreparedRoute, d: number, splits?: Split[]): RouteProbe {
  const distanceM = Math.min(route.lengthM, Math.max(0, d));
  const out: RouteProbe = { distanceM };

  if (route.hasElevation) {
    out.ele = pointAtDistance(route, distanceM).ele!;
    const lo = Math.max(0, distanceM - GRADE_WINDOW_M);
    const hi = Math.min(route.lengthM, distanceM + GRADE_WINDOW_M);
    if (hi - lo > 1) {
      const rise = pointAtDistance(route, hi).ele! - pointAtDistance(route, lo).ele!;
      out.gradePct = (rise / (hi - lo)) * 100;
    }
    out.ascentM = ascentTo(route, distanceM);
  }

  if (splits && splits.length > 0) {
    out.elapsedS = createTimeModel(splits).timeAt(distanceM);
    // The first split reaching this distance; a point on a split boundary belongs to the
    // split that ends there, not to a rest held at the same spot.
    const i = lowerBound(
      splits.map((s) => s.distanceM),
      distanceM,
    );
    out.splitIndex = Math.min(i, splits.length - 1);
  }
  return out;
}
