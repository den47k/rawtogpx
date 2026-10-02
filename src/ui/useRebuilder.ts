import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDuration, formatPace } from '../core/format.ts';
import { prepareRoute } from '../core/geo.ts';
import { parseRoute } from '../core/parseRoute.ts';
import { guessSplitMode, parseDistance, parseSplits, type SplitMode } from '../core/parseSplits.ts';
import { MIME_TYPES, runPipeline, type OutputFormat } from '../core/pipeline.ts';
import { restSeconds, splitPaces, splitSegments } from '../core/segments.ts';
import { defaultActivityName } from '../core/serializeGpx.ts';
import { fitTrack, generateTrack, parseLatLon, type TrackLength } from '../core/track.ts';
import type { AnchorKind, MismatchMode, PreparedRoute } from '../core/types.ts';
import { useDebouncedValue } from './hooks/useDebouncedValue.ts';
import { useWindowFileDrop } from './hooks/useWindowFileDrop.ts';
import { buildCheckRows, formatTableDistance, type CheckRow } from './lib/checkRows.ts';
import {
  formatClock,
  nowToMinute,
  parseLocalInputValue,
  toLocalInputValue,
} from './lib/datetime.ts';
import { downloadText } from './lib/download.ts';
import { paceScale } from './lib/paceColor.ts';
import {
  loadSavedTracks,
  removeTrack,
  saveSavedTracks,
  upsertTrack,
  type SavedTrack,
  type SavedTracksStore,
} from './lib/savedTracks.ts';
import { takeSharedFile } from './lib/share.ts';
import {
  browserStorage,
  isValidSampleInterval,
  loadSettings,
  saveSettings,
  SAMPLE_INTERVAL_MAX_S,
  SAMPLE_INTERVAL_MIN_S,
  type RouteSource,
} from './lib/settings.ts';

const DEBOUNCE_MS = 150;

export interface LoadedRoute {
  fileName: string;
  route: PreparedRoute;
}

/** How the track is being placed (the design's placement chips). */
export type PlaceMode = 'map' | 'coords' | 'gps' | 'fit';

export type Tone = 'faint' | 'bad' | 'accent' | 'ok';

