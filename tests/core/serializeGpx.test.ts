import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import {
  defaultActivityName,
  defaultFilename,
  escapeXml,
  isoTime,
  serializeGpx,
} from '../../src/core/serializeGpx.ts';
import type { TimedPoint } from '../../src/core/types.ts';

const GPX_NS = 'http://www.topografix.com/GPX/1/1';
const T0 = Date.parse('2026-09-30T15:18:29Z');

const points: TimedPoint[] = [
  { lat: 50.43509, lon: 30.609160000000003, ele: 101.96000000000001, timeMs: T0 },
  { lat: 50.435, lon: 30.60916, ele: 102.08, timeMs: T0 + 1234 },
];

describe('serializeGpx', () => {
  const xml = serializeGpx(points, { name: 'Tom & Jerry <"fast"> Run' });

  it('produces well-formed GPX 1.1', () => {
    const errors: string[] = [];
    const doc = new DOMParser({ onError: (_level, msg) => errors.push(msg) }).parseFromString(
      xml,
      'text/xml',
    );
    expect(errors).toEqual([]);
    const root = doc.documentElement!;
    expect(root.localName).toBe('gpx');
    expect(root.namespaceURI).toBe(GPX_NS);
    expect(root.getAttribute('version')).toBe('1.1');
    expect(root.getAttribute('creator')).toBe('GPX Rebuilder');
    const trkpts = doc.getElementsByTagNameNS(GPX_NS, 'trkpt');
    expect(trkpts.length).toBe(2);
    const name = doc.getElementsByTagNameNS(GPX_NS, 'name')[0]!;
    expect(name.textContent).toBe('Tom & Jerry <"fast"> Run');
  });

  it('formats coordinates, elevation and time', () => {
    expect(xml).toContain('<metadata><time>2026-09-30T15:18:29Z</time></metadata>');
    expect(xml).toContain(
      '<trkpt lat="50.4350900" lon="30.6091600"><ele>102.0</ele><time>2026-09-30T15:18:29Z</time></trkpt>',
    );
    expect(xml).toContain('<time>2026-09-30T15:18:30.234Z</time>');
    expect(xml).toContain('<type>running</type>');
  });

  it('omits <ele> when points have none', () => {
    const out = serializeGpx([{ lat: 1, lon: 2, timeMs: T0 }], { name: 'x' });
    expect(out).not.toContain('<ele>');
  });
});

describe('helpers', () => {
  it('escapes XML', () => {
    expect(escapeXml(`a<b>&'"`)).toBe('a&lt;b&gt;&amp;&apos;&quot;');
  });

  it('drops zero milliseconds from ISO times', () => {
    expect(isoTime(T0)).toBe('2026-09-30T15:18:29Z');
    expect(isoTime(T0 + 5)).toBe('2026-09-30T15:18:29.005Z');
  });

  it.each([
    ['2026-09-30T05:00:00+03:00', 'Morning Run'],
    ['2026-09-30T11:59:00+03:00', 'Morning Run'],
    ['2026-09-30T12:00:00+03:00', 'Afternoon Run'],
    ['2026-09-30T16:59:00+03:00', 'Afternoon Run'],
    ['2026-09-30T17:00:00+03:00', 'Evening Run'],
    ['2026-09-30T18:18:29+03:00', 'Evening Run'],
    ['2026-09-30T20:59:00+03:00', 'Evening Run'],
    ['2026-09-30T21:00:00+03:00', 'Night Run'],
    ['2026-09-30T00:30:00+03:00', 'Night Run'],
    ['2026-09-30T04:59:00+03:00', 'Night Run'],
  ])('names a run starting at %s "%s" (Kyiv)', (iso, name) => {
    expect(defaultActivityName(Date.parse(iso), 'Europe/Kyiv')).toBe(name);
  });

  it('builds the default filename in local time', () => {
    expect(defaultFilename(T0, 'gpx', 'Europe/Kyiv')).toBe('run_2026-09-30_1818.gpx');
    expect(defaultFilename(T0, 'gpx', 'UTC')).toBe('run_2026-09-30_1518.gpx');
    expect(defaultFilename(Date.parse('2026-12-31T22:30:00Z'), 'tcx', 'Europe/Kyiv')).toBe(
      'run_2027-01-01_0030.tcx',
    );
  });
});
