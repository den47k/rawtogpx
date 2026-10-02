import { EARTH_RADIUS_M, prepareRoute } from './geo.ts';
import { subRoute } from './segments.ts';
import { err, ok, type PreparedRoute, type Result, type RoutePoint } from './types.ts';

export const TRACK_LENGTHS = [400, 250] as const;
export type TrackLength = (typeof TRACK_LENGTHS)[number];

export const MAX_TRACK_LAPS = 250;

export interface TrackOptions {
  center: { lat: number; lon: number };
  lengthM: TrackLength;
  /** Laps to run; fractional laps start part-way round and still finish on the line. */
  laps: number;
  /** Compass bearing of the running direction along the home straight (90 = east). */
  headingDeg: number;
}

/**
 * Straight length and bend radius of the lane-1 measurement line. 400 m uses the IAAF
 * standard (84.39 m straights, 36.80 m radius); other lengths keep its proportions.
 */
export function trackShape(lengthM: number): { straightM: number; radiusM: number } {
  const straightM = lengthM * (84.39 / 400);
  return { straightM, radiusM: (lengthM - 2 * straightM) / (2 * Math.PI) };
}

const BEND_STEP_DEG = 3;

/**
 * One counter-clockwise lap in local metres (x east, y north, centre at origin, home
 * straight along y = -r running east), starting and ending on the finish line at the end
 * of the home straight.
 */
function lapOutline(lengthM: number): { x: number; y: number }[] {
  const { straightM: s, radiusM } = trackShape(lengthM);
  // Bends are drawn as chords; widen the radius a hair so the chords add up to the true
  // arc length (otherwise each lap comes out ~2.6 cm short).
  const half = (BEND_STEP_DEG * Math.PI) / 360;
  const r = (radiusM * half) / Math.sin(half);
  const pts: { x: number; y: number }[] = [];
  const bend = (cx: number, fromDeg: number) => {
    for (let a = 0; a <= 180; a += BEND_STEP_DEG) {
      const t = ((fromDeg + a) * Math.PI) / 180;
      pts.push({ x: cx + r * Math.cos(t), y: r * Math.sin(t) });
    }
  };
  bend(s / 2, -90); // first bend, finishing at the top of the back straight
  bend(-s / 2, 90); // second bend, into the home straight
  pts.push({ x: s / 2, y: -r }); // home straight back to the finish line
  return pts;
}

/** Generate a running-track route of `laps` laps that finishes on the finish line. */
export function generateTrack(opts: TrackOptions): Result<PreparedRoute> {
  const { center, lengthM, laps, headingDeg } = opts;
  if (!TRACK_LENGTHS.includes(lengthM)) return err('Track length must be 400 m or 250 m.');
  if (!Number.isFinite(laps) || laps <= 0 || laps > MAX_TRACK_LAPS) {
    return err(`Laps must be more than 0 and at most ${MAX_TRACK_LAPS}.`);
  }
  if (
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lon) ||
    Math.abs(center.lat) > 85 ||
    Math.abs(center.lon) > 180
  ) {
    return err('Track location is invalid.');
  }
  if (!Number.isFinite(headingDeg)) return err('Heading is invalid.');

  // Rotate local coordinates so the home straight runs along `headingDeg`, then project
  // (equirectangular is exact enough at this scale).
  const theta = ((90 - headingDeg) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const latRad = (center.lat * Math.PI) / 180;
  const toLatLon = ({ x, y }: { x: number; y: number }): RoutePoint => {
    const xr = x * cos - y * sin;
    const yr = x * sin + y * cos;
    return {
      lat: center.lat + (yr / EARTH_RADIUS_M) * (180 / Math.PI),
      lon: center.lon + (xr / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI),
    };
  };

  const lap = lapOutline(lengthM).map(toLatLon);
  const whole = Math.ceil(laps - 1e-9);
  // Each lap ends where the next begins; dedupe drops the repeated join point.
  const full = prepareRoute(Array.from({ length: whole }, () => lap).flat());

  // Fractional laps: drop the start so the run still ends on the finish line.
  const lapLength = full.lengthM / whole;
  const offset = (whole - laps) * lapLength;
  return ok(offset < 1e-6 ? full : prepareRoute(subRoute(full, offset, full.lengthM)));
}

