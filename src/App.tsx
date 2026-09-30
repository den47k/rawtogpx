import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepareRoute } from './core/geo.ts';
import { parseRoute } from './core/parseRoute.ts';
import { guessSplitMode, parseDistance, type SplitMode } from './core/parseSplits.ts';
import { runPipeline } from './core/pipeline.ts';
import { splitSegments } from './core/segments.ts';
import { defaultActivityName } from './core/serializeGpx.ts';
import type { AnchorKind, MismatchMode } from './core/types.ts';
import { Card } from './ui/components/Card.tsx';
import { DownloadBar } from './ui/components/DownloadBar.tsx';
import { OptionsPanel } from './ui/components/OptionsPanel.tsx';
import { PaceLegend } from './ui/components/PaceLegend.tsx';
import { RouteInput, type LoadedRoute } from './ui/components/RouteInput.tsx';
import { RouteMap } from './ui/components/RouteMap.tsx';
import { SplitsInput } from './ui/components/SplitsInput.tsx';
import { Summary } from './ui/components/Summary.tsx';
import { TimeInput } from './ui/components/TimeInput.tsx';
import { VerificationTable } from './ui/components/VerificationTable.tsx';
import { useDebouncedValue } from './ui/hooks/useDebouncedValue.ts';
import { useWindowFileDrop } from './ui/hooks/useWindowFileDrop.ts';
import { nowToMinute, parseLocalInputValue, toLocalInputValue } from './ui/lib/datetime.ts';
import { downloadText } from './ui/lib/download.ts';
import { paceScale } from './ui/lib/paceColor.ts';
import { takeSharedFile } from './ui/lib/share.ts';
import {
  browserStorage,
  isValidSampleInterval,
  loadSettings,
  saveSettings,
  SAMPLE_INTERVAL_MAX_S,
  SAMPLE_INTERVAL_MIN_S,
} from './ui/lib/settings.ts';

const DEBOUNCE_MS = 150;

