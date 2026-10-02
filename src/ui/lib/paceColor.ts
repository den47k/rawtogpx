// Diverging pace scale: faster than average -> blue, average -> neutral gray, slower ->
// orange (the design's hues). The midpoint is darker than the design's light gray so it
// stays visible on map tiles; all three clear 3:1 contrast on light tiles and the dark map.
// Interpolated in OKLab so the arms stay even.

export const PACE_FAST = '#2d78bd';
export const PACE_MID = '#80878d';
export const PACE_SLOW = '#de602f';

type Lab = [number, number, number];

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function hexToOklab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => toLinear(v / 255)) as [
    number,
    number,
    number,
  ];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, bb]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

const FAST = hexToOklab(PACE_FAST);
const MID = hexToOklab(PACE_MID);
const SLOW = hexToOklab(PACE_SLOW);

/** `t` in [-1, 1]: -1 fastest (blue), 0 average (gray), 1 slowest (red). */
export function divergingColor(t: number): string {
  const x = Math.min(1, Math.max(-1, t));
  const end = x < 0 ? FAST : SLOW;
  const f = Math.abs(x);
  return oklabToHex([0, 1, 2].map((i) => MID[i]! + (end[i]! - MID[i]!) * f) as Lab);
}

export interface PaceScale {
  averageSPerKm: number;
  fastestSPerKm: number;
  slowestSPerKm: number;
  color: (paceSPerKm: number) => string;
}

/**
 * Symmetric scale around the average pace (total time / total distance), so equal
 * deviations get equal colour strength on both arms.
 */
export function paceScale(paces: number[], averageSPerKm: number): PaceScale {
  const finite = paces.filter(Number.isFinite);
  const spread = Math.max(0, ...finite.map((p) => Math.abs(p - averageSPerKm)));
  return {
    averageSPerKm,
    fastestSPerKm: Math.min(...finite),
    slowestSPerKm: Math.max(...finite),
    color: (p) => (spread < 0.5 ? PACE_MID : divergingColor((p - averageSPerKm) / spread)),
  };
}
