import { lowerBound, pointAtDistance } from './geo.ts';
import type { PreparedRoute, RoutePoint, Split } from './types.ts';

export interface SplitSegment {
  index: number;
  /** Stated (input) distances, for labels. */
  fromM: number;
  toM: number;
  /** Seconds for this split and its pace in seconds per stated km (NaN for a rest). */
  lapS: number;
  paceSPerKm: number;
  rest: boolean;
  /** Interval-block label ("Rep 3/6", "Recovery"), if any. */
  label?: string;
  /** The part of the route this split covers; for a rest, the single spot. */
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
    const rest = s.rest === true;
    const segment: SplitSegment = {
      index: i,
      fromM: prevStated.distanceM,
      toM: s.distanceM,
      lapS,
      paceSPerKm: rest ? NaN : lapS / ((s.distanceM - prevStated.distanceM) / 1000),
      rest,
      points: rest
        ? [pointAtDistance(route, fromPlaced)]
        : subRoute(route, fromPlaced, placed[i]!.distanceM),
    };
    if (s.label !== undefined) segment.label = s.label;
    return segment;
  });
}

/** Pace of each split in seconds per km; NaN for rests. */
export function splitPaces(splits: Split[]): number[] {
  return splits.map((s, i) => {
    const prev = i > 0 ? splits[i - 1]! : { distanceM: 0, timeS: 0 };
    return s.rest ? NaN : (s.timeS - prev.timeS) / ((s.distanceM - prev.distanceM) / 1000);
  });
}

/** Total time spent in rests, seconds. */
export function restSeconds(splits: Split[]): number {
  return splits.reduce(
    (sum, s, i) => (s.rest ? sum + s.timeS - (i > 0 ? splits[i - 1]!.timeS : 0) : sum),
    0,
  );
}
