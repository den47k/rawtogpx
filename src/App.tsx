import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepareRoute } from './core/geo.ts';
import { parseRoute } from './core/parseRoute.ts';
import { guessSplitMode, parseDistance, parseSplits, type SplitMode } from './core/parseSplits.ts';
import { MIME_TYPES, runPipeline, type OutputFormat } from './core/pipeline.ts';
import { restSeconds, splitPaces, splitSegments } from './core/segments.ts';
import { defaultActivityName } from './core/serializeGpx.ts';
import { fitTrack, generateTrack, parseLatLon, type TrackLength } from './core/track.ts';
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
import { TrackInput } from './ui/components/TrackInput.tsx';
import { VerificationTable } from './ui/components/VerificationTable.tsx';
import { useDebouncedValue } from './ui/hooks/useDebouncedValue.ts';
import { useWindowFileDrop } from './ui/hooks/useWindowFileDrop.ts';
import { nowToMinute, parseLocalInputValue, toLocalInputValue } from './ui/lib/datetime.ts';
import { downloadText } from './ui/lib/download.ts';
import { paceScale } from './ui/lib/paceColor.ts';
import {
  loadSavedTracks,
  removeTrack,
  saveSavedTracks,
  upsertTrack,
  type SavedTracksStore,
} from './ui/lib/savedTracks.ts';
import { takeSharedFile } from './ui/lib/share.ts';
import {
  browserStorage,
  isValidSampleInterval,
  loadSettings,
  saveSettings,
  SAMPLE_INTERVAL_MAX_S,
  SAMPLE_INTERVAL_MIN_S,
  type RouteSource,
} from './ui/lib/settings.ts';

const DEBOUNCE_MS = 150;

