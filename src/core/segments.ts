import { lowerBound, pointAtDistance } from './geo.ts';
import type { PreparedRoute, RoutePoint, Split } from './types.ts';

export interface SplitSegment {
  index: number;
  /** Stated (input) distances, for labels. */
  fromM: number;
  toM: number;
  /** Seconds for this split and its pace in seconds per stated km. */
  lapS: number;
  paceSPerKm: number;
  /** The part of the route this split covers. */
  points: RoutePoint[];
}

/** The route between distances `fromM` and `toM`, with interpolated ends. */
export function subRoute(route: PreparedRoute, fromM: number, toM: number): RoutePoint[] {
  const out: RoutePoint[] = [pointAtDistance(route, fromM)];
  for (let i = lowerBound(route.cum, fromM); i < route.cum.length && route.cum[i]! < toM; i++) {
    if (route.cum[i]! > fromM) out.push(route.points[i]!);
  }
  out.push(pointAtDistance(route, toM));
  return out;
}

/**
 * One segment per split: geometry from `placed` (split distances as laid on the route,
 * i.e. scaled), labels and pace from `stated` (what the user typed). Same length arrays.
 */
export function splitSegments(
  route: PreparedRoute,
  placed: Split[],
  stated: Split[],
): SplitSegment[] {
  return stated.map((s, i) => {
    const prevStated = i > 0 ? stated[i - 1]! : { distanceM: 0, timeS: 0 };
    const fromPlaced = i > 0 ? placed[i - 1]!.distanceM : 0;
    const lapS = s.timeS - prevStated.timeS;
    return {
      index: i,
      fromM: prevStated.distanceM,
      toM: s.distanceM,
      lapS,
      paceSPerKm: lapS / ((s.distanceM - prevStated.distanceM) / 1000),
      points: subRoute(route, fromPlaced, placed[i]!.distanceM),
    };
  });
}
