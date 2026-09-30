import { describe, expect, it } from 'vitest';
import {
  guessSplitMode,
  parseDistance,
  parseSplits,
  parseTime,
  type ParseSplitsOptions,
} from '../../src/core/parseSplits.ts';
import type { Split } from '../../src/core/types.ts';

const MI = 1609.344;

describe('parseDistance', () => {
  it.each<[string, number | undefined]>([
    ['1k', 1000],
    ['1K', 1000],
    ['1km', 1000],
    ['1KM', 1000],
    ['5.37k', 5370],
    ['.5k', 500],
    ['400m', 400],
    ['400M', 400],
    ['800', 800],
    ['1mi', MI],
    ['0.5mi', 0.5 * MI],
    ['0.5MI', 0.5 * MI],
    ['k', undefined],
    ['1x', undefined],
    ['1.2.3k', undefined],
    ['-1k', undefined],
    ['', undefined],
  ])('%j -> %s', (input, expected) => {
    const got = parseDistance(input);
    if (expected === undefined) expect(got).toBeUndefined();
    else expect(got).toBeCloseTo(expected, 9);
  });
});

describe('parseTime', () => {
  it.each<[string, number | undefined]>([
    ['45', 45],
    ['45.5', 45.5],
    ['6:10', 370],
    ['6:09.8', 369.8],
    ['06:10', 370],
    ['31:31', 1891],
    ['75:30', 4530],
    ['1:02:03', 3723],
    ['1:02:03.25', 3723.25],
    ['12:19', 739],
    ['6:1', undefined],
    ['6:60', undefined],
    ['1:60:00', undefined],
    ['1:2:03', undefined],
    ['1:02:03:04', undefined],
    ['6:1a', undefined],
    [':10', undefined],
    ['abc', undefined],
  ])('%j -> %s', (input, expected) => {
    const got = parseTime(input);
    if (expected === undefined) expect(got).toBeUndefined();
    else expect(got).toBeCloseTo(expected, 9);
  });
});

const REFERENCE: Split[] = [
  { distanceM: 1000, timeS: 370 },
  { distanceM: 2000, timeS: 739 },
  { distanceM: 3000, timeS: 1093 },
  { distanceM: 4000, timeS: 1461 },
  { distanceM: 5370, timeS: 1891 },
];

describe('parseSplits: valid input', () => {
  const cumulative: ParseSplitsOptions = { mode: 'cumulative' };
  const laps: ParseSplitsOptions = { mode: 'laps' };
  const laps1k: ParseSplitsOptions = { mode: 'laps', lapDistanceM: 1000 };

  it.each<[string, string, ParseSplitsOptions, Split[]]>([
    [
      'reference, comma separated',
      '1k 6:10, 2k 12:19, 3k 18:13, 4k 24:21, 5.37k 31:31',
      cumulative,
      REFERENCE,
    ],
    [
      'reference, slash separated',
      '1k 6:10 / 2k 12:19 / 3k 18:13 / 4k 24:21 / 5.37k 31:31',
      cumulative,
      REFERENCE,
    ],
    [
      'reference, one per line',
      '1k 6:10\n2k 12:19\n3k 18:13\n4k 24:21\n5.37k 31:31\n',
      cumulative,
      REFERENCE,
    ],
    [
      'reference, semicolons + CRLF + blank lines',
      '1k 6:10; 2k 12:19\r\n\r\n3k 18:13;4k 24:21\r\n5.37k 31:31',
      cumulative,
      REFERENCE,
    ],
    [
      'reference, space separated on one line',
      '1k 6:10 2k 12:19 3k 18:13 4k 24:21 5.37k 31:31',
      cumulative,
      REFERENCE,
    ],
    [
      'messy filler: "1 km - 6:10", "2km: 12:19", "3K=18:13", upper case',
      '1 km - 6:10\n2km: 12:19\n3K=18:13\n4 KM  24:21\n5.37K 31:31',
      cumulative,
      REFERENCE,
    ],
    [
      'metres with and without unit',
      '400m 1:30, 800 3:05',
      cumulative,
      [
        { distanceM: 400, timeS: 90 },
        { distanceM: 800, timeS: 185 },
      ],
    ],
    [
      'miles and fractional seconds',
      '0.5mi 4:00.5, 1mi 8:01',
      cumulative,
      [
        { distanceM: 0.5 * MI, timeS: 240.5 },
        { distanceM: MI, timeS: 481 },
      ],
    ],
    [
      'hours',
      '10k 55:00, 21.1k 1:58:30',
      cumulative,
      [
        { distanceM: 10000, timeS: 3300 },
        { distanceM: 21100, timeS: 7110 },
      ],
    ],
    ['single split', '5.37k 31:31', cumulative, [{ distanceM: 5370, timeS: 1891 }]],
    [
      'laps with uniform distance, time only',
      '6:10 6:09 5:54 6:08 7:10',
      laps1k,
      [
        { distanceM: 1000, timeS: 370 },
        { distanceM: 2000, timeS: 739 },
        { distanceM: 3000, timeS: 1093 },
        { distanceM: 4000, timeS: 1461 },
        { distanceM: 5000, timeS: 1891 },
      ],
    ],
    [
      'laps with uniform distance and a final partial lap',
      '6:10 6:09 5:54 6:08\n1.37k 7:10',
      laps1k,
      REFERENCE,
    ],
    [
      'laps with explicit distances',
      '1k 6:10, 1k 6:09, 1k 5:54, 1k 6:08, 1.37k 7:10',
      laps,
      REFERENCE,
    ],
    [
      'laps: bare numbers are seconds when lap distance is set',
      '75, 76.5, 74',
      { mode: 'laps', lapDistanceM: 400 },
      [
        { distanceM: 400, timeS: 75 },
        { distanceM: 800, timeS: 151.5 },
        { distanceM: 1200, timeS: 225.5 },
      ],
    ],
    [
      'laps: bare distance + time without lap distance',
      '400 75, 400 76',
      laps,
      [
        { distanceM: 400, timeS: 75 },
        { distanceM: 800, timeS: 151 },
      ],
    ],
  ])('%s', (_name, input, options, expected) => {
    const r = parseSplits(input, options);
    expect(r.errors).toEqual([]);
    expect(r.splits).toHaveLength(expected.length);
    r.splits.forEach((s, i) => {
      expect(s.distanceM).toBeCloseTo(expected[i]!.distanceM, 6);
      expect(s.timeS).toBeCloseTo(expected[i]!.timeS, 6);
    });
  });

  it('records line numbers on entries', () => {
    const r = parseSplits('1k 6:10, 2k 12:19\n\n3k 18:13', cumulative);
    expect(r.entries.map((e) => e.line)).toEqual([1, 1, 3]);
  });
});

