/**
 * Colour theme preference. `system` follows `prefers-color-scheme`. The resolved theme is
 * set as `<html data-theme>`; index.html applies it before first paint (keep the storage key
 * in sync there).
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'gpx-rebuilder:theme';

const ORDER: readonly ThemePref[] = ['system', 'light', 'dark'];

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** The toggle cycles system -> light -> dark -> system. */
export const nextThemePref = (pref: ThemePref): ThemePref =>
  ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!;

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme =>
  pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

export function loadThemePref(storage: StorageLike | undefined): ThemePref {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePref(storage: StorageLike | undefined, pref: ThemePref): void {
  try {
    storage?.setItem(THEME_KEY, pref);
  } catch {
    // Private mode or quota: the choice just won't persist.
  }
}
