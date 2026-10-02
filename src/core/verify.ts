import { cumulativeDistances, lowerBound } from './geo.ts';
import { parseTrackFile } from './parseRoute.ts';
import { err, ok, type Result, type Split } from './types.ts';

/** Splits whose file time differs from the input by more than this are flagged. */
export const VERIFY_TOLERANCE_S = 1;

/**
 * Coordinate rounding (7 dp ~ 1 cm) can leave the track a hair shorter than the last split;
 * targets this close past the end count as reached at the final point.
 */
const END_TOLERANCE_M = 0.5;

/**
 * A rest matches the nearest stretch of standing still (identical positions) within this
 * many metres, or this fraction of its distance (the mismatch-warning threshold).
 */
const REST_MATCH_M = 2;
const REST_MATCH_RATIO = 0.02;

/** A run of consecutive points at one position: a rest in the file. */
interface Hold {
  distanceM: number;
  first: number;
  last: number;
}

export interface VerifiedSplit {
  distanceM: number;
  expectedS: number;
  /** Elapsed time at which the output track reaches `distanceM`; null if it never does. */
  fileS: number | null;
  deltaS: number | null;
  ok: boolean;
}

export interface Verification {
  splits: VerifiedSplit[];
  totalDistanceM: number;
  startMs: number;
  endMs: number;
  pointCount: number;
  allOk: boolean;
}

/**
 * Re-parse a generated GPX or TCX string (not the in-memory points) and measure, for each
 * split distance, the elapsed time at which the track reaches it. For a rest, the time the
 * track leaves that spot. A split that ends where a rest begins is timed on arrival.
 */
export function verifyFile(text: string, splits: Split[]): Result<Verification> {
  const parsed = parseTrackFile(text);
  if (!parsed.ok) return parsed;
  const points = parsed.value;
  const times: number[] = [];
  for (const [i, p] of points.entries()) {
    const t = p.time === undefined ? NaN : Date.parse(p.time);
    if (!Number.isFinite(t)) return err(`Output point #${i + 1} has no valid <time>.`);
    if (i > 0 && t < times[i - 1]!) return err(`Output point #${i + 1} goes back in time.`);
    times.push(t);
  }

  const cum = cumulativeDistances(points);
  const startMs = times[0]!;
  const endMs = times[times.length - 1]!;
  const total = cum[cum.length - 1]!;

  const holds: Hold[] = [];
  for (let i = 1; i < points.length; i++) {
    if (cum[i] !== cum[i - 1]) continue;
    const h = holds[holds.length - 1];
    if (h && h.last === i - 1) h.last = i;
    else holds.push({ distanceM: cum[i]!, first: i - 1, last: i });
  }
  const elapsed = (i: number): number => (times[i]! - startMs) / 1000;

  const rows = splits.map((s): VerifiedSplit => {
    // A rest is timed when the track leaves its stop. A split ending exactly where a stop
    // begins is timed on arrival; otherwise splits are timed where the track crosses their
    // stated distance, as Strava measures them.
    const reach = s.rest ? Math.max(REST_MATCH_M, REST_MATCH_RATIO * s.distanceM) : END_TOLERANCE_M;
    let hold: Hold | undefined;
    for (const h of holds) {
      const d = Math.abs(h.distanceM - s.distanceM);
      if (d <= reach && (!hold || d < Math.abs(hold.distanceM - s.distanceM))) hold = h;
    }
    // The first point at or past the target; interpolate within the crossing segment.
    const target =
      s.distanceM > total && s.distanceM - total <= END_TOLERANCE_M ? total : s.distanceM;
    const j = lowerBound(cum, target);
    let fileS: number | null = null;
    if (hold) {
      fileS = elapsed(s.rest ? hold.last : hold.first);
    } else if (s.rest) {
      fileS = null; // the file never stands still here
    } else if (j === 0) {
      fileS = 0;
    } else if (j < cum.length) {
      const d0 = cum[j - 1]!;
      const d1 = cum[j]!;
      const f = Math.min(1, Math.max(0, (target - d0) / (d1 - d0)));
      fileS = (times[j - 1]! + (times[j]! - times[j - 1]!) * f - startMs) / 1000;
    }
    const deltaS = fileS === null ? null : fileS - s.timeS;
    return {
      distanceM: s.distanceM,
      expectedS: s.timeS,
      fileS,
      deltaS,
      ok: deltaS !== null && Math.abs(deltaS) <= VERIFY_TOLERANCE_S,
    };
  });

  return ok({
    splits: rows,
    totalDistanceM: total,
    startMs,
    endMs,
    pointCount: points.length,
    allOk: rows.every((r) => r.ok),
  });
}
