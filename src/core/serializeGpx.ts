import type { TimedPoint } from './types.ts';

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]!};`,
  );
}

/** UTC ISO 8601, with milliseconds only when non-zero: `2026-09-30T15:18:29Z`. */
export function isoTime(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export interface GpxOptions {
  name: string;
  /** Strava activity type. */
  type?: string;
}

export function serializeGpx(points: TimedPoint[], options: GpxOptions): string {
  const first = points[0];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx creator="GPX Rebuilder" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
  ];
  if (first) lines.push(` <metadata><time>${isoTime(first.timeMs)}</time></metadata>`);
  lines.push(
    ' <trk>',
    `  <name>${escapeXml(options.name)}</name>`,
    `  <type>${escapeXml(options.type ?? 'running')}</type>`,
    '  <trkseg>',
  );
  for (const p of points) {
    const ele = p.ele === undefined ? '' : `<ele>${p.ele.toFixed(1)}</ele>`;
    lines.push(
      `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${isoTime(p.timeMs)}</time></trkpt>`,
    );
  }
  lines.push('  </trkseg>', ' </trk>', '</gpx>', '');
  return lines.join('\n');
}

interface LocalParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

/** Wall-clock parts of `ms` in `timeZone` (defaults to the runtime's zone). */
export function localParts(ms: number, timeZone?: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    year: parts.year ?? '',
    month: parts.month ?? '',
    day: parts.day ?? '',
    hour: parts.hour ?? '',
    minute: parts.minute ?? '',
  };
}

/** "Morning Run" etc. from the local start hour: 05–11, 12–16, 17–20, else Night. */
export function defaultActivityName(startMs: number, timeZone?: string): string {
  const hour = Number(localParts(startMs, timeZone).hour);
  if (hour >= 5 && hour <= 11) return 'Morning Run';
  if (hour >= 12 && hour <= 16) return 'Afternoon Run';
  if (hour >= 17 && hour <= 20) return 'Evening Run';
  return 'Night Run';
}

/** `run_YYYY-MM-DD_HHmm.gpx` in local time. */
export function defaultFilename(startMs: number, ext = 'gpx', timeZone?: string): string {
  const p = localParts(startMs, timeZone);
  return `run_${p.year}-${p.month}-${p.day}_${p.hour}${p.minute}.${ext}`;
}
