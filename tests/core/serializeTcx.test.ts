import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareRoute } from '../../src/core/geo.ts';
import { parseRoute, parseTcxPoints } from '../../src/core/parseRoute.ts';
import { parseSplits } from '../../src/core/parseSplits.ts';
import { rebuild } from '../../src/core/rebuild.ts';
import { serializeGpx } from '../../src/core/serializeGpx.ts';
import { serializeTcx } from '../../src/core/serializeTcx.ts';
import { verifyFile } from '../../src/core/verify.ts';

const NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const fixture = readFileSync(new URL('../fixtures/5.37k.gpx', import.meta.url), 'utf8');

function build(text: string) {
  const parsedRoute = parseRoute(fixture);
  if (!parsedRoute.ok) throw new Error(parsedRoute.error);
  const route = prepareRoute(parsedRoute.value);
  const { splits } = parseSplits(text, { mode: 'cumulative' });
  const r = rebuild(route, splits, {
    kind: 'finish',
    epochMs: Date.parse('2026-09-30T18:50:00+03:00'),
  });
  if (!r.ok) throw new Error(r.error);
  const { points, splits: placed, startMs } = r.value;
  return {
    stated: splits,
    placed,
    points,
    tcx: serializeTcx(points, placed, { startMs, name: 'Evening <Run> & co' }),
    gpx: serializeGpx(points, { name: 'x' }),
  };
}

describe('serializeTcx', () => {
  const { stated, placed, points, tcx, gpx } = build(
    '1k 6:10, 2k 12:19, rest 1:00, 3k 19:13, 4k 25:21, 5.37k 32:31',
  );
  const errors: string[] = [];
  const doc = new DOMParser({ onError: (_l, msg) => errors.push(msg) }).parseFromString(
    tcx,
    'text/xml',
  );
  const laps = Array.from(doc.getElementsByTagNameNS(NS, 'Lap'));
  const text = (el: { getElementsByTagNameNS: typeof doc.getElementsByTagNameNS }, tag: string) =>
    el.getElementsByTagNameNS(NS, tag)[0]!.textContent!;

  it('is well-formed TCX v2 with a running activity', () => {
    expect(errors).toEqual([]);
    expect(doc.documentElement!.localName).toBe('TrainingCenterDatabase');
    expect(doc.documentElement!.namespaceURI).toBe(NS);
    const activity = doc.getElementsByTagNameNS(NS, 'Activity')[0]!;
    expect(activity.getAttribute('Sport')).toBe('Running');
    expect(text(activity, 'Id')).toBe('2026-09-30T15:17:29Z');
    expect(tcx).toContain('<Notes>Evening &lt;Run&gt; &amp; co</Notes>');
    expect(tcx.startsWith('<?xml')).toBe(true);
  });

  it('writes one lap per split, rests as resting laps', () => {
    expect(laps).toHaveLength(6);
    expect(laps.map((l) => text(l, 'Intensity'))).toEqual([
      'Active',
      'Active',
      'Resting',
      'Active',
      'Active',
      'Active',
    ]);
    expect(laps.map((l) => Number(text(l, 'TotalTimeSeconds')))).toEqual([
      370, 369, 60, 354, 368, 430,
    ]);
    expect(Number(text(laps[2]!, 'DistanceMeters'))).toBe(0);
    const total = laps.reduce((sum, l) => sum + Number(text(l, 'DistanceMeters')), 0);
    expect(total).toBeCloseTo(placed.at(-1)!.distanceM, 1);
    expect(laps.map((l) => l.getAttribute('StartTime'))).toEqual([
      '2026-09-30T15:17:29Z',
      '2026-09-30T15:23:39Z',
      '2026-09-30T15:29:48Z',
      '2026-09-30T15:30:48Z',
      '2026-09-30T15:36:42Z',
      '2026-09-30T15:42:50Z',
    ]);
  });

  it('puts every point in exactly one lap, in order, with rising distance', () => {
    const tps = Array.from(doc.getElementsByTagNameNS(NS, 'Trackpoint'));
    expect(tps).toHaveLength(points.length);
    const dists = tps.map((t) => Number(text(t, 'DistanceMeters')));
    for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1]!);
    // Every lap's points fall inside its time window.
    for (const lap of laps) {
      const start = Date.parse(lap.getAttribute('StartTime')!);
      const end = start + Number(text(lap, 'TotalTimeSeconds')) * 1000;
      for (const tp of Array.from(lap.getElementsByTagNameNS(NS, 'Trackpoint'))) {
        const t = Date.parse(text(tp, 'Time'));
        expect(t).toBeGreaterThanOrEqual(start);
        expect(t).toBeLessThanOrEqual(end);
      }
    }
  });

  it('carries the same points as the GPX and verifies the same', () => {
    const fromTcx = parseTcxPoints(tcx);
    if (!fromTcx.ok) throw new Error(fromTcx.error);
    expect(fromTcx.value.map((p) => p.time)).toEqual(
      points.map((p) => new Date(p.timeMs).toISOString().replace('.000Z', 'Z')),
    );
    const a = verifyFile(tcx, stated);
    const b = verifyFile(gpx, stated);
    if (!a.ok || !b.ok) throw new Error('verify failed');
    expect(a.value).toEqual(b.value);
    expect(a.value.allOk).toBe(true);
  });

  it('can be loaded back as a route', () => {
    const r = parseRoute(tcx);
    expect(r.ok && r.value.length).toBe(points.length);
  });
});
