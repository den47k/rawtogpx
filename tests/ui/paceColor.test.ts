import { describe, expect, it } from 'vitest';
import {
  divergingColor,
  PACE_FAST,
  PACE_MID,
  PACE_SLOW,
  paceScale,
} from '../../src/ui/lib/paceColor.ts';

describe('pace colours', () => {
  it('hits the poles and the neutral midpoint exactly', () => {
    expect(divergingColor(-1)).toBe(PACE_FAST);
    expect(divergingColor(0)).toBe(PACE_MID);
    expect(divergingColor(1)).toBe(PACE_SLOW);
    expect(divergingColor(-5)).toBe(PACE_FAST);
  });

  it('colours faster than average cool and slower warm', () => {
    const s = paceScale([300, 360, 420], 360);
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [fr, , fb] = rgb(s.color(300)) as [number, number, number];
    const [sr, , sb] = rgb(s.color(420)) as [number, number, number];
    expect(fb).toBeGreaterThan(fr);
    expect(sr).toBeGreaterThan(sb);
    expect(s.color(360)).toBe(PACE_MID);
    expect(s.fastestSPerKm).toBe(300);
    expect(s.slowestSPerKm).toBe(420);
  });

  it('is neutral when every split has the same pace', () => {
    expect(paceScale([360, 360], 360).color(360)).toBe(PACE_MID);
  });
});
