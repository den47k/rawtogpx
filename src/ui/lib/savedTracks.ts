import { TRACK_LENGTHS, type TrackLength } from '../../core/track.ts';

/**
 * Tracks the user chose to save (explicitly, with the Save button): the one exception to
 * "never persist route data", because re-placing a home track every time is tedious.
 */
export interface SavedTrack {
  id: string;
  name: string;
  lat: number;
  lon: number;
  headingDeg: number;
  lengthM: TrackLength;
}

export interface SavedTracksStore {
  tracks: SavedTrack[];
  /** The track picked last, selected again on the next visit. */
  lastId: string | null;
}

const KEY = 'gpx-rebuilder:tracks:v1';
export const MAX_SAVED_TRACKS = 50;
export const EMPTY_STORE: SavedTracksStore = { tracks: [], lastId: null };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function validTrack(v: unknown): SavedTrack | null {
  if (typeof v !== 'object' || v === null) return null;
  const t = v as Record<string, unknown>;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (
    typeof t.id !== 'string' ||
    typeof t.name !== 'string' ||
    !num(t.lat) ||
    !num(t.lon) ||
    !num(t.headingDeg) ||
    Math.abs(t.lat) > 85 ||
    Math.abs(t.lon) > 180 ||
    !TRACK_LENGTHS.includes(t.lengthM as TrackLength)
  ) {
    return null;
  }
  return {
    id: t.id,
    name: t.name.slice(0, 60),
    lat: t.lat,
    lon: t.lon,
    headingDeg: ((Math.round(t.headingDeg) % 360) + 360) % 360,
    lengthM: t.lengthM as TrackLength,
  };
}

export function loadSavedTracks(storage: StorageLike | undefined): SavedTracksStore {
  let raw: unknown;
  try {
    raw = JSON.parse(storage?.getItem(KEY) ?? 'null');
  } catch {
    return EMPTY_STORE;
  }
  if (typeof raw !== 'object' || raw === null) return EMPTY_STORE;
  const r = raw as Record<string, unknown>;
  const tracks = (Array.isArray(r.tracks) ? r.tracks : [])
    .map(validTrack)
    .filter((t): t is SavedTrack => t !== null)
    .slice(0, MAX_SAVED_TRACKS);
  const lastId =
    typeof r.lastId === 'string' && tracks.some((t) => t.id === r.lastId) ? r.lastId : null;
  return { tracks, lastId };
}

export function saveSavedTracks(storage: StorageLike | undefined, store: SavedTracksStore): void {
  try {
    storage?.setItem(KEY, JSON.stringify(store));
  } catch {
    // Private mode or quota: tracks just won't persist.
  }
}

/** Add a track, or replace the one with the same name (case-insensitive). */
export function upsertTrack(
  store: SavedTracksStore,
  track: Omit<SavedTrack, 'id'>,
  newId: string,
): SavedTracksStore {
  const existing = store.tracks.find(
    (t) => t.name.trim().toLowerCase() === track.name.trim().toLowerCase(),
  );
  const id = existing?.id ?? newId;
  const saved: SavedTrack = { ...track, id, name: track.name.trim().slice(0, 60) };
  const tracks = existing
    ? store.tracks.map((t) => (t.id === id ? saved : t))
    : [...store.tracks, saved].slice(-MAX_SAVED_TRACKS);
  return { tracks, lastId: id };
}

export function removeTrack(store: SavedTracksStore, id: string): SavedTracksStore {
  return {
    tracks: store.tracks.filter((t) => t.id !== id),
    lastId: store.lastId === id ? null : store.lastId,
  };
}
