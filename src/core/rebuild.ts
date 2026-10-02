import { formatDistance } from './format.ts';
import { pointAtDistance, segmentIndex, trimRoute } from './geo.ts';
import {
  err,
  ok,
  type Anchor,
  type MismatchMode,
  type PreparedRoute,
  type Result,
  type Split,
  type TimedPoint,
} from './types.ts';

export interface RebuildOptions {
  mismatch: MismatchMode;
  /** Spacing of the uniform time samples, seconds. */
  sampleIntervalS: number;
  /**
   * Emit every route vertex and split boundary (default true). Only disable to demonstrate
   * why it matters: time-grid samples alone cut corners and shorten the track.
   */
  includeVertices: boolean;
}

export const DEFAULT_REBUILD_OPTIONS: RebuildOptions = {
  mismatch: 'scale',
  sampleIntervalS: 1,
  includeVertices: true,
};

/** Warn when route length and stated distance differ by more than this fraction. */
export const MISMATCH_WARNING_RATIO = 0.02;

/** Hard cap on output size so a tiny interval can't freeze the browser. */
export const MAX_OUTPUT_POINTS = 500_000;

export interface RebuildResult {
  points: TimedPoint[];
  /** The route actually used (trimmed in `trim` mode). */
  route: PreparedRoute;
  /** Cumulative splits along `route` (distances scaled in `scale` mode). */
  splits: Split[];
  routeLengthM: number;
  statedDistanceM: number;
  /** Factor applied to split distances (1 in `trim` mode). */
  scale: number;
  totalElapsedS: number;
  startMs: number;
  endMs: number;
  warnings: string[];
}

export interface TimeModel {
  totalS: number;
  totalM: number;
  /** Elapsed seconds -> distance along the route. */
  distanceAt(t: number): number;
  /** Distance along the route -> elapsed seconds. */
  timeAt(d: number): number;
}

/**
 * Piecewise-linear distance/time model through (0, 0) and every split: pace is constant
 * within each split. Times strictly increase; distances increase except across a rest,
 * where they hold. At a rest's distance, `timeAt` returns the time the runner leaves.
 */
export function createTimeModel(splits: Split[]): TimeModel {
  const ds = [0, ...splits.map((s) => s.distanceM)];
  const ts = [0, ...splits.map((s) => s.timeS)];
  const map = (xs: number[], ys: number[], x: number): number => {
    const i = segmentIndex(xs, x);
    const x0 = xs[i]!;
    const x1 = xs[i + 1]!;
    if (x1 === x0) return ys[i + 1]!; // a trailing rest
    const f = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return ys[i]! + (ys[i + 1]! - ys[i]!) * f;
  };
  return {
    totalS: ts[ts.length - 1]!,
    totalM: ds[ds.length - 1]!,
    distanceAt: (t) => map(ts, ds, t),
    timeAt: (d) => map(ds, ts, d),
  };
}

