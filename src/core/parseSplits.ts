import { formatDistance, formatDuration } from './format.ts';
import type { Split } from './types.ts';

export type SplitMode = 'cumulative' | 'laps';

export const METRES_PER_MILE = 1609.344;

export interface ParseSplitsOptions {
  mode: SplitMode;
  /**
   * Laps mode only: uniform lap distance in metres. When set, entries may be just a time,
   * and bare numbers are always read as seconds (distances need a unit, e.g. `1.37k`).
   */
  lapDistanceM?: number | undefined;
}

export interface SplitError {
  /** 1-based line number in the input, or null for whole-input errors. */
  line: number | null;
  message: string;
}

/** One `distance time` (or time-only) entry as typed by the user. */
export interface SplitEntry {
  line: number;
  text: string;
  distanceM?: number;
  timeS: number;
}

export interface ParsedSplits {
  /** Cumulative splits; empty if there are any errors. */
  splits: Split[];
  entries: SplitEntry[];
  errors: SplitError[];
}

// ---------- tokens ----------

const DISTANCE_RE = /^(\d+(?:\.\d+)?|\.\d+)\s*(k|km|m|mi)?$/i;
const UNIT_RE = /^(k|km|m|mi)$/i;
const NUMBER_RE = /^(\d+(?:\.\d+)?|\.\d+)$/;
const UNIT_METRES: Record<string, number> = { k: 1000, km: 1000, m: 1, mi: METRES_PER_MILE };

/** `1k`, `1km`, `5.37k`, `400m`, `800` (metres), `0.5mi`. Returns metres. */
export function parseDistance(token: string): number | undefined {
  const m = DISTANCE_RE.exec(token.trim());
  if (!m) return undefined;
  const unit = (m[2] ?? 'm').toLowerCase();
  return Number(m[1]) * UNIT_METRES[unit]!;
}

/** `ss`, `m:ss`, `mm:ss`, `h:mm:ss`, each with optional fractional seconds. Returns seconds. */
export function parseTime(token: string): number | undefined {
  const parts = token.trim().split(':');
  if (parts.length > 3) return undefined;
  const last = parts[parts.length - 1]!;
  if (!/^(\d+(?:\.\d+)?|\.\d+)$/.test(last)) return undefined;
  const secs = Number(last);
  if (parts.length === 1) return secs;
  // Seconds (and minutes, when hours are given) must be two digits below 60.
  if (!/^\d\d(\.\d+)?$/.test(last) || secs >= 60) return undefined;
  const head = parts.slice(0, -1);
  if (!head.every((p) => /^\d+$/.test(p))) return undefined;
  if (head.length === 2) {
    const [h, m] = head.map(Number) as [number, number];
    if (head[1]!.length !== 2 || m >= 60) return undefined;
    return h * 3600 + m * 60 + secs;
  }
  return Number(head[0]) * 60 + secs;
}

type Token =
  | { kind: 'distance'; metres: number; text: string }
  | { kind: 'time'; seconds: number; text: string }
  | { kind: 'number'; value: number; text: string }
  | { kind: 'bad'; text: string };

function classify(text: string): Token {
  if (NUMBER_RE.test(text)) return { kind: 'number', value: Number(text), text };
  if (text.includes(':')) {
    const seconds = parseTime(text);
    return seconds === undefined ? { kind: 'bad', text } : { kind: 'time', seconds, text };
  }
  const metres = parseDistance(text);
  if (metres !== undefined) return { kind: 'distance', metres, text };
  return { kind: 'bad', text };
}

/** Split a line into raw tokens, joining `1 km` into `1km` and dropping filler like `-`, `=`, `@`. */
function tokenize(entry: string): string[] {
  const raw = entry
    .replace(/[–—]/g, '-')
    .split(/[\s=@]+/)
    .map((t) => t.replace(/:$/, ''))
    .filter((t) => t !== '' && t !== '-');
  const out: string[] = [];
  for (const t of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && UNIT_RE.test(t) && NUMBER_RE.test(prev))
      out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}

/** Entries are separated by newlines, commas, semicolons, or ` / `. */
function splitEntries(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  text.split(/\r\n|\r|\n/).forEach((lineText, i) => {
    for (const part of lineText.split(/[,;]|\s\/\s/)) {
      const trimmed = part.trim();
      if (trimmed !== '') out.push({ line: i + 1, text: trimmed });
    }
  });
  return out;
}

/**
 * Read entries from one separator-delimited chunk. A chunk may hold several entries
 * separated by spaces (`6:10 6:09 5:54` or `1k 6:10 2k 12:19`).
 */
