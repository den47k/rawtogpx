import { describe, expect, it } from 'vitest';
import { haversine } from '../../src/core/geo.ts';
import {
  fitTrack,
  generateTrack,
  parseLatLon,
  trackShape,
  type TrackOptions,
} from '../../src/core/track.ts';

const center = { lat: 50.4501, lon: 30.5234 };
const base: TrackOptions = { center, lengthM: 400, laps: 1, headingDeg: 90 };

function track(opts: Partial<TrackOptions>) {
  const r = generateTrack({ ...base, ...opts });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** Initial compass bearing from a to b, degrees. */
function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toRad) * Math.cos(b.lat * toRad);
  const x =
    Math.cos(a.lat * toRad) * Math.sin(b.lat * toRad) -
    Math.sin(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.cos((b.lon - a.lon) * toRad);
  return (((Math.atan2(y, x) / toRad) % 360) + 360) % 360;
}

describe('track shape', () => {
  it('uses the standard 400 m geometry', () => {
    const s = trackShape(400);
    expect(s.straightM).toBeCloseTo(84.39, 2);
    expect(s.radiusM).toBeCloseTo(36.8, 1);
  });
});

describe('generateTrack', () => {
  it.each([
    [400, 1],
    [400, 12.5],
    [400, 25],
    [250, 1],
    [250, 20],
  ] as const)('%i m × %s laps has the right length', (lengthM, laps) => {
    const t = track({ lengthM, laps });
    expect(Math.abs(t.lengthM - lengthM * laps)).toBeLessThan(0.002 * laps + 0.01);
  });

  it('ends every run on the finish line, whatever the lap count', () => {
    const one = track({ laps: 1 }).points.at(-1)!;
    for (const laps of [3, 12.5, 7.25]) {
      expect(haversine(track({ laps }).points.at(-1)!, one)).toBeLessThan(0.01);
    }
    // ...and a full-lap run starts there too.
    expect(haversine(track({ laps: 3 }).points[0]!, one)).toBeLessThan(0.01);
  });

  it('starts a half-lap run on the far side', () => {
    const t = track({ laps: 12.5 });
    const finish = t.points.at(-1)!;
    expect(haversine(t.points[0]!, finish)).toBeGreaterThan(60);
  });

  it('is centred on the given point', () => {
    const t = track({});
    const lat = t.points.reduce((s, p) => s + p.lat, 0) / t.points.length;
    const lon = t.points.reduce((s, p) => s + p.lon, 0) / t.points.length;
    expect(haversine({ lat, lon }, center)).toBeLessThan(3);
  });

  it.each([0, 45, 90, 200, 315])('runs the home straight along heading %i°', (headingDeg) => {
    const pts = track({ headingDeg }).points;
    // The last two points are the end of the second bend and the finish line.
    const b = bearing(pts.at(-2)!, pts.at(-1)!);
    const diff = Math.abs(((b - headingDeg + 540) % 360) - 180);
    expect(diff).toBeLessThan(0.5);
  });

  it('runs counter-clockwise', () => {
    const pts = track({}).points;
    // Shoelace area in local metres: positive = counter-clockwise.
    const k = Math.cos((center.lat * Math.PI) / 180);
    let area = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      area += pts[i]!.lon * k * pts[i + 1]!.lat - pts[i + 1]!.lon * k * pts[i]!.lat;
    }
    expect(area).toBeGreaterThan(0);
  });

  it.each([
    [{ laps: 0 }, /Laps/],
    [{ laps: 1000 }, /Laps/],
    [{ laps: NaN }, /Laps/],
    [{ center: { lat: 95, lon: 0 } }, /location/],
    [{ lengthM: 300 as 400 }, /400 m or 250 m/],
  ])('rejects %j', (opts, message) => {
    const r = generateTrack({ ...base, ...opts });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});

describe('parseLatLon', () => {
  it.each<[string, { lat: number; lon: number } | undefined]>([
    ['50.4501, 30.5234', { lat: 50.4501, lon: 30.5234 }],
    ['50.4501,30.5234', { lat: 50.4501, lon: 30.5234 }],
    [' -33.86 151.2 ', { lat: -33.86, lon: 151.2 }],
    ['40.7;-74', { lat: 40.7, lon: -74 }],
    ['91, 0', undefined],
    ['10, 181', undefined],
    ['50.45', undefined],
    ['abc', undefined],
    ['', undefined],
  ])('%j', (text, expected) => {
    expect(parseLatLon(text)).toEqual(expected);
  });
});

describe('fitTrack', () => {
  // Deterministic jitter so the test is repeatable.
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const jitter = (pts: { lat: number; lon: number }[], metres: number) =>
    pts.map((p) => ({
      lat: p.lat + (rand() * metres) / 111_195,
      lon: p.lon + (rand() * metres) / (111_195 * Math.cos((p.lat * Math.PI) / 180)),
    }));
  const headingDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

  it.each([
    [400, 90, 3],
    [400, 20, 12.5],
    [400, 233, 5],
    [250, 135, 4],
    [250, 0, 8],
  ] as const)(
    'recovers a %i m track at heading %i° from %s noisy laps',
    (lengthM, headingDeg, laps) => {
      const track = generateTrack({ center, lengthM, laps, headingDeg });
      if (!track.ok) throw new Error(track.error);
      const fit = fitTrack(jitter(track.value.points, 3));
      if (!fit.ok) throw new Error(fit.error);
      expect(fit.value.lengthM).toBe(lengthM);
      expect(haversine(fit.value.center, center)).toBeLessThan(2);
      expect(headingDiff(fit.value.headingDeg, headingDeg)).toBeLessThan(2);
    },
  );

  it('copes with a run in an outer lane', () => {
    // Lane 4 is ~3.7 m further out: a 400 m oval drawn ~1.06× larger.
    const t = generateTrack({ center, lengthM: 400, laps: 2, headingDeg: 70 });
    if (!t.ok) throw new Error(t.error);
    const wider = t.value.points.map((p) => ({
      lat: center.lat + (p.lat - center.lat) * 1.06,
      lon: center.lon + (p.lon - center.lon) * 1.06,
    }));
    const fit = fitTrack(wider);
    expect(fit.ok && fit.value.lengthM).toBe(400);
  });

  it.each([
    ['a straight line', Array.from({ length: 50 }, (_, i) => ({ lat: 50 + i * 1e-4, lon: 30 }))],
    [
      'a circle',
      Array.from({ length: 90 }, (_, i) => ({
        lat: 50 + 4e-4 * Math.sin((i * Math.PI) / 45),
        lon: 30 + 6e-4 * Math.cos((i * Math.PI) / 45),
      })),
    ],
    ['too few points', [{ lat: 50, lon: 30 }]],
  ])('rejects %s', (_name, pts) => {
    expect(fitTrack(pts).ok).toBe(false);
  });

  it('rejects an oval of the wrong size', () => {
    const t = generateTrack({ center, lengthM: 400, laps: 1, headingDeg: 0 });
    if (!t.ok) throw new Error(t.error);
    const huge = t.value.points.map((p) => ({
      lat: center.lat + (p.lat - center.lat) * 4,
      lon: center.lon + (p.lon - center.lon) * 4,
    }));
    expect(fitTrack(huge).ok).toBe(false);
  });
});
