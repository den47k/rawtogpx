import { describe, expect, it } from 'vitest';
import {
  loadThemePref,
  nextThemePref,
  resolveTheme,
  saveThemePref,
  THEME_KEY,
} from '../../src/ui/lib/theme.ts';

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(THEME_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('theme', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePref('system')).toBe('light');
    expect(nextThemePref('light')).toBe('dark');
    expect(nextThemePref('dark')).toBe('system');
  });

  it('resolves system from the media query, explicit choices as-is', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('round-trips and falls back to system', () => {
    const s = memory();
    expect(loadThemePref(s)).toBe('system');
    saveThemePref(s, 'dark');
    expect(loadThemePref(s)).toBe('dark');
    expect(loadThemePref(memory('purple'))).toBe('system');
    expect(loadThemePref(undefined)).toBe('system');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadThemePref(broken)).toBe('system');
    expect(() => saveThemePref(broken, 'light')).not.toThrow();
  });
});