/** `50.4501, 30.5234` (comma, semicolon or space separated) -> lat/lon, or undefined. */
export function parseLatLon(text: string): { lat: number; lon: number } | undefined {
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 85 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
}

export interface TrackPlacement {
  center: { lat: number; lon: number };
  headingDeg: number;
  lengthM: TrackLength;
}

const quantile = (sorted: number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;

/**
 * Work out where a track is from a GPX that goes round it (an activity on the track, or a
 * route drawn around it): centre and long axis from the points' spread, 400 m vs 250 m from
 * its size. Of the two straights, the home straight is the one whose finish line is nearer
 * the file's last point (runs usually end on the line); the UI offers a flip.
 */
export function fitTrack(points: RoutePoint[]): Result<TrackPlacement> {
  if (points.length < 10) return err('Too few points to find a track.');
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon0 = points.reduce((s, p) => s + p.lon, 0) / points.length;
  const kx = EARTH_RADIUS_M * Math.cos((lat0 * Math.PI) / 180) * (Math.PI / 180);
  const ky = EARTH_RADIUS_M * (Math.PI / 180);
  const xy = points.map((p) => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky }));

  // Long axis from the covariance (principal component).
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const { x, y } of xy) {
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  const alpha = 0.5 * Math.atan2(2 * sxy, sxx - syy); // radians from east, counter-clockwise
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const us = xy.map(({ x, y }) => x * ca + y * sa).sort((a, b) => a - b);
  const vs = xy.map(({ x, y }) => -x * sa + y * ca).sort((a, b) => a - b);
  const [u0, u1, v0, v1] = [
    quantile(us, 0.02),
    quantile(us, 0.98),
    quantile(vs, 0.02),
    quantile(vs, 0.98),
  ];
  const along = u1 - u0;
  const across = v1 - v0;
  if (across < 5 || along / across < 1.4) {
    return err("These points don't look like a running track (not an oval).");
  }

  // 400 or 250: compare the oval's size with each shape (the lane-1 line; outer lanes are wider).
  let best: { lengthM: TrackLength; score: number } | null = null;
  for (const lengthM of TRACK_LENGTHS) {
    const { straightM, radiusM } = trackShape(lengthM);
    const score =
      Math.abs(Math.log(along / (straightM + 2 * radiusM))) +
      Math.abs(Math.log(across / (2 * radiusM)));
    if (!best || score < best.score) best = { lengthM, score };
  }
  if (!best || best.score > 0.6) {
    return err("These points don't match a 400 m or 250 m track.");
  }

  const uc = (u0 + u1) / 2;
  const vc = (v0 + v1) / 2;
  const cx = uc * ca - vc * sa;
  const cy = uc * sa + vc * ca;
  const center = { lat: lat0 + cy / ky, lon: lon0 + cx / kx };

  // Finish line (end of the home straight, local (s/2, -r)) for each direction of the axis.
  const { straightM, radiusM } = trackShape(best.lengthM);
  const last = xy[xy.length - 1]!;
  const candidates = [alpha, alpha + Math.PI].map((theta) => {
    const fx = cx + (straightM / 2) * Math.cos(theta) + radiusM * Math.sin(theta);
    const fy = cy + (straightM / 2) * Math.sin(theta) - radiusM * Math.cos(theta);
    const heading = (((90 - (theta * 180) / Math.PI) % 360) + 360) % 360;
    return { heading, dist: Math.hypot(fx - last.x, fy - last.y) };
  });
  const chosen = candidates[0]!.dist <= candidates[1]!.dist ? candidates[0]! : candidates[1]!;
  return ok({ center, headingDeg: Math.round(chosen.heading) % 360, lengthM: best.lengthM });
}
