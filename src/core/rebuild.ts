import { formatDistance } from './format.ts';
import { lowerBound, pointAtDistance, trimRoute } from './geo.ts';
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
  /** Seconds over which pace eases into the next split, each side of a boundary (0: steps). */
  paceRampS: number;
}

/** Default easing between split paces, seconds each side of a boundary. */
export const PACE_RAMP_S = 8;
/** Pulling away from a standing rest is quicker. */
const START_RAMP_S = 3;
/**
 * No two output points closer than this, seconds. Over a tiny gap, coordinate rounding
 * (7 dp is ~1 cm) turns into large pace spikes in anything that charts point-to-point pace.
 */
export const MIN_POINT_GAP_S = 0.4;

export const DEFAULT_REBUILD_OPTIONS: RebuildOptions = {
  mismatch: 'scale',
  sampleIntervalS: 1,
  includeVertices: true,
  paceRampS: PACE_RAMP_S,
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

/** A stretch of constant acceleration: speed runs linearly from `v0` over [t0, t1]. */
interface Piece {
  t0: number;
  t1: number;
  d0: number;
  d1: number;
  v0: number;
  acc: number;
}

/**
 * Distance/time model through (0, 0) and every split. Within a split the pace is constant,
 * except that over `rampS` seconds either side of a boundary it eases linearly to the next
 * split's pace (out of a rest, more quickly; into one, not at all). The steady pace is
 * raised or lowered to make up for the ramps, so every split boundary is still hit exactly.
 * With `rampS = 0` the model is piecewise linear.
 *
 * Times strictly increase; distances increase except across a rest, where they hold. At a
 * rest's distance, `timeAt` returns the time the runner leaves.
 */
export function createTimeModel(splits: Split[], rampS = PACE_RAMP_S): TimeModel {
  const ts = [0, ...splits.map((s) => s.timeS)];
  const ds = [0, ...splits.map((s) => s.distanceM)];
  const n = splits.length;
  const rest = (i: number) => ds[i] === ds[i - 1];
  /** Average speed of split `i` (1-based), m/s. */
  const avg = (i: number) => (ds[i]! - ds[i - 1]!) / (ts[i]! - ts[i - 1]!);
  /** Speed at boundary `j` between splits j and j + 1: their mean, or 0 next to a rest. */
  const knotSpeed = (j: number) => (rest(j) || rest(j + 1) ? 0 : (avg(j) + avg(j + 1)) / 2);
  // Arrival at a rest is abrupt: easing in would cross the split distance noticeably early
  // when scaling moves the stop a little past it.
  const knotRamp = (j: number) =>
    j === 0 || j === n || rest(j + 1) ? 0 : rest(j) ? Math.min(rampS, START_RAMP_S) : rampS;

  const pieces: Piece[] = [];
  const push = (t0: number, t1: number, d0: number, v0: number, v1: number) => {
    if (t1 <= t0) return d0;
    const d1 = d0 + ((v0 + v1) / 2) * (t1 - t0);
    pieces.push({ t0, t1, d0, d1, v0, acc: (v1 - v0) / (t1 - t0) });
    return d1;
  };

  for (let i = 1; i <= n; i++) {
    const t0 = ts[i - 1]!;
    const t1 = ts[i]!;
    const d0 = ds[i - 1]!;
    if (rest(i)) {
      pieces.push({ t0, t1, d0, d1: d0, v0: 0, acc: 0 });
      continue;
    }
    const tau = t1 - t0;
    const v = avg(i);
    let a = Math.min(knotRamp(i - 1), tau / 4);
    let b = Math.min(knotRamp(i), tau / 4);
    const us = a > 0 ? knotSpeed(i - 1) : v;
    const ue = b > 0 ? knotSpeed(i) : v;
    let p = (ds[i]! - d0 - (a * us + b * ue) / 2) / (tau - (a + b) / 2);
    // A much faster neighbour would leave too little for the steady part: don't ease.
    if (!(p >= v / 2)) {
      a = 0;
      b = 0;
      p = v;
    }
    let d = push(t0, t0 + a, d0, us, p);
    d = push(t0 + a, t1 - b, d, p, p);
    push(t1 - b, t1, d, p, ue);
    // Land exactly on the split, whatever the rounding.
    pieces[pieces.length - 1]!.d1 = ds[i]!;
  }

  const totalS = ts[n]!;
  const totalM = ds[n]!;
  const t0s = pieces.map((q) => q.t0);
  const d0s = pieces.map((q) => q.d0);
  /** Last index with `xs[i] <= x` in a non-decreasing array, at least 0. */
  const lastAtOrBelow = (xs: number[], x: number) => {
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (xs[mid]! <= x) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - 1);
  };

  return {
    totalS,
    totalM,
    distanceAt: (t) => {
      if (pieces.length === 0) return 0;
      const q = pieces[lastAtOrBelow(t0s, Math.min(totalS, Math.max(0, t)))]!;
      const s = Math.min(q.t1 - q.t0, Math.max(0, t - q.t0));
      if (q.acc === 0) return q.d0 + (q.d1 - q.d0) * (s / (q.t1 - q.t0));
      return Math.min(q.d1, q.d0 + q.v0 * s + (q.acc * s * s) / 2);
    },
    timeAt: (d) => {
      if (pieces.length === 0) return 0;
      const x = Math.min(totalM, Math.max(0, d));
      const q = pieces[lastAtOrBelow(d0s, x)]!;
      if (q.d1 === q.d0) return q.t1; // standing: leaves at the end
      const delta = Math.max(0, x - q.d0);
      if (q.acc === 0) return q.t0 + (q.t1 - q.t0) * Math.min(1, delta / (q.d1 - q.d0));
      // Solve v0·s + acc·s²/2 = delta in a form that stays stable as acc -> 0.
      const root = Math.sqrt(Math.max(0, q.v0 * q.v0 + 2 * q.acc * delta));
      const s = q.v0 + root > 0 ? (2 * delta) / (q.v0 + root) : 0;
      return q.t0 + Math.min(q.t1 - q.t0, s);
    },
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
  if (!Number.isFinite(opts.paceRampS) || opts.paceRampS < 0) {
    return err('Pace easing must be zero or more seconds.');
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

  const model = createTimeModel(effective, opts.paceRampS);
  const totalMs = Math.round(model.totalS * 1000);
  const intervalMs = opts.sampleIntervalS * 1000;
  const sampleCount = Math.floor(model.totalS / opts.sampleIntervalS) + 1;
  const exactCount = opts.includeVertices ? used.points.length + effective.length + 1 : 0;
  if (sampleCount + exactCount > MAX_OUTPUT_POINTS) {
    return err('Too many output points; increase the sample interval.');
  }
  // A deliberately dense interval is the user's call; otherwise keep gaps >= MIN_POINT_GAP_S.
  const minGapMs = Math.min(MIN_POINT_GAP_S * 1000, intervalMs / 2);

  const startMs =
    anchor.kind === 'start' ? Math.round(anchor.epochMs) : Math.round(anchor.epochMs) - totalMs;
  const at = (elapsedMs: number, d: number): TimedPoint => {
    const p = pointAtDistance(used, d);
    const out: TimedPoint = { lat: p.lat, lon: p.lon, timeMs: startMs + elapsedMs };
    if (used.hasElevation && p.ele !== undefined) out.ele = p.ele;
    return out;
  };

  // Source 1: exact points, in elapsed ms. Every route vertex, timed by distance, keeps the
  // geometry of bends; every split boundary (start, each split, both ends of each rest) pins
  // the stated times. Every vertex is kept, however close: even ~1 m segments at a tight bend
  // add up (dropping them shortened the reference run by 6.5 m). A boundary point within the
  // minimum gap of a vertex is dropped instead; the time model still pins the split there.
  const vertices: TimedPoint[] = [];
  if (opts.includeVertices) {
    used.points.forEach((p, i) => {
      const last = i === used.points.length - 1;
      const ms = last ? totalMs : Math.round(model.timeAt(used.cum[i]!) * 1000);
      const out: TimedPoint = { lat: p.lat, lon: p.lon, timeMs: startMs + ms };
      if (used.hasElevation && p.ele !== undefined) out.ele = p.ele;
      vertices.push(out);
    });
  }
  const boundaries = [at(0, 0), at(totalMs, model.totalM)];
  if (opts.includeVertices) {
    for (const s of effective) boundaries.push(at(Math.round(s.timeS * 1000), s.distanceM));
  }
  const vertexMs = vertices.map((v) => v.timeMs);
  const exact = [
    ...vertices,
    ...boundaries.filter((b) => {
      // Nearest vertices on either side.
      const i = lowerBound(vertexMs, b.timeMs);
      const after = vertexMs[i];
      const before = vertexMs[i - 1];
      return (
        (after === undefined || after - b.timeMs >= minGapMs) &&
        (before === undefined || b.timeMs - before >= minGapMs)
      );
    }),
  ].sort((a, b) => a.timeMs - b.timeMs);
  const anchors = exact.filter((p, i) => i === 0 || p.timeMs > exact[i - 1]!.timeMs);

  // Source 2: time samples between the exact points, positioned by distance. Dense samples
  // keep Strava's auto-pause off and the pace graph smooth. Between two exact points, as many
  // samples as the uniform grid would put there, evenly spaced, so no gap is tiny.
  const points: TimedPoint[] = [];
  anchors.forEach((b, i) => {
    const a = anchors[i - 1];
    if (a) {
      const t0 = a.timeMs - startMs;
      const t1 = b.timeMs - startMs;
      let count = Math.max(0, Math.ceil(t1 / intervalMs) - Math.floor(t0 / intervalMs) - 1);
      while (count > 0 && (t1 - t0) / (count + 1) < minGapMs) count--;
      for (let k = 1; k <= count; k++) {
        const ms = Math.round(t0 + ((t1 - t0) * k) / (count + 1));
        points.push(at(ms, model.distanceAt(ms / 1000)));
      }
    }
    points.push(b);
  });

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
