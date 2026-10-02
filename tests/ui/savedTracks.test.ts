import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORE,
  loadSavedTracks,
  removeTrack,
  saveSavedTracks,
  upsertTrack,
} from '../../src/ui/lib/savedTracks.ts';

function memory(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('gpx-rebuilder:tracks:v1', JSON.stringify(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const home = { name: 'Stadium', lat: 50.44, lon: 30.61, headingDeg: 20, lengthM: 400 as const };

describe('saved tracks', () => {
  it('adds, selects, round-trips through storage', () => {
    const s = memory();
    const store = upsertTrack(EMPTY_STORE, home, 'a');
    saveSavedTracks(s, store);
    expect(loadSavedTracks(s)).toEqual({ tracks: [{ ...home, id: 'a' }], lastId: 'a' });
  });

  it('replaces a track saved under the same name', () => {
    let store = upsertTrack(EMPTY_STORE, home, 'a');
    store = upsertTrack(store, { ...home, name: ' stadium ', headingDeg: 25 }, 'b');
    expect(store.tracks).toHaveLength(1);
    expect(store.tracks[0]).toMatchObject({ id: 'a', headingDeg: 25 });
  });

  it('removes a track and clears the selection', () => {
    const store = removeTrack(upsertTrack(EMPTY_STORE, home, 'a'), 'a');
    expect(store).toEqual(EMPTY_STORE);
  });

  it('drops malformed entries and dangling selections', () => {
    const s = memory({
      tracks: [
        { ...home, id: 'ok' },
        { ...home, id: 'bad', lat: 'x' },
        { ...home, id: 'bad2', lengthM: 300 },
        null,
      ],
      lastId: 'bad',
    });
    expect(loadSavedTracks(s)).toEqual({ tracks: [{ ...home, id: 'ok' }], lastId: null });
  });

  it.each([undefined, 'nope', [1, 2]])('falls back to empty for %j', (raw) => {
    expect(loadSavedTracks(memory(raw)).tracks).toEqual([]);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSavedTracks(broken)).toEqual(EMPTY_STORE);
    expect(() => saveSavedTracks(broken, EMPTY_STORE)).not.toThrow();
  });
});