export const fmtCenter = (lat: number, lon: number): string =>
  `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
const fmtLaps = (laps: number): string => String(+laps.toFixed(2));
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** All app state, derived values and actions; layouts only render them. */
export function useRebuilder() {
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
  const [placeMode, setPlaceMode] = useState<PlaceMode | null>(lastTrack ? null : 'map');
  const [trackNotice, setTrackNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [trackLengthM, setTrackLengthM] = useState<TrackLength>(
    lastTrack?.lengthM ?? initial.trackLengthM,
  );
  const [trackLapsText, setTrackLapsText] = useState('');
  // The split highlighted on the map and in the split check (hover or tap on either).
  const [hoveredSplit, setHoveredSplit] = useState<number | null>(null);
  const [centerText, setCenterText] = useState(() =>
    lastTrack ? fmtCenter(lastTrack.lat, lastTrack.lon) : '',
  );
  const [headingDeg, setHeadingDeg] = useState(lastTrack?.headingDeg ?? 90);
  const [locating, setLocating] = useState(false);

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
    mode === 'laps' &&
    debouncedLap.trim() !== '' &&
    (lapDistanceM === undefined || lapDistanceM <= 0)
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
    debouncedCenter.trim() !== '' && !center
      ? 'Enter latitude, longitude, e.g. 50.4501, 30.5234.'
      : null;
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

  const { parsed, result, timing, verification, fileText, filename } = output;
  const restS = restSeconds(parsed.splits);
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
  const rows: CheckRow[] = useMemo(
    () => (verification ? buildCheckRows(parsed.splits, verification, mode) : []),
    [verification, parsed.splits, mode],
  );
  const defaultName = timing ? defaultActivityName(timing.startMs) : 'Morning Run';

  // ---------- route file ----------
  const loadFile = useCallback(async (file: File) => {
    let text: string;
    try {
      text = await file.text();
    } catch {
      setRouteError(`Couldn't read ${file.name}.`);
      return;
    }
    const parsedFile = parseRoute(text);
    if (!parsedFile.ok) {
      setRouteError(`${file.name}: ${parsedFile.error}`);
      return;
    }
    const prepared = prepareRoute(parsedFile.value);
    if (prepared.points.length < 2) {
      setRouteError(`${file.name}: the route needs at least two distinct points.`);
      return;
    }
    setLoaded({ fileName: file.name, route: prepared });
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

  // ---------- track placement ----------
  const setCenter = (text: string) => {
    setTrackNotice(null);
    setCenterText(text);
  };
  const locate = () => {
    setPlaceMode('gps');
    if (!('geolocation' in navigator)) {
      setTrackNotice({ tone: 'bad', text: 'This browser cannot share your location.' });
      return;
    }
    setLocating(true);
    setTrackNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCenterText(fmtCenter(pos.coords.latitude, pos.coords.longitude));
      },
      (e) => {
        setLocating(false);
        setTrackNotice({
          tone: 'bad',
          text: `Couldn't get your location: ${e.message || 'permission denied'}.`,
        });
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  const fitFromFile = async (file: File) => {
    setPlaceMode('fit');
    let text: string;
    try {
      text = await file.text();
    } catch {
      setTrackNotice({ tone: 'bad', text: `Couldn't read ${file.name}.` });
      return;
    }
    const parsedFile = parseRoute(text);
    const fit = parsedFile.ok ? fitTrack(parsedFile.value) : parsedFile;
    if (!fit.ok) {
      setTrackNotice({ tone: 'bad', text: `${file.name}: ${fit.error}` });
      return;
    }
    const { center: c, headingDeg: h, lengthM } = fit.value;
    setCenterText(fmtCenter(c.lat, c.lon));
    setHeadingDeg(h);
    setTrackLengthM(lengthM);
    setSelectedTrackId(null);
    setTrackNotice({
      tone: 'ok',
      text: `Fitted: ${lengthM} m, ${h}°. Wrong finish straight? Flip it.`,
    });
  };

  // ---------- saved tracks ----------
  const selectedTrack = trackStore.tracks.find((t) => t.id === selectedTrackId) ?? null;
  const typedCenter = parseLatLon(centerText);
  const updateTrackStore = (next: SavedTracksStore) => {
    setTrackStore(next);
    saveSavedTracks(browserStorage(), next);
  };
  const applyTrack = (t: SavedTrack) => {
    setSelectedTrackId(t.id);
    setTrackNotice(null);
    setCenterText(fmtCenter(t.lat, t.lon));
    setHeadingDeg(t.headingDeg);
    setTrackLengthM(t.lengthM);
    setPlaceMode(null);
    setRouteSource('track');
    updateTrackStore({ ...trackStore, lastId: t.id });
  };
  const currentPlacement = typedCenter
    ? { lat: typedCenter.lat, lon: typedCenter.lon, headingDeg, lengthM: trackLengthM }
    : null;
  /** Save the current placement under `name` (same name overwrites). */
  const saveTrack = (name: string): boolean => {
    if (!currentPlacement || !name.trim()) return false;
    const next = upsertTrack(trackStore, { name, ...currentPlacement }, newId());
    updateTrackStore(next);
    setSelectedTrackId(next.lastId);
    return true;
  };
  /** Overwrite a saved track with the current placement. */
  const updateTrack = (t: SavedTrack) => {
    if (!currentPlacement) return;
    updateTrackStore(upsertTrack(trackStore, { name: t.name, ...currentPlacement }, t.id));
  };
  const deleteTrack = (t: SavedTrack) => {
    updateTrackStore(removeTrack(trackStore, t.id));
    if (selectedTrackId === t.id) setSelectedTrackId(null);
  };

  // ---------- derived display values ----------
  const stated = parsed.splits[parsed.splits.length - 1]?.distanceM;
  const hasText = debouncedText.trim() !== '';
  const errors = hasText ? parsed.errors : [];
  const flagged = rows.filter((r) => r.flagged).length;
  const canDownload =
    fileText !== null &&
    filename !== null &&
    output.error === null &&
    sampleError === null &&
    lapError === null;

  const status: { tone: Tone; text: string } = (() => {
    if (!route)
      return { tone: 'faint', text: routeSource === 'track' ? 'Place a track' : 'Add a route' };
    if (!hasText) return { tone: 'faint', text: 'Add splits' };
    if (errors.length > 0)
      return { tone: 'bad', text: `${errors.length} split error${errors.length > 1 ? 's' : ''}` };
    if (lapError) return { tone: 'bad', text: lapError };
    if (anchorMs === undefined) return { tone: 'bad', text: 'Enter a valid date and time' };
    if (sampleError) return { tone: 'bad', text: `Sample interval: ${sampleError}` };
    if (output.error) return { tone: 'bad', text: output.error };
    if (!verification) return { tone: 'faint', text: 'Checking…' };
    if (flagged > 0)
      return {
        tone: 'accent',
        text: `Self-check: ${flagged} split${flagged > 1 ? 's' : ''} off by more than 1 s`,
      };
    return { tone: 'ok', text: `Self-check passed · ${rows.length}/${rows.length} within 1 s` };
  })();

  const routeMeta =
    routeSource === 'track'
      ? `${trackLengthM} m${laps !== null && Number.isFinite(laps) ? ` · ${fmtLaps(laps)} laps` : ''}`
      : loaded
        ? formatTableDistance(loaded.route.lengthM)
        : '';

  const movingS = timing ? timing.totalS - restS : 0;
  const summary =
    timing && stated !== undefined
      ? [
          { k: 'Stated distance', v: formatTableDistance(stated) },
          { k: 'Route distance', v: result ? formatTableDistance(result.routeLengthM) : '—' },
          {
            k: restS > 0 ? 'Total time (incl. rests)' : 'Total time',
            v: formatDuration(timing.totalS, timing.totalS % 1 ? 1 : 0),
          },
          {
            k: restS > 0 ? 'Moving pace' : 'Average pace',
            v: formatPace(movingS / (stated / 1000)),
          },
          { k: 'Start', v: formatClock(timing.startMs) },
          { k: 'Finish', v: formatClock(timing.endMs, timing.startMs) },
        ]
      : null;
  const summaryEmpty = !hasText
    ? 'Needs splits.'
    : errors.length > 0
      ? 'Fix split errors to see a summary.'
      : 'Needs a valid time.';

  const otherEnd = (() => {
    const label = anchorKind === 'start' ? 'Finish' : 'Start';
    if (!timing) return `${label} —`;
    return anchorKind === 'start'
      ? `${label} ${formatClock(timing.endMs, timing.startMs)}`
      : `${label} ${formatClock(timing.startMs, timing.endMs)}`;
  })();

  const download = () => {
    if (canDownload) downloadText(fileText, filename, MIME_TYPES[format]);
  };

  return {
    // route
    routeSource,
    setRouteSource,
    loaded,
    routeError,
    onFile,
    dragging,
    route,
    routeMeta,
    // track
    trackLengthM,
    setTrackLengthM,
    trackLapsText,
    setTrackLapsText,
    suggestedLaps,
    lapsError,
    centerText,
    setCenter,
    centerError,
    headingDeg,
    setHeadingDeg,
    placeMode,
    setPlaceMode,
    locate,
    locating,
    fitFromFile: (f: File) => void fitFromFile(f),
    trackNotice,
    trackPreview,
    debouncedCenter,
    savedTracks: trackStore.tracks,
    selectedTrack,
    applyTrack,
    saveTrack,
    updateTrack,
    deleteTrack,
    canSaveTrack: currentPlacement !== null,
    // splits
    splitsText,
    setSplitsText,
    mode,
    modeIsManual: manualMode !== null,
    setMode: setManualMode,
    suggestion,
    lapText,
    setLapText,
    lapError,
    errors,
    // time
    anchorKind,
    setAnchorKind,
    anchorValue,
    setAnchorValue,
    setAnchorNow: () => setAnchorValue(toLocalInputValue(nowToMinute())),
    anchorInvalid: anchorMs === undefined,
    otherEnd,
    // options
    mismatch,
    setMismatch,
    warnings: result?.warnings ?? [],
    sampleText,
    setSampleText,
    sampleError,
    activityName,
    setActivityName,
    defaultName,
    // results
    output,
    parsed,
    result,
    timing,
    stated,
    restS,
    movingS,
    scale,
    segments,
    hoveredSplit,
    setHoveredSplit,
    rows,
    flagged,
    summary,
    summaryEmpty,
    status,
    // output
    format,
    setFormat,
    filename,
    canDownload,
    download,
  };
}

export type Rebuilder = ReturnType<typeof useRebuilder>;
