import { parseSplits, type ParsedSplits, type SplitMode } from './parseSplits.ts';
import { rebuild, type RebuildResult } from './rebuild.ts';
import { defaultActivityName, defaultFilename, serializeGpx } from './serializeGpx.ts';
import { serializeTcx } from './serializeTcx.ts';
import type { AnchorKind, MismatchMode, PreparedRoute } from './types.ts';
import { verifyFile, type Verification } from './verify.ts';

export type OutputFormat = 'gpx' | 'tcx';

export const MIME_TYPES: Record<OutputFormat, string> = {
  gpx: 'application/gpx+xml',
  tcx: 'application/vnd.garmin.tcx+xml',
};

export interface RunInput {
  route: PreparedRoute | null;
  splitsText: string;
  splitMode: SplitMode;
  lapDistanceM?: number | undefined;
  anchorKind: AnchorKind;
  /** Anchor instant, or undefined if the time field is empty/invalid. */
  anchorMs: number | undefined;
  mismatch: MismatchMode;
  sampleIntervalS: number;
  /** User-chosen name; blank means the default from the start hour. */
  activityName: string;
  format: OutputFormat;
  /** IANA zone for default name/filename; defaults to the runtime's zone. */
  timeZone?: string | undefined;
}

export interface RunTiming {
  totalS: number;
  startMs: number;
  endMs: number;
}

export interface RunOutput {
  parsed: ParsedSplits;
  /** Known as soon as splits and anchor are valid, even without a route. */
  timing: RunTiming | null;
  result: RebuildResult | null;
  /** Why no file could be built, when splits and route are otherwise present. */
  error: string | null;
  /** The generated file in the chosen format. */
  fileText: string | null;
  verification: Verification | null;
  name: string;
  filename: string | null;
}

/** Everything the UI shows, from raw inputs to the verified GPX string. */
export function runPipeline(input: RunInput): RunOutput {
  const parsed = parseSplits(input.splitsText, {
    mode: input.splitMode,
    lapDistanceM: input.lapDistanceM,
  });
  const last = parsed.splits[parsed.splits.length - 1];

  let timing: RunTiming | null = null;
  if (last && input.anchorMs !== undefined && Number.isFinite(input.anchorMs)) {
    const totalMs = Math.round(last.timeS * 1000);
    const anchorMs = Math.round(input.anchorMs);
    const startMs = input.anchorKind === 'start' ? anchorMs : anchorMs - totalMs;
    timing = { totalS: last.timeS, startMs, endMs: startMs + totalMs };
  }

  const name =
    input.activityName.trim() ||
    (timing ? defaultActivityName(timing.startMs, input.timeZone) : 'Run');
  const out: RunOutput = {
    parsed,
    timing,
    result: null,
    error: null,
    fileText: null,
    verification: null,
    name,
    filename: timing ? defaultFilename(timing.startMs, input.format, input.timeZone) : null,
  };
  if (!input.route || !timing || parsed.splits.length === 0) return out;

  const built = rebuild(
    input.route,
    parsed.splits,
    { kind: input.anchorKind, epochMs: input.anchorMs! },
    { mismatch: input.mismatch, sampleIntervalS: input.sampleIntervalS },
  );
  if (!built.ok) return { ...out, error: built.error };

  const { points, splits, startMs } = built.value;
  const fileText =
    input.format === 'tcx'
      ? serializeTcx(points, splits, { startMs, name })
      : serializeGpx(points, { name });
  // Check the file exactly as it will be downloaded.
  const verified = verifyFile(fileText, parsed.splits);
  return {
    ...out,
    result: built.value,
    fileText,
    verification: verified.ok ? verified.value : null,
    error: verified.ok ? null : `Self-check failed: ${verified.error}`,
  };
}