export default function App() {
  const [initial] = useState(() => loadSettings(browserStorage()));
  const [loaded, setLoaded] = useState<LoadedRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [splitsText, setSplitsText] = useState('');
  const [manualMode, setManualMode] = useState<SplitMode | null>(
    initial.splitMode === 'auto' ? null : initial.splitMode,
  );
  const [autoMode, setAutoMode] = useState<SplitMode>('cumulative');
  const [lapText, setLapText] = useState(initial.lapText);

  const [anchorKind, setAnchorKind] = useState<AnchorKind>(initial.anchorKind);
  const [anchorValue, setAnchorValue] = useState(() => toLocalInputValue(nowToMinute()));

  const [mismatch, setMismatch] = useState<MismatchMode>(initial.mismatch);
  const [sampleText, setSampleText] = useState(String(initial.sampleIntervalS));
  const [activityName, setActivityName] = useState('');

  const debouncedText = useDebouncedValue(splitsText, DEBOUNCE_MS);
  const debouncedAnchor = useDebouncedValue(anchorValue, DEBOUNCE_MS);
  const debouncedLap = useDebouncedValue(lapText, DEBOUNCE_MS);
  const debouncedSample = useDebouncedValue(sampleText, DEBOUNCE_MS);
  const debouncedName = useDebouncedValue(activityName, DEBOUNCE_MS);

  const sampleValue = Number(debouncedSample);
  const sampleValid = debouncedSample.trim() !== '' && isValidSampleInterval(sampleValue);
  const sampleError = sampleValid
    ? null
    : `Enter a number from ${SAMPLE_INTERVAL_MIN_S} to ${SAMPLE_INTERVAL_MAX_S}.`;
  const sampleIntervalS = sampleValid ? sampleValue : initial.sampleIntervalS;

  // Auto-detect the mode until the user picks one; keep the last confident guess.
  const guess = useMemo(() => guessSplitMode(debouncedText), [debouncedText]);
  if (manualMode === null && guess !== null && guess !== autoMode) setAutoMode(guess);
  const mode = manualMode ?? autoMode;
  const suggestion = manualMode !== null && guess !== null && guess !== manualMode ? guess : null;

  const lapDistanceM = debouncedLap.trim() === '' ? undefined : parseDistance(debouncedLap);
  const lapError =
    debouncedLap.trim() !== '' && (lapDistanceM === undefined || lapDistanceM <= 0)
      ? `Can't read lap distance "${debouncedLap.trim()}".`
      : null;
  const anchorMs = parseLocalInputValue(debouncedAnchor);

  const output = useMemo(
    () =>
      runPipeline({
        route: loaded?.route ?? null,
        splitsText: debouncedText,
        splitMode: mode,
        lapDistanceM: lapError ? undefined : lapDistanceM,
        anchorKind,
        anchorMs,
        mismatch,
        sampleIntervalS,
        activityName: debouncedName,
      }),
    [
      loaded,
      debouncedText,
      mode,
      lapDistanceM,
      lapError,
      anchorKind,
      anchorMs,
      mismatch,
      sampleIntervalS,
      debouncedName,
    ],
  );

  // Remember preferences (never route data or splits).
  useEffect(() => {
    saveSettings(browserStorage(), {
      splitMode: manualMode ?? 'auto',
      anchorKind,
      lapText: debouncedLap,
      mismatch,
      sampleIntervalS,
    });
  }, [manualMode, anchorKind, debouncedLap, mismatch, sampleIntervalS]);

  const { parsed, result, timing } = output;
  const scale = useMemo(() => {
    const last = parsed.splits[parsed.splits.length - 1];
    if (!last) return null;
    const paces = parsed.splits.map((s, i) => {
      const prev = i > 0 ? parsed.splits[i - 1]! : { distanceM: 0, timeS: 0 };
      return (s.timeS - prev.timeS) / ((s.distanceM - prev.distanceM) / 1000);
    });
    return paceScale(paces, last.timeS / (last.distanceM / 1000));
  }, [parsed.splits]);
  const segments = useMemo(
    () => (result ? splitSegments(result.route, result.splits, parsed.splits) : null),
    [result, parsed.splits],
  );
  const defaultName = timing ? defaultActivityName(timing.startMs) : 'Run';

  const loadFile = useCallback(async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRouteError(`Couldn't read ${file.name}.`);
      return;
    }
    const parsed = parseRoute(text);
    if (!parsed.ok) {
      setRouteError(`${file.name}: ${parsed.error}`);
      return;
    }
    const route = prepareRoute(parsed.value);
    if (route.points.length < 2) {
      setRouteError(`${file.name}: the route needs at least two distinct points.`);
      return;
    }
    setLoaded({ fileName: file.name, route });
    setRouteError(null);
  }, []);
  const onFile = useCallback((file: File) => void loadFile(file), [loadFile]);
  const dragging = useWindowFileDrop(onFile);

  // Opened from Android's share sheet: load the shared GPX.
  useEffect(() => {
    void takeSharedFile().then((shared) => {
      if (shared === null) return;
      if (shared instanceof File) onFile(shared);
      else setRouteError(shared.error);
    });
  }, [onFile]);

  const { gpx, filename, error } = output;
  const canDownload = gpx !== null && filename !== null && error === null && sampleError === null;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 md:h-dvh dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-baseline gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h1 className="text-lg font-bold tracking-tight">GPX Rebuilder</h1>
      </header>

      <div className="grid flex-1 grid-cols-1 md:min-h-0 md:grid-cols-[minmax(320px,380px)_1fr] lg:grid-cols-[440px_1fr]">
        <aside className="flex flex-col md:min-h-0 md:border-r md:border-slate-200 md:dark:border-slate-800">
          <div className="flex-1 space-y-3 p-3 md:overflow-y-auto">
            <RouteInput loaded={loaded} error={routeError} onFile={onFile} />
            <SplitsInput
              text={splitsText}
              onText={setSplitsText}
              mode={mode}
              modeIsManual={manualMode !== null}
              onMode={setManualMode}
              suggestion={suggestion}
              lapText={lapText}
              onLapText={setLapText}
              lapError={lapError}
              errors={debouncedText.trim() === '' ? [] : output.parsed.errors}
            />
            <TimeInput
              kind={anchorKind}
              onKind={setAnchorKind}
              value={anchorValue}
              onValue={setAnchorValue}
              onNow={() => setAnchorValue(toLocalInputValue(nowToMinute()))}
              invalid={anchorMs === undefined}
              timing={timing}
            />
            <OptionsPanel
              mismatch={mismatch}
              onMismatch={setMismatch}
              sampleText={sampleText}
              onSampleText={setSampleText}
              sampleError={sampleError}
              name={activityName}
              onName={setActivityName}
              defaultName={defaultName}
            />
            <Summary output={output} hasRoute={loaded !== null} />
          </div>
          <div className="md:border-t md:border-slate-200 md:p-3 md:dark:border-slate-800">
            <DownloadBar
              filename={filename}
              disabled={!canDownload}
              onDownload={() => {
                if (canDownload) downloadText(gpx, filename, 'application/gpx+xml');
              }}
            />
          </div>
        </aside>

        <main className="flex flex-col gap-3 p-3 pb-32 md:min-h-0 md:pb-3">
          <section
            aria-label="Map preview"
            className="flex h-80 shrink-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:h-96 md:h-auto md:min-h-72 md:flex-1 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="min-h-0 flex-1">
              <RouteMap
                route={result?.route ?? loaded?.route ?? null}
                segments={segments}
                scale={scale}
              />
            </div>
            <div className="px-1 pb-1">
              <PaceLegend scale={segments ? scale : null} />
            </div>
          </section>
          <Card title="Split check" className="shrink-0 md:max-h-[45%] md:overflow-y-auto">
            <VerificationTable output={output} scale={scale} />
          </Card>
        </main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[2000] flex items-center justify-center bg-orange-500/15 backdrop-blur-sm">
          <p className="rounded-2xl border-2 border-dashed border-orange-500 bg-white px-8 py-6 text-lg font-semibold text-orange-700 shadow-lg dark:bg-slate-900 dark:text-orange-300">
            Drop the route GPX to load it
          </p>
        </div>
      )}
    </div>
  );
}
