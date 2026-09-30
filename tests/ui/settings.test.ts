import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from '../../src/ui/lib/settings.ts';

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('gpx-rebuilder:settings:v1', initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('settings', () => {
  it('round-trips', () => {
    const s = memory();
    const settings: Settings = {
      splitMode: 'laps',
      anchorKind: 'start',
      lapText: '400m',
      mismatch: 'trim',
      sampleIntervalS: 2.5,
    };
    saveSettings(s, settings);
    expect(loadSettings(s)).toEqual(settings);
  });

  it('never stores route or split data', () => {
    const s = memory();
    saveSettings(s, DEFAULT_SETTINGS);
    expect(Object.keys(JSON.parse(s.data.get('gpx-rebuilder:settings:v1')!)).sort()).toEqual([
      'anchorKind',
      'lapText',
      'mismatch',
      'sampleIntervalS',
      'splitMode',
    ]);
  });

  it.each([
    ['missing', undefined],
    ['invalid JSON', '{nope'],
    ['not an object', '42'],
    ['null', 'null'],
  ])('falls back to defaults when %s', (_name, raw) => {
    expect(loadSettings(memory(raw))).toEqual(DEFAULT_SETTINGS);
  });

  it('drops invalid fields individually', () => {
    const raw = JSON.stringify({
      splitMode: 'weird',
      anchorKind: 'start',
      lapText: 5,
      mismatch: 'trim',
      sampleIntervalS: 0,
    });
    expect(loadSettings(memory(raw))).toEqual({
      ...DEFAULT_SETTINGS,
      anchorKind: 'start',
      mismatch: 'trim',
    });
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
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});
