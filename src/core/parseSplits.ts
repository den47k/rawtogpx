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

/** One `distance time`, time-only, or `rest time` entry as typed by the user. */
export interface SplitEntry {
  line: number;
  text: string;
  distanceM?: number;
  /** For rests and interval-block parts, a duration (in every mode). */
  timeS: number;
  rest?: boolean;
  /** Part of an interval block: distance and time are this part's own, in every mode. */
  block?: boolean;
  label?: string;
  recovery?: boolean;
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
const REST_RE = /^(rest|pause|break)$/i;
const RECOVERY_RE = /^(jog|rec|recovery|walk)$/i;
const REPEAT_RE = /^(\d+)x(.+)$/i;
const PACE_RE = /^(.+)\/(km|mi)$/i;
export const MAX_REPEATS = 100;

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
  | { kind: 'rest'; text: string }
  | { kind: 'recovery'; walk: boolean; text: string }
  | { kind: 'repeat'; count: number; metres: number; text: string }
  | { kind: 'pace'; secondsPerMetre: number; text: string }
  | { kind: 'bad'; text: string };

function classify(text: string): Token {
  if (REST_RE.test(text)) return { kind: 'rest', text };
  if (RECOVERY_RE.test(text)) return { kind: 'recovery', walk: /^walk$/i.test(text), text };
  const repeat = REPEAT_RE.exec(text);
  if (repeat) {
    const metres = parseDistance(repeat[2]!);
    return metres === undefined
      ? { kind: 'bad', text }
      : { kind: 'repeat', count: Number(repeat[1]), metres, text };
  }
  const pace = PACE_RE.exec(text);
  if (pace) {
    const seconds = parseTime(pace[1]!);
    const per = pace[2]!.toLowerCase() === 'mi' ? METRES_PER_MILE : 1000;
    return seconds === undefined
      ? { kind: 'bad', text }
      : { kind: 'pace', secondsPerMetre: seconds / per, text };
  }
  if (NUMBER_RE.test(text)) return { kind: 'number', value: Number(text), text };
  if (text.includes(':')) {
    const seconds = parseTime(text);
    return seconds === undefined ? { kind: 'bad', text } : { kind: 'time', seconds, text };
  }
  const metres = parseDistance(text);
  if (metres !== undefined) return { kind: 'distance', metres, text };
  return { kind: 'bad', text };
}

/**
 * Split a line into raw tokens, joining `1 km` into `1km` and `6 x 400` into `6x400`, and
 * dropping filler like `-`, `=`, `@`.
 */
function tokenize(entry: string): string[] {
  const raw = entry
    .replace(/[–—]/g, '-')
    .replace(/(\d)\s*[x×]\s*(?=[\d.])/gi, '$1x')
    .split(/[\s=@]+/)
    .map((t) => t.replace(/:$/, ''))
    .filter((t) => t !== '' && t !== '-');
  const out: string[] = [];
  for (const t of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && UNIT_RE.test(t) && /^(\d+x)?(\d+(\.\d+)?|\.\d+)$/i.test(prev))
      out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}

type TimeLike = Extract<Token, { kind: 'time' | 'number' | 'pace' }>;
const isTimeLike = (t: Token | undefined): t is TimeLike =>
  t !== undefined && (t.kind === 'time' || t.kind === 'number' || t.kind === 'pace');
/** Seconds for covering `metres`: a time, bare seconds, or a pace. */
const secondsFor = (t: TimeLike, metres: number): number =>
  t.kind === 'pace' ? t.secondsPerMetre * metres : t.kind === 'time' ? t.seconds : t.value;

/**
 * An interval block starting at `tokens[0]` (a repeat token), e.g.
 * `6x400 @1:20 jog 200m 1:00`, `6x400 1:21 1:20 ... rest 1:30`, `5x1k @3:30/km`.
 * Expands to one entry per rep and per recovery. Returns null after pushing an error.
 */
function readBlock(
  tokens: Token[],
  line: number,
  text: string,
  errors: SplitError[],
): { entries: SplitEntry[]; used: number } | null {
  const head = tokens[0] as Extract<Token, { kind: 'repeat' }>;
  const { count, metres } = head;
  const fail = (message: string) => {
    errors.push({ line, message });
    return null;
  };
  if (count < 1 || count > MAX_REPEATS) return fail(`Repeat count must be 1–${MAX_REPEATS}.`);

  let i = 1;
  const takeTimes = (): TimeLike[] => {
    const out: TimeLike[] = [];
    while (isTimeLike(tokens[i])) out.push(tokens[i++] as TimeLike);
    return out;
  };

  const repTimes = takeTimes();
  if (repTimes.length === 0) {
    return fail(`"${head.text}" needs a time per rep, e.g. "${head.text} @1:20".`);
  }
  if (repTimes.length !== 1 && repTimes.length !== count) {
    return fail(`${count} reps but ${repTimes.length} rep times (give one, or one per rep).`);
  }

  // Optional recovery between reps: standing ("rest 1:30") or moving ("jog 200m 1:00").
  let recovery: { kind: 'rest' | 'move'; walk: boolean; metres: number; times: TimeLike[] } | null =
    null;
  const r = tokens[i];
  if (r?.kind === 'rest' || r?.kind === 'recovery') {
    i++;
    let recMetres = 0;
    if (r.kind === 'recovery') {
      const d = tokens[i];
      const bareDistance = d?.kind === 'number' && isTimeLike(tokens[i + 1]);
      if (d?.kind !== 'distance' && !bareDistance) {
        return fail(`"${r.text}" needs a distance and time, e.g. "${r.text} 200m 1:00".`);
      }
      recMetres = d.kind === 'distance' ? d.metres : d.kind === 'number' ? d.value : 0;
      i++;
    }
    const times = takeTimes();
    if (times.length === 0) {
      return fail(
        r.kind === 'rest'
          ? `"${r.text}" needs a duration, e.g. "rest 1:30".`
          : `"${r.text}" needs a time, e.g. "${r.text} ${recMetres}m 1:00".`,
      );
    }
    if (times.length !== 1 && times.length !== count - 1 && times.length !== count) {
      return fail(
        `${count} reps but ${times.length} recovery times (give one, or one per recovery).`,
      );
    }
    recovery = {
      kind: r.kind === 'rest' ? 'rest' : 'move',
      walk: r.kind === 'recovery' && r.walk,
      metres: recMetres,
      times,
    };
  }

  const entries: SplitEntry[] = [];
  const recoveries = recovery ? (recovery.times.length === count ? count : count - 1) : 0;
  for (let k = 0; k < count; k++) {
    const repTime = repTimes[repTimes.length === 1 ? 0 : k]!;
    entries.push({
      line,
      text,
      distanceM: metres,
      timeS: secondsFor(repTime, metres),
      block: true,
      label: `Rep ${k + 1}/${count}`,
    });
    if (recovery && k < recoveries) {
      const t = recovery.times[recovery.times.length === 1 ? 0 : k]!;
      if (recovery.kind === 'rest') {
        entries.push({ line, text, timeS: secondsFor(t, 0), rest: true });
      } else {
        entries.push({
          line,
          text,
          distanceM: recovery.metres,
          timeS: secondsFor(t, recovery.metres),
          block: true,
          recovery: true,
          label: recovery.walk ? 'Walk' : 'Recovery',
        });
      }
    }
  }
  return { entries, used: i };
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
    if (t.kind === 'repeat') {
      const block = readBlock(tokens.slice(i), chunk.line, chunk.text, errors);
      if (!block) return [];
      entries.push(...block.entries);
      i += block.used;
      continue;
    }
    if (t.kind === 'pace' || t.kind === 'recovery') {
      errors.push({
        line: chunk.line,
        message:
          t.kind === 'pace'
            ? `A pace like "${t.text}" only works in an interval block, e.g. "5x1k @${t.text}".`
            : `"${t.text}" only works after reps, e.g. "6x400 @1:20 ${t.text} 200m 1:00".`,
      });
      return [];
    }
    const nextIsTime = next !== undefined && (next.kind === 'time' || next.kind === 'number');
    if (t.kind === 'rest') {
      if (!nextIsTime) {
        errors.push({
          line: chunk.line,
          message: `"${t.text}" needs a duration, e.g. "rest 1:30".`,
        });
        return [];
      }
      // A bare number after "rest" is always seconds.
      const seconds = next.kind === 'time' ? next.seconds : next.kind === 'number' ? next.value : 0;
      entries.push({
        line: chunk.line,
        text: `${t.text} ${next.text}`,
        timeS: seconds,
        rest: true,
      });
      i += 2;
      continue;
    }
    const isDistance =
      t.kind === 'distance' || (t.kind === 'number' && !bareNumbersAreTimes && nextIsTime);
    if (isDistance) {
      if (next?.kind === 'pace') {
        errors.push({
          line: chunk.line,
          message: `A pace like "${next.text}" only works in an interval block, e.g. "5x1k @${next.text}"; give "${t.text}" a time instead.`,
        });
        return [];
      }
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
    if (e.block) {
      // Interval-block parts carry their own distance and time in every mode.
      const partD = e.distanceM ?? 0;
      if (partD <= EPS) errors.push({ line: e.line, message: `Distance can't be zero.` });
      if (e.timeS <= EPS) errors.push({ line: e.line, message: `Time can't be zero.` });
      const split: Split = { distanceM: prevD + partD, timeS: prevT + e.timeS };
      if (e.label !== undefined) split.label = e.label;
      if (e.recovery) split.recovery = true;
      splits.push(split);
      prevD += partD;
      prevT += e.timeS;
      continue;
    }
    if (e.rest) {
      // Same in both modes: hold position for the given duration. In cumulative mode the
      // times after a rest are elapsed clock time, so they include it.
      if (e.timeS <= EPS) errors.push({ line: e.line, message: `Rest time can't be zero.` });
      splits.push({ distanceM: prevD, timeS: prevT + e.timeS, rest: true });
      prevT += e.timeS;
      continue;
    }
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

  if (errors.length === 0 && entries.length > 0 && splits.every((s) => s.rest)) {
    errors.push({ line: null, message: 'Enter at least one split with a distance.' });
  }

  errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { splits: errors.length > 0 ? [] : splits, entries, errors };
}

/**
 * Guess the mode from the text: cumulative if every entry has a distance and both distance
 * and time increase; laps if entries have no or equal distances and similar times.
 */
export function guessSplitMode(text: string): SplitMode | null {
  const read = readSplitEntries(text);
  const entries = read.entries.filter((e) => !e.rest && !e.block);
  if (read.errors.length > 0 || entries.length === 0) return null;
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
