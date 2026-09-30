// datetime-local values are interpreted in the runtime's zone; pin it for the test.
process.env.TZ = 'Europe/Kyiv';

import { describe, expect, it } from 'vitest';
import { nowToMinute, parseLocalInputValue, toLocalInputValue } from '../../src/ui/lib/datetime.ts';

describe('datetime-local helpers (Europe/Kyiv)', () => {
  it('uses the pinned zone', () => {
    expect(new Date('2026-09-30T15:50:00Z').getHours()).toBe(18);
  });

  it.each<[string, string | undefined]>([
    ['2026-09-30T18:50', '2026-09-30T15:50:00.000Z'],
    ['2026-09-30T18:50:07', '2026-09-30T15:50:07.000Z'],
    ['2026-09-30T18:50:07.5', '2026-09-30T15:50:07.500Z'],
    ['2026-01-15T08:00', '2026-01-15T06:00:00.000Z'], // winter: UTC+2
    ['2026-02-30T08:00', undefined],
    ['', undefined],
    ['2026-09-30', undefined],
  ])('parses %j', (value, iso) => {
    const ms = parseLocalInputValue(value);
    expect(ms === undefined ? undefined : new Date(ms).toISOString()).toBe(iso);
  });

  it('formats for the input, with seconds only when needed', () => {
    expect(toLocalInputValue(Date.parse('2026-09-30T15:50:00Z'))).toBe('2026-09-30T18:50');
    expect(toLocalInputValue(Date.parse('2026-09-30T15:50:07Z'))).toBe('2026-09-30T18:50:07');
  });

  it('round-trips', () => {
    const ms = Date.parse('2026-03-29T01:30:00Z');
    expect(parseLocalInputValue(toLocalInputValue(ms))).toBe(ms);
  });

  it('rounds now down to the minute', () => {
    expect(nowToMinute(Date.parse('2026-09-30T15:50:59.999Z'))).toBe(
      Date.parse('2026-09-30T15:50:00Z'),
    );
  });
});
