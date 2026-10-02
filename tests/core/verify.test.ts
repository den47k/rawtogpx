import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M } from '../../src/core/geo.ts';
import { serializeGpx } from '../../src/core/serializeGpx.ts';
import type { TimedPoint } from '../../src/core/types.ts';
import { verifyFile } from '../../src/core/verify.ts';

const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;
const T0 = Date.parse('2026-09-30T15:00:00Z');

/** A straight track at constant 5 m/s with a point every second. */
function track(seconds: number): string {
  const pts: TimedPoint[] = [];
  for (let s = 0; s <= seconds; s++)
    pts.push({ lat: (5 * s) / DEG_M, lon: 0, timeMs: T0 + s * 1000 });
  return serializeGpx(pts, { name: 'test' });
}

describe('verifyFile', () => {
  it('interpolates the crossing time and reports totals', () => {
    const r = verifyFile(track(200), [
      { distanceM: 502.5, timeS: 100.5 },
      { distanceM: 1000, timeS: 202 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value;
    expect(v.pointCount).toBe(201);
    expect(v.startMs).toBe(T0);
    expect(v.endMs).toBe(T0 + 200_000);
    expect(v.totalDistanceM).toBeCloseTo(1000, 1);
    expect(v.splits[0]!.fileS).toBeCloseTo(100.5, 3);
    expect(v.splits[0]!.ok).toBe(true);
    expect(v.splits[1]!.fileS).toBeCloseTo(200, 1);
    expect(v.splits[1]!.deltaS).toBeCloseTo(-2, 1);
    expect(v.splits[1]!.ok).toBe(false);
    expect(v.allOk).toBe(false);
  });

  it('reports null for distances the track never reaches', () => {
    const r = verifyFile(track(10), [{ distanceM: 1000, timeS: 200 }]);
    expect(r.ok && r.value.splits[0]!.fileS).toBeNull();
  });

  it('rejects points without time', () => {
    const r = verifyFile('<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>', [
      { distanceM: 1, timeS: 1 },
    ]);
    expect(r.ok).toBe(false);
  });
});

describe('core purity', () => {
  const dir = new URL('../../src/core/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it.each(files)('%s has no React/DOM/browser dependencies', (file) => {
    const src = readFileSync(new URL(file, dir), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) expect(m[1]).toMatch(/^\.\/\w+\.ts$/);
    expect(src).not.toMatch(/\b(window|document|navigator|localStorage|DOMParser|XMLSerializer)\b/);
  });
});
