import type { SplitMode } from '../../core/parseSplits.ts';
import type { OutputFormat } from '../../core/pipeline.ts';
import { TRACK_LENGTHS, type TrackLength } from '../../core/track.ts';
import type { AnchorKind, MismatchMode } from '../../core/types.ts';

/** Preferences remembered between visits. Never route data, track location, or splits. */
export interface Settings {
  /** `auto` until the user picks a mode. */
  splitMode: SplitMode | 'auto';
  anchorKind: AnchorKind;
  lapText: string;
  mismatch: MismatchMode;
  sampleIntervalS: number;
  format: OutputFormat;
  routeSource: RouteSource;
  trackLengthM: TrackLength;
}

/** Where the route comes from: an uploaded file or a generated running track. */
export type RouteSource = 'file' | 'track';

export const DEFAULT_SETTINGS: Settings = {
  splitMode: 'auto',
  anchorKind: 'finish',
  lapText: '',
  mismatch: 'scale',
  sampleIntervalS: 1,
  format: 'gpx',
  routeSource: 'file',
  trackLengthM: 400,
};

export const SAMPLE_INTERVAL_MIN_S = 0.1;
export const SAMPLE_INTERVAL_MAX_S = 60;

const KEY = 'gpx-rebuilder:settings:v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

export function isValidSampleInterval(s: number): boolean {
  return Number.isFinite(s) && s >= SAMPLE_INTERVAL_MIN_S && s <= SAMPLE_INTERVAL_MAX_S;
}

/** Read settings, ignoring anything missing, malformed, or from an older shape. */
export function loadSettings(storage: StorageLike | undefined): Settings {
  let raw: unknown;
  try {
    raw = JSON.parse(storage?.getItem(KEY) ?? 'null');
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    splitMode: oneOf(r.splitMode, ['auto', 'cumulative', 'laps'] as const, d.splitMode),
    anchorKind: oneOf(r.anchorKind, ['start', 'finish'] as const, d.anchorKind),
    lapText: typeof r.lapText === 'string' ? r.lapText.slice(0, 20) : d.lapText,
    mismatch: oneOf(r.mismatch, ['scale', 'trim'] as const, d.mismatch),
    sampleIntervalS:
      typeof r.sampleIntervalS === 'number' && isValidSampleInterval(r.sampleIntervalS)
        ? r.sampleIntervalS
        : d.sampleIntervalS,
    format: oneOf(r.format, ['gpx', 'tcx'] as const, d.format),
    routeSource: oneOf(r.routeSource, ['file', 'track'] as const, d.routeSource),
    trackLengthM: TRACK_LENGTHS.includes(r.trackLengthM as TrackLength)
      ? (r.trackLengthM as TrackLength)
      : d.trackLengthM,
  };
}

export function saveSettings(storage: StorageLike | undefined, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or quota: settings just won't persist.
  }
}

/** `window.localStorage`, or undefined where even touching it throws. */
export function browserStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