describe('parseSplits: errors', () => {
  it.each<[string, string, ParseSplitsOptions, (number | null)[], RegExp]>([
    ['empty input', '', { mode: 'cumulative' }, [null], /at least one split/],
    ['whitespace only', '  \n , ; ', { mode: 'cumulative' }, [null], /at least one split/],
    ['unparseable token', '1k 6:10\n2k 12:xx', { mode: 'cumulative' }, [2], /Can't read "12:xx"/],
    ['word', '1k 6:10\nfoo 12:19', { mode: 'cumulative' }, [2], /Can't read "foo"/],
    ['distance without time', '1k 6:10\n2k', { mode: 'cumulative' }, [2], /no time/],
    [
      'non-increasing distance',
      '2k 6:10\n1k 12:19',
      { mode: 'cumulative' },
      [2],
      /Distance must increase/,
    ],
    ['non-increasing time', '1k 6:10\n2k 6:00', { mode: 'cumulative' }, [2], /Time must increase/],
    ['zero-length split', '1k 6:10\n1k 7:00', { mode: 'cumulative' }, [2], /Zero-length/],
    ['zero distance', '0k 1:00', { mode: 'cumulative' }, [1], /Distance can't be zero/],
    ['zero time', '1k 0:00', { mode: 'cumulative' }, [1], /Time can't be zero/],
    [
      'time only in cumulative mode',
      '1k 6:10\n12:19',
      { mode: 'cumulative' },
      [2],
      /needs a distance/,
    ],
    [
      'time only in laps mode without lap distance',
      '6:10 6:09',
      { mode: 'laps' },
      [1, 1],
      /set a lap/,
    ],
    ['zero lap time', '6:10\n0:00', { mode: 'laps', lapDistanceM: 1000 }, [2], /Lap time/],
    ['zero lap distance', '0k 6:10', { mode: 'laps' }, [1], /Lap distance can't be zero/],
    [
      'invalid lap distance',
      '6:10',
      { mode: 'laps', lapDistanceM: 0 },
      [null, 1],
      /greater than zero/,
    ],
  ])('%s', (_name, input, options, lines, message) => {
    const r = parseSplits(input, options);
    expect(r.splits).toEqual([]);
    expect(r.errors.map((e) => e.line)).toEqual(lines);
    expect(r.errors.some((e) => message.test(e.message))).toBe(true);
  });

  it('reports every bad line, sorted', () => {
    const r = parseSplits('1k 6:10\n2k nope\n3k 18:13\n2.5k 20:00', { mode: 'cumulative' });
    expect(r.errors.map((e) => e.line)).toEqual([2, 4]);
  });
});

describe('guessSplitMode', () => {
  it.each<[string, string, 'cumulative' | 'laps' | null]>([
    ['reference cumulative', '1k 6:10, 2k 12:19, 3k 18:13, 4k 24:21, 5.37k 31:31', 'cumulative'],
    ['times only', '6:10 6:09 5:54 6:08 7:10', 'laps'],
    ['equal distances', '1k 6:10, 1k 6:09, 1k 5:54, 1k 6:08, 1.37k 7:10', 'laps'],
    ['times then partial lap', '6:10 6:09 5:54 6:08\n1.37k 7:10', 'laps'],
    ['track reps', '400 75, 400 76, 400 74', 'laps'],
    ['single time', '31:31', 'laps'],
    ['single distance + time is ambiguous', '5.37k 31:31', null],
    ['wildly different times', '1k 6:10, 1k 20:00', null],
    ['garbage', 'hello', null],
    ['empty', '', null],
  ])('%s', (_name, input, expected) => {
    expect(guessSplitMode(input)).toBe(expected);
  });
});
