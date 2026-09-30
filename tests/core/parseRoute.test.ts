import { describe, expect, it } from 'vitest';
import { parseGpxPoints, parseRoute } from '../../src/core/parseRoute.ts';

const gpx = (body: string, attrs = 'version="1.1" xmlns="http://www.topografix.com/GPX/1/1"') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<gpx ${attrs}>${body}</gpx>`;

function points(xml: string) {
  const r = parseRoute(xml);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('parseRoute', () => {
  it('reads trkpt with ele and ignores time', () => {
    const xml = gpx(
      `<trk><trkseg>
        <trkpt lat="50.1" lon="30.2"><ele>101.5</ele><time>2020-01-01T00:00:00Z</time></trkpt>
        <trkpt lon="30.3" lat="50.2"><ele>102</ele></trkpt>
      </trkseg></trk>`,
    );
    expect(points(xml)).toEqual([
      { lat: 50.1, lon: 30.2, ele: 101.5 },
      { lat: 50.2, lon: 30.3, ele: 102 },
    ]);
  });

  it('concatenates all segments and tracks in order', () => {
    const xml = gpx(
      `<trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg>
       <trkseg><trkpt lat="3" lon="3"/></trkseg></trk>
       <trk><trkseg><trkpt lat="4" lon="4"></trkpt></trkseg></trk>`,
    );
    expect(points(xml).map((p) => p.lat)).toEqual([1, 2, 3, 4]);
  });

  it('reads rtept when there are no track points', () => {
    const xml = gpx(
      `<rte><rtept lat='1.5' lon='2.5'/><rtept lat="3" lon="4"><ele>7</ele></rtept></rte>`,
    );
    expect(points(xml)).toEqual([
      { lat: 1.5, lon: 2.5 },
      { lat: 3, lon: 4, ele: 7 },
    ]);
  });

  it('prefers trkpt over rtept and ignores wpt', () => {
    const xml = gpx(
      `<wpt lat="9" lon="9"/><rte><rtept lat="8" lon="8"/></rte><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk>`,
    );
    expect(points(xml)).toEqual([{ lat: 1, lon: 1 }]);
  });

  it('handles namespace prefixes, BOM, comments, extensions and CDATA', () => {
    const xml =
      '﻿' +
      gpx(
        `<!-- <trkpt lat="0" lon="0"/> -->
         <gpx:trk><gpx:trkseg>
           <gpx:trkpt lat="1" lon="2"><gpx:ele><![CDATA[ 12.5 ]]></gpx:ele>
             <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
           </gpx:trkpt>
         </gpx:trkseg></gpx:trk>`,
        'xmlns:gpx="http://www.topografix.com/GPX/1/1"',
      );
    expect(points(xml)).toEqual([{ lat: 1, lon: 2, ele: 12.5 }]);
  });

  it('treats an unparseable ele as missing', () => {
    expect(
      points(gpx(`<trk><trkseg><trkpt lat="1" lon="2"><ele>n/a</ele></trkpt></trkseg></trk>`)),
    ).toEqual([{ lat: 1, lon: 2 }]);
  });

  it('keeps raw time text in parseGpxPoints', () => {
    const r = parseGpxPoints(
      gpx(
        `<trk><trkseg><trkpt lat="1" lon="2"><time>2026-09-30T15:18:29Z</time></trkpt></trkseg></trk>`,
      ),
    );
    expect(r.ok && r.value[0]?.time).toBe('2026-09-30T15:18:29Z');
  });

  it.each([
    ['not GPX', '<kml><Placemark/></kml>', /does not look like a GPX/],
    ['no points', gpx('<trk><trkseg></trkseg></trk>'), /no track or route points/],
    ['missing lon', gpx('<trk><trkseg><trkpt lat="1"/></trkseg></trk>'), /#1 .*lat\/lon/],
    [
      'bad lat',
      gpx('<trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="abc" lon="1"/></trkseg></trk>'),
      /#2/,
    ],
    ['out of range', gpx('<trk><trkseg><trkpt lat="91" lon="1"/></trkseg></trk>'), /#1/],
  ])('rejects %s', (_name, xml, message) => {
    const r = parseRoute(xml);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});
