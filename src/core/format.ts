/** Human-readable formatting shared by error messages and the UI. */

/** Seconds -> `m:ss` or `h:mm:ss`, with `decimals` fractional digits on the seconds. */
export function formatDuration(totalS: number, decimals = 0): string {
  const sign = totalS < 0 ? '-' : '';
  const scale = 10 ** decimals;
  const rounded = Math.round(Math.abs(totalS) * scale) / scale;
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded - h * 3600 - m * 60;
  const ss = s.toFixed(decimals).padStart(decimals > 0 ? decimals + 3 : 2, '0');
  return h > 0 ? `${sign}${h}:${String(m).padStart(2, '0')}:${ss}` : `${sign}${m}:${ss}`;
}

/** Metres -> `1.37 km` or `400 m`; `kmDecimals` caps the digits after the point for km. */
export function formatDistance(m: number, kmDecimals = 2): string {
  return m >= 1000 ? `${+(m / 1000).toFixed(kmDecimals)} km` : `${+m.toFixed(1)} m`;
}

/** Seconds per km -> `6:10 /km`. */
export function formatPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '–';
  return `${formatDuration(secondsPerKm)} /km`;
}
