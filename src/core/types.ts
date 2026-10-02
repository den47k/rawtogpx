/** A point on the planned route. `ele` is metres above sea level, when known. */
export interface RoutePoint {
  lat: number;
  lon: number;
  ele?: number;
}

/** A route after dedupe, with cumulative distance (metres) at each vertex. */
export interface PreparedRoute {
  points: RoutePoint[];
  /** `cum[i]` is the distance along the polyline from `points[0]` to `points[i]`. */
  cum: number[];
  lengthM: number;
  /** True only if every point carries an elevation. */
  hasElevation: boolean;
}

/**
 * One cumulative split: the runner reached `distanceM` after `timeS` elapsed seconds.
 * A rest split stays at the previous distance while time advances (standing still).
 */
export interface Split {
  distanceM: number;
  timeS: number;
  rest?: boolean;
  /** Display name for interval-block parts, e.g. "Rep 3/6" or "Recovery". */
  label?: string;
  /** A moving recovery between reps (written as a resting lap in TCX). */
  recovery?: boolean;
}

/** An output point with an absolute UTC timestamp in epoch milliseconds. */
export interface TimedPoint {
  lat: number;
  lon: number;
  ele?: number;
  timeMs: number;
}

export type AnchorKind = 'start' | 'finish';

export interface Anchor {
  kind: AnchorKind;
  epochMs: number;
}

/**
 * How to reconcile route length L with the last split distance D.
 * - `scale`: stretch every split distance by L / D.
 * - `trim`: cut the route at D (requires D <= L).
 */
export type MismatchMode = 'scale' | 'trim';

export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
