import { haversine } from './geo.ts';
import { escapeXml, isoTime } from './serializeGpx.ts';
import type { Split, TimedPoint } from './types.ts';

export interface TcxOptions {
  /** Activity start, epoch ms; split times are relative to it. */
  startMs: number;
  /** Written to the activity's <Notes>. */
  name: string;
}

const n = (x: number, dp: number): string => String(+x.toFixed(dp));

/**
 * TCX with one <Lap> per split (Strava reads laps from TCX but not GPX). Rests become
 * laps with zero distance and `Resting` intensity. `splits` are the cumulative splits as
 * placed on the route, so lap distances match the track geometry.
 */
export function serializeTcx(points: TimedPoint[], splits: Split[], options: TcxOptions): string {
  const { startMs } = options;

  // Cumulative distance along the output track, written on every trackpoint.
  const cum: number[] = [];
  points.forEach((p, i) => cum.push(i === 0 ? 0 : cum[i - 1]! + haversine(points[i - 1]!, p)));

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 ' +
      'http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">',
    ' <Activities>',
    '  <Activity Sport="Running">',
    `   <Id>${isoTime(startMs)}</Id>`,
  ];

  // Each point goes to the lap whose time window (prev boundary, boundary] contains it;
  // the very first point opens lap 1.
  let pi = 0;
  let prev = { distanceM: 0, timeS: 0 };
  for (const s of splits) {
    const lapStartMs = startMs + Math.round(prev.timeS * 1000);
    const lapEndMs = startMs + Math.round(s.timeS * 1000);
    lines.push(
      `   <Lap StartTime="${isoTime(lapStartMs)}">`,
      `    <TotalTimeSeconds>${n(s.timeS - prev.timeS, 3)}</TotalTimeSeconds>`,
      `    <DistanceMeters>${n(s.distanceM - prev.distanceM, 2)}</DistanceMeters>`,
      '    <Calories>0</Calories>',
      `    <Intensity>${s.rest || s.recovery ? 'Resting' : 'Active'}</Intensity>`,
      '    <TriggerMethod>Manual</TriggerMethod>',
    );
    const track: string[] = [];
    while (pi < points.length && points[pi]!.timeMs <= lapEndMs) {
      const p = points[pi]!;
      const alt = p.ele === undefined ? '' : `<AltitudeMeters>${p.ele.toFixed(1)}</AltitudeMeters>`;
      track.push(
        `     <Trackpoint><Time>${isoTime(p.timeMs)}</Time>` +
          `<Position><LatitudeDegrees>${p.lat.toFixed(7)}</LatitudeDegrees>` +
          `<LongitudeDegrees>${p.lon.toFixed(7)}</LongitudeDegrees></Position>` +
          `${alt}<DistanceMeters>${cum[pi]!.toFixed(2)}</DistanceMeters></Trackpoint>`,
      );
      pi++;
    }
    // The schema needs at least one trackpoint per <Track>.
    if (track.length > 0) lines.push('    <Track>', ...track, '    </Track>');
    lines.push('   </Lap>');
    prev = s;
  }

  lines.push(
    `   <Notes>${escapeXml(options.name)}</Notes>`,
    '  </Activity>',
    ' </Activities>',
    '</TrainingCenterDatabase>',
    '',
  );
  return lines.join('\n');
}