function readEntries(
  chunk: { line: number; text: string },
  bareNumbersAreTimes: boolean,
  errors: SplitError[],
): SplitEntry[] {
  const tokens = tokenize(chunk.text).map(classify);
  const bad = tokens.find((t) => t.kind === 'bad');
  if (bad) {
    errors.push({ line: chunk.line, message: `Can't read "${bad.text}".` });
    return [];
  }
  const entries: SplitEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    const nextIsTime = next !== undefined && (next.kind === 'time' || next.kind === 'number');
    const isDistance =
      t.kind === 'distance' || (t.kind === 'number' && !bareNumbersAreTimes && nextIsTime);
    if (isDistance) {
      if (!nextIsTime) {
        errors.push({ line: chunk.line, message: `Distance "${t.text}" has no time after it.` });
        return [];
      }
      const metres = t.kind === 'distance' ? t.metres : t.kind === 'number' ? t.value : 0;
      const seconds = next.kind === 'time' ? next.seconds : next.kind === 'number' ? next.value : 0;
      entries.push({
        line: chunk.line,
        text: `${t.text} ${next.text}`,
        distanceM: metres,
        timeS: seconds,
      });
      i += 2;
    } else {
      const seconds = t.kind === 'time' ? t.seconds : t.kind === 'number' ? t.value : 0;
      entries.push({ line: chunk.line, text: t.text, timeS: seconds });
      i += 1;
    }
  }
  return entries;
}

/** Tokenize the whole input into entries without applying a mode. */
export function readSplitEntries(
  text: string,
  bareNumbersAreTimes = false,
): { entries: SplitEntry[]; errors: SplitError[] } {
  const errors: SplitError[] = [];
  const entries = splitEntries(text).flatMap((c) => readEntries(c, bareNumbersAreTimes, errors));
  return { entries, errors };
}

const EPS = 1e-9;

/** Parse free-text splits into cumulative splits, validating per line. */
export function parseSplits(text: string, options: ParseSplitsOptions): ParsedSplits {
  const lap = options.mode === 'laps' ? options.lapDistanceM : undefined;
  const hasLap = lap !== undefined && Number.isFinite(lap) && lap > 0;
  const { entries, errors } = readSplitEntries(text, hasLap);

  if (options.mode === 'laps' && lap !== undefined && !hasLap) {
    errors.push({ line: null, message: 'Lap distance must be greater than zero.' });
  }
  if (entries.length === 0 && errors.length === 0) {
    errors.push({ line: null, message: 'Enter at least one split.' });
  }

  const splits: Split[] = [];
  let prevD = 0;
  let prevT = 0;
  for (const e of entries) {
    let d: number;
    let t: number;
    if (options.mode === 'cumulative') {
      if (e.distanceM === undefined) {
        errors.push({
          line: e.line,
          message: `"${e.text}" needs a distance (e.g. "1k ${e.text}").`,
        });
        continue;
      }
      d = e.distanceM;
      t = e.timeS;
      if (d <= EPS) {
        errors.push({ line: e.line, message: `Distance can't be zero.` });
      } else if (Math.abs(d - prevD) <= EPS) {
        errors.push({
          line: e.line,
          message: `Zero-length split: same distance as the previous one.`,
        });
      } else if (d < prevD) {
        errors.push({
          line: e.line,
          message: `Distance must increase (previous: ${formatDistance(prevD)}).`,
        });
      }
      if (t <= prevT + EPS) {
        errors.push({
          line: e.line,
          message:
            t <= EPS
              ? `Time can't be zero.`
              : `Time must increase (previous: ${formatDuration(prevT)}).`,
        });
      }
    } else {
      const lapD = e.distanceM ?? (hasLap ? lap : undefined);
      if (lapD === undefined) {
        errors.push({
          line: e.line,
          message: `"${e.text}" needs a distance, or set a lap distance.`,
        });
        continue;
      }
      if (lapD <= EPS) errors.push({ line: e.line, message: `Lap distance can't be zero.` });
      if (e.timeS <= EPS) errors.push({ line: e.line, message: `Lap time can't be zero.` });
      d = prevD + lapD;
      t = prevT + e.timeS;
    }
    splits.push({ distanceM: d, timeS: t });
    prevD = Math.max(prevD, d);
    prevT = Math.max(prevT, t);
  }

  errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { splits: errors.length > 0 ? [] : splits, entries, errors };
}

/**
 * Guess the mode from the text: cumulative if every entry has a distance and both distance
 * and time increase; laps if entries have no or equal distances and similar times.
 */
export function guessSplitMode(text: string): SplitMode | null {
  const { entries, errors } = readSplitEntries(text);
  if (errors.length > 0 || entries.length === 0) return null;
  if (entries.length === 1) return entries[0]!.distanceM === undefined ? 'laps' : null;

  const allHaveDistance = entries.every((e) => e.distanceM !== undefined);
  const increasing = entries.every(
    (e, i) =>
      i === 0 ||
      (e.distanceM! > entries[i - 1]!.distanceM! + EPS && e.timeS > entries[i - 1]!.timeS + EPS),
  );
  if (allHaveDistance && increasing) return 'cumulative';

  // All but the last entry must share a distance (a final partial lap is allowed).
  const distances = entries.map((e) => e.distanceM).slice(0, -1);
  const sameDistance = distances.every(
    (d) => d === undefined || (distances[0] !== undefined && Math.abs(d - distances[0]) < EPS),
  );
  const times = entries.map((e) => e.timeS);
  const similar = Math.max(...times) <= 2 * Math.min(...times);
  return sameDistance && similar ? 'laps' : null;
}
