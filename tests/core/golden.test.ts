import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareRoute } from '../../src/core/geo.ts';
import { parseRoute } from '../../src/core/parseRoute.ts';
import { parseSplits } from '../../src/core/parseSplits.ts';
import { rebuild } from '../../src/core/rebuild.ts';
import { serializeGpx } from '../../src/core/serializeGpx.ts';
import { verifyGpx } from '../../src/core/verify.ts';

const fixture = readFileSync(new URL('../fixtures/5.37k.gpx', import.meta.url), 'utf8');
const SPLITS = '1k 6:10, 2k 12:19, 3k 18:13, 4k 24:21, 5.37k 31:31';
const ANCHOR = { kind: 'finish', epochMs: Date.parse('2026-09-30T18:50:00+03:00') } as const;

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function setup() {
  const route = prepareRoute(unwrap(parseRoute(fixture)));
  const parsed = parseSplits(SPLITS, { mode: 'cumulative' });
  expect(parsed.errors).toEqual([]);
  return { route, splits: parsed.splits };
}

describe('golden: 5.37k Kyiv route', () => {
  const { route, splits } = setup();
  const result = unwrap(rebuild(route, splits, ANCHOR, { mismatch: 'scale', sampleIntervalS: 1 }));
  const gpx = serializeGpx(result.points, { name: 'Evening Run' });
  const check = unwrap(verifyGpx(gpx, splits));

  it('keeps all 159 points after dedupe', () => {
    expect(route.points).toHaveLength(159);
  });

  it('measures the route at 5372.9 m', () => {
    expect(route.lengthM).toBeCloseTo(5372.9, -0.3); // ±1 m
    expect(Math.abs(route.lengthM - 5372.9)).toBeLessThanOrEqual(1);
  });

  it('outputs a track of the same length', () => {
    expect(Math.abs(check.totalDistanceM - 5372.9)).toBeLessThanOrEqual(1);
    expect(Math.abs(check.totalDistanceM - route.lengthM)).toBeLessThan(0.1);
  });

  it('starts and ends at the right instants', () => {
    expect(new Date(check.startMs).toISOString()).toBe('2026-09-30T15:18:29.000Z');
    expect(new Date(check.endMs).toISOString()).toBe('2026-09-30T15:50:00.000Z');
    expect(gpx).toContain('<metadata><time>2026-09-30T15:18:29Z</time></metadata>');
    expect(gpx).toMatch(/<time>2026-09-30T15:50:00Z<\/time><\/trkpt>\s*<\/trkseg>/);
  });

  it('hits 1/2/3/4 km within ±1 s of the stated splits', () => {
    const expected = [6 * 60 + 10, 12 * 60 + 19, 18 * 60 + 13, 24 * 60 + 21];
    check.splits.slice(0, 4).forEach((row, i) => {
      expect(row.distanceM).toBe((i + 1) * 1000);
      expect(row.fileS).not.toBeNull();
      expect(Math.abs(row.fileS! - expected[i]!)).toBeLessThanOrEqual(1);
    });
  });

  it('matches the scaled splits almost exactly', () => {
    const scaled = unwrap(verifyGpx(gpx, result.splits));
    expect(scaled.allOk).toBe(true);
    for (const row of scaled.splits) expect(Math.abs(row.deltaS!)).toBeLessThan(0.01);
  });

  it('emits ~2049 points', () => {
    expect(check.pointCount).toBe(result.points.length);
    expect(check.pointCount).toBeGreaterThanOrEqual(2000);
    expect(check.pointCount).toBeLessThanOrEqual(2100);
  });

  it('keeps elevation from the route', () => {
    expect(result.points.every((p) => p.ele !== undefined)).toBe(true);
    expect(gpx).toContain('<ele>');
  });

  it('has no mismatch warning (0.05% off)', () => {
    expect(result.warnings).toEqual([]);
  });
});

describe('regression: why route vertices are kept', () => {
  it('uniform-only sampling cuts corners and loses more than 10 m', () => {
    const { route, splits } = setup();
    const uniform = unwrap(rebuild(route, splits, ANCHOR, { includeVertices: false }));
    const check = unwrap(verifyGpx(serializeGpx(uniform.points, { name: 'x' }), splits));
    expect(route.lengthM - check.totalDistanceM).toBeGreaterThan(10);
  });
});
