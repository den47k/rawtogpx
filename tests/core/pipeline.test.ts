import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareRoute } from '../../src/core/geo.ts';
import { parseRoute } from '../../src/core/parseRoute.ts';
import { runPipeline, type RunInput } from '../../src/core/pipeline.ts';
import { verifyGpx } from '../../src/core/verify.ts';

const fixture = readFileSync(new URL('../fixtures/5.37k.gpx', import.meta.url), 'utf8');
const parsed = parseRoute(fixture);
if (!parsed.ok) throw new Error(parsed.error);
const route = prepareRoute(parsed.value);

const base: RunInput = {
  route,
  splitsText: '1k 6:10, 2k 12:19, 3k 18:13, 4k 24:21, 5.37k 31:31',
  splitMode: 'cumulative',
  anchorKind: 'finish',
  anchorMs: Date.parse('2026-09-30T18:50:00+03:00'),
  mismatch: 'scale',
  sampleIntervalS: 1,
  activityName: '',
  timeZone: 'Europe/Kyiv',
};

describe('runPipeline', () => {
  it('reproduces the reference run from raw inputs', () => {
    const out = runPipeline(base);
    expect(out.error).toBeNull();
    expect(out.name).toBe('Evening Run');
    expect(out.filename).toBe('run_2026-09-30_1818.gpx');
    expect(out.timing).toEqual({
      totalS: 1891,
      startMs: Date.parse('2026-09-30T15:18:29Z'),
      endMs: Date.parse('2026-09-30T15:50:00Z'),
    });
    expect(out.gpx).toContain('<name>Evening Run</name>');
    const v = verifyGpx(
      out.gpx!,
      [1000, 2000, 3000, 4000].map((d, i) => ({ distanceM: d, timeS: [370, 739, 1093, 1461][i]! })),
    );
    expect(v.ok && v.value.allOk).toBe(true);
    expect(v.ok && Math.abs(v.value.totalDistanceM - 5372.9)).toBeLessThanOrEqual(1);
    expect(out.verification?.pointCount).toBeGreaterThanOrEqual(2000);
    expect(out.verification?.pointCount).toBeLessThanOrEqual(2100);
  });

  it('gives the same file from laps input', () => {
    const laps = runPipeline({
      ...base,
      splitsText: '6:10 6:09 5:54 6:08\n1.37k 7:10',
      splitMode: 'laps',
      lapDistanceM: 1000,
    });
    expect(laps.gpx).toBe(runPipeline(base).gpx);
  });

  it('uses a custom name, escaped', () => {
    const out = runPipeline({ ...base, activityName: '  Park <5k> & back ' });
    expect(out.name).toBe('Park <5k> & back');
    expect(out.gpx).toContain('<name>Park &lt;5k&gt; &amp; back</name>');
  });

  it('derives timing without a route', () => {
    const out = runPipeline({ ...base, route: null, anchorKind: 'start' });
    expect(out.timing?.endMs).toBe(Date.parse('2026-09-30T16:21:31Z'));
    expect(out.gpx).toBeNull();
    expect(out.error).toBeNull();
  });

  it('builds nothing with invalid splits or time', () => {
    const bad = runPipeline({ ...base, splitsText: '1k 6:10, 2k nope' });
    expect(bad.parsed.errors).toHaveLength(1);
    expect(bad.timing).toBeNull();
    expect(bad.gpx).toBeNull();
    expect(bad.filename).toBeNull();
    expect(runPipeline({ ...base, anchorMs: undefined }).gpx).toBeNull();
  });

  it('surfaces rebuild errors', () => {
    const out = runPipeline({ ...base, splitsText: '6k 35:00', mismatch: 'trim' });
    expect(out.gpx).toBeNull();
    expect(out.error).toMatch(/scale/);
  });
});
