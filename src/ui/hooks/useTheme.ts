import { useEffect, useState } from 'react';
import { browserStorage } from '../lib/settings.ts';
import {
  loadThemePref,
  nextThemePref,
  resolveTheme,
  saveThemePref,
  type Theme,
  type ThemePref,
} from '../lib/theme.ts';
import { useMediaQuery } from './useMediaQuery.ts';

export interface ThemeControl {
  pref: ThemePref;
  theme: Theme;
  cycle: () => void;
}

/** The remembered theme preference, applied to `<html data-theme>`. */
export function useTheme(): ThemeControl {
  const [pref, setPref] = useState<ThemePref>(() => loadThemePref(browserStorage()));
  const theme = resolveTheme(pref, useMediaQuery('(prefers-color-scheme: dark)'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return {
    pref,
    theme,
    cycle: () => {
      const next = nextThemePref(pref);
      saveThemePref(browserStorage(), next);
      setPref(next);
    },
  };
}