/** Rebuild a timestamped track from a route, cumulative splits, and a start/finish anchor. */
export function rebuild(
  route: PreparedRoute,
  splits: Split[],
  anchor: Anchor,
  options: Partial<RebuildOptions> = {},
): Result<RebuildResult> {
  const opts: RebuildOptions = { ...DEFAULT_REBUILD_OPTIONS, ...options };

  if (route.points.length < 2 || route.lengthM <= 0) {
    return err('The route needs at least two distinct points.');
  }
  if (splits.length === 0) return err('Enter at least one split.');
  for (let i = 0; i < splits.length; i++) {
    const prev = i > 0 ? splits[i - 1]! : { distanceM: 0, timeS: 0 };
    const s = splits[i]!;
    const distanceOk = s.rest ? s.distanceM === prev.distanceM : s.distanceM > prev.distanceM;
    if (!distanceOk || !(s.timeS > prev.timeS)) {
      return err('Split distances and times must strictly increase (rests hold distance).');
    }
  }
  if (!Number.isFinite(opts.sampleIntervalS) || opts.sampleIntervalS <= 0) {
    return err('Sample interval must be a positive number of seconds.');
  }
  if (!Number.isFinite(anchor.epochMs)) return err('Invalid start/finish time.');

  const L = route.lengthM;
  const D = splits[splits.length - 1]!.distanceM;
  const warnings: string[] = [];
  if (Math.abs(L / D - 1) > MISMATCH_WARNING_RATIO) {
    warnings.push(
      `Route is ${formatDistance(L)} but splits end at ${formatDistance(D)} ` +
        `(${(Math.abs(L / D - 1) * 100).toFixed(1)}% difference).`,
    );
  }

  let used = route;
  let scale = 1;
  let effective = splits;
  if (opts.mismatch === 'scale') {
    scale = L / D;
    // Splits at the final distance (including a trailing rest) land exactly on the route end.
    effective = splits.map((s) => ({
      ...s,
      distanceM: s.distanceM === D ? L : s.distanceM * scale,
    }));
  } else {
    if (D > L) {
      return err(
        `Splits end at ${formatDistance(D)}, beyond the ${formatDistance(L)} route. ` +
          `Use "scale" to stretch the splits onto the route instead.`,
      );
    }
    used = trimRoute(route, D);
  }

  const model = createTimeModel(effective);
  const totalMs = Math.round(model.totalS * 1000);
  const sampleCount = Math.floor(model.totalS / opts.sampleIntervalS) + 1;
  const exactCount = opts.includeVertices ? used.points.length + effective.length + 1 : 0;
  if (sampleCount + exactCount > MAX_OUTPUT_POINTS) {
    return err('Too many output points; increase the sample interval.');
  }

  const startMs =
    anchor.kind === 'start' ? Math.round(anchor.epochMs) : Math.round(anchor.epochMs) - totalMs;
  const at = (elapsedMs: number, d: number): TimedPoint => {
    const p = pointAtDistance(used, d);
    const out: TimedPoint = { lat: p.lat, lon: p.lon, timeMs: startMs + elapsedMs };
    if (used.hasElevation && p.ele !== undefined) out.ele = p.ele;
    return out;
  };

  // Source 1: exact points. Every route vertex, timed by distance, keeps the geometry of
  // bends; every split boundary (start, each split, both ends of each rest) pins the
  // stated times into the file regardless of the sample interval.
  const exact: TimedPoint[] = [];
  if (opts.includeVertices) {
    used.points.forEach((p, i) => {
      const d = used.cum[i]!;
      const ms = i === used.points.length - 1 ? totalMs : Math.round(model.timeAt(d) * 1000);
      const out: TimedPoint = { lat: p.lat, lon: p.lon, timeMs: startMs + ms };
      if (used.hasElevation && p.ele !== undefined) out.ele = p.ele;
      exact.push(out);
    });
    exact.push(at(0, 0));
    for (const s of effective) exact.push(at(Math.round(s.timeS * 1000), s.distanceM));
    // Stable: on equal times a vertex (pushed first) wins over a boundary point.
    exact.sort((a, b) => a.timeMs - b.timeMs);
  }

  // Source 2: uniform time samples, positioned by distance. Keeps pace smooth for Strava.
  const samples: TimedPoint[] = [];
  for (let k = 0; k < sampleCount; k++) {
    const t = k * opts.sampleIntervalS;
    samples.push(at(Math.round(t * 1000), model.distanceAt(t)));
  }
  if (!opts.includeVertices && samples[samples.length - 1]!.timeMs !== startMs + totalMs) {
    samples.push(at(totalMs, model.totalM));
  }

  // Merge by time; on equal milliseconds keep the exact point and drop the sample.
  const points: TimedPoint[] = [];
  let vi = 0;
  let si = 0;
  while (vi < exact.length || si < samples.length) {
    const v = exact[vi];
    const s = samples[si];
    const next = s === undefined || (v !== undefined && v.timeMs <= s.timeMs) ? v! : s;
    if (next === v) vi++;
    else si++;
    const last = points[points.length - 1];
    if (last === undefined || next.timeMs > last.timeMs) points.push(next);
  }

  return ok({
    points,
    route: used,
    splits: effective,
    routeLengthM: L,
    statedDistanceM: D,
    scale,
    totalElapsedS: model.totalS,
    startMs,
    endMs: startMs + totalMs,
    warnings,
  });
}