const fmtCenter = (lat: number, lon: number): string => `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

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
  const [format, setFormat] = useState<OutputFormat>(initial.format);

  // Route source: an uploaded file, or a generated running track.
  const [routeSource, setRouteSource] = useState<RouteSource>(initial.routeSource);
  // Saved tracks (explicitly saved by the user); the last one used comes back selected.
  const [initialTracks] = useState(() => loadSavedTracks(browserStorage()));
  const lastTrack = initialTracks.tracks.find((t) => t.id === initialTracks.lastId) ?? null;
  const [trackStore, setTrackStore] = useState<SavedTracksStore>(initialTracks);
  const [selectedTrackId, setSelectedTrackId] = useState(lastTrack?.id ?? null);
  const [placing, setPlacing] = useState(false);
  const [trackNotice, setTrackNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(
    null,
  );
  const [trackLengthM, setTrackLengthM] = useState<TrackLength>(
    lastTrack?.lengthM ?? initial.trackLengthM,
  );
  const [trackLapsText, setTrackLapsText] = useState('');
  const [centerText, setCenterText] = useState(() =>
    lastTrack ? fmtCenter(lastTrack.lat, lastTrack.lon) : '',
  );
  const [headingDeg, setHeadingDeg] = useState(lastTrack?.headingDeg ?? 90);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const debouncedText = useDebouncedValue(splitsText, DEBOUNCE_MS);
  const debouncedAnchor = useDebouncedValue(anchorValue, DEBOUNCE_MS);
  const debouncedLap = useDebouncedValue(lapText, DEBOUNCE_MS);
  const debouncedSample = useDebouncedValue(sampleText, DEBOUNCE_MS);
  const debouncedName = useDebouncedValue(activityName, DEBOUNCE_MS);
  const debouncedLaps = useDebouncedValue(trackLapsText, DEBOUNCE_MS);
  const debouncedCenter = useDebouncedValue(centerText, DEBOUNCE_MS);
  const debouncedHeading = useDebouncedValue(headingDeg, DEBOUNCE_MS);

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
  const lapDistanceForSplits = lapError ? undefined : lapDistanceM;

  // Track mode: blank laps means "as many laps as the splits cover".
  const statedM = useMemo(() => {
    const { splits } = parseSplits(debouncedText, { mode, lapDistanceM: lapDistanceForSplits });
    return splits[splits.length - 1]?.distanceM ?? null;
  }, [debouncedText, mode, lapDistanceForSplits]);
  const suggestedLaps = statedM === null ? null : statedM / trackLengthM;
  const center = parseLatLon(debouncedCenter);
  const lapsTyped = debouncedLaps.trim() === '' ? null : Number(debouncedLaps);
  const laps = lapsTyped ?? suggestedLaps;
  const track = useMemo(() => {
    if (routeSource !== 'track' || !center || laps === null) return null;
    return generateTrack({ center, lengthM: trackLengthM, laps, headingDeg: debouncedHeading });
    // `center` is re-created each render; its text is the stable key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSource, debouncedCenter, trackLengthM, laps, debouncedHeading]);
  const lapsError =
    track && !track.ok && /Laps/.test(track.error)
      ? track.error
      : lapsTyped !== null && !Number.isFinite(lapsTyped)
        ? 'Enter a number of laps, e.g. 12.5.'
        : null;
  const centerError =
    locateError ??
    (debouncedCenter.trim() !== '' && !center
      ? 'Enter latitude, longitude, e.g. 50.4501, 30.5234.'
      : null);
  const route = routeSource === 'file' ? (loaded?.route ?? null) : track?.ok ? track.value : null;
  // A placed track with no splits yet still shows where it is: one lap.
  const trackPreview = useMemo(() => {
    if (routeSource !== 'track' || !center || laps !== null) return null;
    const r = generateTrack({
      center,
      lengthM: trackLengthM,
      laps: 1,
      headingDeg: debouncedHeading,
    });
    return r.ok ? r.value : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSource, debouncedCenter, trackLengthM, laps, debouncedHeading]);

  const output = useMemo(
    () =>
      runPipeline({
        route,
        splitsText: debouncedText,
        splitMode: mode,
        lapDistanceM: lapDistanceForSplits,
        anchorKind,
        anchorMs,
        mismatch,
        sampleIntervalS,
        activityName: debouncedName,
        format,
      }),
    [
      route,
      debouncedText,
      mode,
      lapDistanceForSplits,
      anchorKind,
      anchorMs,
      mismatch,
      sampleIntervalS,
      debouncedName,
      format,
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
      format,
      routeSource,
      trackLengthM,
    });
  }, [
    manualMode,
    anchorKind,
    debouncedLap,
    mismatch,
    sampleIntervalS,
    format,
    routeSource,
    trackLengthM,
  ]);

  const { parsed, result, timing } = output;
  const scale = useMemo(() => {
    const last = parsed.splits[parsed.splits.length - 1];
    if (!last) return null;
    const movingS = last.timeS - restSeconds(parsed.splits);
    return paceScale(splitPaces(parsed.splits), movingS / (last.distanceM / 1000));
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
    setRouteSource('file');
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

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocateError('This browser cannot share your location.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCenterText(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
      },
      (e) => {
        setLocating(false);
        setLocateError(`Couldn't get your location: ${e.message || 'permission denied'}.`);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const pickCenter = (text: string) => {
    setLocateError(null);
    setTrackNotice(null);
    setCenterText(text);
  };

  const selectedTrack = trackStore.tracks.find((t) => t.id === selectedTrackId) ?? null;
  const placementOpen = placing || selectedTrack === null;
  const typedCenter = parseLatLon(centerText);
  const trackModified =
    selectedTrack !== null &&
    (!typedCenter ||
      Math.abs(typedCenter.lat - selectedTrack.lat) > 1e-6 ||
      Math.abs(typedCenter.lon - selectedTrack.lon) > 1e-6 ||
      headingDeg !== selectedTrack.headingDeg ||
      trackLengthM !== selectedTrack.lengthM);
  const updateTrackStore = (next: SavedTracksStore) => {
    setTrackStore(next);
    saveSavedTracks(browserStorage(), next);
  };
  const selectTrack = (id: string | null) => {
    setSelectedTrackId(id);
    setTrackNotice(null);
    setLocateError(null);
    const t = trackStore.tracks.find((x) => x.id === id);
    if (t) {
      setCenterText(fmtCenter(t.lat, t.lon));
      setHeadingDeg(t.headingDeg);
      setTrackLengthM(t.lengthM);
      setPlacing(false);
    } else {
      setPlacing(true);
    }
    updateTrackStore({ ...trackStore, lastId: t ? t.id : null });
  };
  const saveTrack = () => {
    if (!typedCenter) return;
    const name = window.prompt('Name this track', selectedTrack?.name ?? 'My track');
    if (!name?.trim()) return;
    const next = upsertTrack(
      trackStore,
      { name, lat: typedCenter.lat, lon: typedCenter.lon, headingDeg, lengthM: trackLengthM },
      newId(),
    );
    updateTrackStore(next);
    setSelectedTrackId(next.lastId);
    setPlacing(false);
    setTrackNotice(null);
  };
  const deleteTrack = () => {
    if (!selectedTrack || !window.confirm(`Delete saved track “${selectedTrack.name}”?`)) return;
    updateTrackStore(removeTrack(trackStore, selectedTrack.id));
    setSelectedTrackId(null);
    setPlacing(true);
    setTrackNotice(null);
  };
  const fitFromFile = async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setTrackNotice({ kind: 'error', text: `Couldn't read ${file.name}.` });
      return;
    }
    const parsedFile = parseRoute(text);
    const fit = parsedFile.ok ? fitTrack(parsedFile.value) : parsedFile;
    if (!fit.ok) {
      setTrackNotice({ kind: 'error', text: `${file.name}: ${fit.error}` });
      return;
    }
    const { center: c, headingDeg: h, lengthM } = fit.value;
    setLocateError(null);
    setCenterText(fmtCenter(c.lat, c.lon));
    setHeadingDeg(h);
    setTrackLengthM(lengthM);
    setSelectedTrackId(null);
    setPlacing(true);
    setTrackNotice({
      kind: 'ok',
      text: `Placed a ${lengthM} m track from ${file.name}. Check the map; if the finish is on the wrong straight, press Flip. Save it to reuse.`,
    });
  };

  const { fileText, filename, error } = output;
  const canDownload =
    fileText !== null && filename !== null && error === null && sampleError === null;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 md:h-dvh dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-baseline gap-3 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <h1 className="text-lg font-bold tracking-tight">GPX Rebuilder</h1>
      </header>

      <div className="grid flex-1 grid-cols-1 md:min-h-0 md:grid-cols-[minmax(320px,380px)_1fr] lg:grid-cols-[440px_1fr]">
        <aside className="flex flex-col md:min-h-0 md:border-r md:border-slate-200 md:dark:border-slate-800">
          <div className="flex-1 space-y-2.5 p-3 md:overflow-y-auto">
            <RouteInput
              source={routeSource}
              onSource={setRouteSource}
              loaded={loaded}
              error={routeError}
              onFile={onFile}
              track={
                <TrackInput
                  lengthM={trackLengthM}
                  onLength={setTrackLengthM}
                  lapsText={trackLapsText}
                  onLapsText={setTrackLapsText}
                  suggestedLaps={suggestedLaps}
                  lapsError={lapsError}
                  centerText={centerText}
                  onCenterText={pickCenter}
                  centerError={centerError}
                  onLocate={locate}
                  locating={locating}
                  headingDeg={headingDeg}
                  onHeading={setHeadingDeg}
                  savedTracks={trackStore.tracks}
                  selectedId={selectedTrackId}
                  onSelect={selectTrack}
                  modified={trackModified}
                  onSave={saveTrack}
                  onDelete={deleteTrack}
                  placing={placementOpen}
                  onPlacing={setPlacing}
                  onFitFile={(f) => void fitFromFile(f)}
                  notice={trackNotice}
                />
              }
            />
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
            <Summary output={output} hasRoute={route !== null} />
          </div>
          <div className="md:border-t md:border-slate-200 md:p-3 md:dark:border-slate-800">
            <DownloadBar
              format={format}
              onFormat={setFormat}
              filename={filename}
              disabled={!canDownload}
              onDownload={() => {
                if (canDownload) downloadText(fileText, filename, MIME_TYPES[format]);
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
                route={result?.route ?? route ?? trackPreview}
                segments={segments}
                scale={scale}
                fitKey={routeSource === 'file' ? loaded : `${debouncedCenter}|${trackLengthM}`}
                onPick={
                  routeSource === 'track' && placementOpen
                    ? (lat, lon) => pickCenter(fmtCenter(lat, lon))
                    : undefined
                }
                emptyMessage={
                  routeSource === 'track'
                    ? 'Click the map where the track is, or enter its coordinates.'
                    : 'Load a route to preview it here.'
                }
              />
            </div>
            <div className="px-1 pb-1">
              <PaceLegend
                scale={segments ? scale : null}
                hasRests={parsed.splits.some((s) => s.rest)}
              />
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
