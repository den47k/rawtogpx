import { err, ok, type Result, type RoutePoint } from './types.ts';

/** A point as read from a GPX file, with its raw `<time>` text if present. */
export interface GpxPoint extends RoutePoint {
  time?: string;
}

// A deliberately small string-based reader: it only needs <trkpt>/<rtept> with lat/lon
// attributes and optional <ele>/<time> children, and it runs unchanged in Node and the browser.
const NS = '(?:[A-Za-z_][\\w.-]*:)?';
const POINT_RE = new RegExp(
  `<${NS}(trkpt|rtept)\\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:/>|>([\\s\\S]*?)</${NS}\\1\\s*>)`,
  'g',
);
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const childRe = (name: string): RegExp =>
  new RegExp(`<${NS}${name}\\b[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</`);
const ELE_RE = childRe('ele');
const TIME_RE = childRe('time');

function attributes(src: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of src.matchAll(ATTR_RE)) {
    const name = m[1]!.replace(/^.*:/, '').toLowerCase();
    attrs.set(name, (m[2] ?? m[3] ?? '').trim());
  }
  return attrs;
}

function childText(body: string | undefined, re: RegExp): string | undefined {
  if (body === undefined) return undefined;
  const m = re.exec(body);
  if (!m) return undefined;
  const text = (m[1] ?? m[2] ?? '').trim();
  return text === '' ? undefined : text;
}

/** Strict decimal parse: rejects '', '12abc', 'NaN'. */
function parseNumber(s: string | undefined): number | undefined {
  if (s === undefined || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Read all track points from a GPX document, in document order (every <trkseg> of every
 * <trk>, concatenated). Falls back to <rtept> if the file has no track points.
 */
export function parseGpxPoints(xml: string): Result<GpxPoint[]> {
  const text = xml.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (!/<(?:[A-Za-z_][\w.-]*:)?gpx\b/.test(text)) {
    return err('This does not look like a GPX file (no <gpx> element).');
  }

  const byKind: Record<'trkpt' | 'rtept', GpxPoint[]> = { trkpt: [], rtept: [] };
  let index = 0;
  for (const m of text.matchAll(POINT_RE)) {
    index++;
    const kind = m[1] as 'trkpt' | 'rtept';
    const attrs = attributes(m[2] ?? '');
    const lat = parseNumber(attrs.get('lat'));
    const lon = parseNumber(attrs.get('lon'));
    if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return err(`Point #${index} has a missing or invalid lat/lon.`);
    }
    const point: GpxPoint = { lat, lon };
    const ele = parseNumber(childText(m[3], ELE_RE));
    if (ele !== undefined) point.ele = ele;
    const time = childText(m[3], TIME_RE);
    if (time !== undefined) point.time = time;
    byKind[kind].push(point);
  }

  const points = byKind.trkpt.length > 0 ? byKind.trkpt : byKind.rtept;
  if (points.length === 0) return err('The GPX file has no track or route points.');
  return ok(points);
}

/** GPX string -> route points. Any existing timestamps are ignored. */
export function parseRoute(xml: string): Result<RoutePoint[]> {
  const parsed = parseGpxPoints(xml);
  if (!parsed.ok) return parsed;
  return ok(
    parsed.value.map(({ lat, lon, ele }) => (ele === undefined ? { lat, lon } : { lat, lon, ele })),
  );
}
