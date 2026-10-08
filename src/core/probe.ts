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

/** One pass of the route near a point: where along the route, and how far off (planar). */
export interface PolylinePass {
  distanceM: number;
  dist: number;
}

/**
 * Every separate pass of the polyline `xy` (planar, e.g. map pixels) near `p`, sorted by
 * route distance (`cum`, metres at each vertex), each at its closest point. A line passing
 * through the circle of radius `maxDist` runs at most about that far inside it beyond its
 * closest point, so a point in reach more than 1.5 times that further along the line is another
 * pass (a loop's start and finish, laps, an out-and-back), even if the line never left the
 * circle in between. Passes more than `bandDist` farther than the nearest are left out:
 * they are a neighbouring line, not the same one drawn again.
 */
export function polylinePasses(
  xy: readonly XY[],
  cum: readonly number[],
  p: XY,
  maxDist: number,
  bandDist = 6,
): PolylinePass[] {
  if (xy.length === 1) {
    const dist = Math.hypot(p.x - xy[0]!.x, p.y - xy[0]!.y);
    return dist <= maxDist ? [{ distanceM: 0, dist }] : [];
  }
  const passes: PolylinePass[] = [];
  let current: PolylinePass | null = null;
  let along = 0; // line length up to the current segment's start
  let bestAlong = 0; // where along the line the current pass's closest point is
  for (let i = 0; i + 1 < xy.length; i++) {
    const a = xy[i]!;
    const b = xy[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const f =
      len > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len ** 2)) : 0;
    const dist = Math.hypot(p.x - (a.x + f * dx), p.y - (a.y + f * dy));
    const here = along + f * len;
    along += len;
    if (dist > maxDist) continue;
    if (current && here - bestAlong > 1.5 * maxDist) current = null;
    const hit = { distanceM: cum[i]! + f * (cum[i + 1]! - cum[i]!), dist };
    if (current && dist >= current.dist) continue;
    if (current) Object.assign(current, hit);
    else passes.push((current = hit));
    bestAlong = here;
  }
  if (passes.length === 0) return [];
  const nearest = Math.min(...passes.map((h) => h.dist));
  return passes.filter((h) => h.dist <= nearest + bandDist);
}

/**
 * Which pass to show: the one closest along the route to `nearM` (the previous one, so
 * moving along a lap stays on it), else the one nearest the pointer.
 */
export function pickPass(passes: readonly PolylinePass[], nearM?: number): number {
  let best = 0;
  passes.forEach((h, i) => {
    const b = passes[best]!;
    const better =
      nearM === undefined
        ? h.dist < b.dist
        : Math.abs(h.distanceM - nearM) < Math.abs(b.distanceM - nearM);
    if (better) best = i;
  });
  return best;
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
