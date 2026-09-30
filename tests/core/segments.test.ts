import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_M, haversine, prepareRoute } from '../../src/core/geo.ts';
import { splitSegments, subRoute } from '../../src/core/segments.ts';

const DEG_M = (Math.PI / 180) * EARTH_RADIUS_M;
const route = prepareRoute([0, 100, 200, 300, 400].map((d) => ({ lat: d / DEG_M, lon: 0 })));
const len = (pts: { lat: number; lon: number }[]) =>
  pts.slice(1).reduce((sum, p, i) => sum + haversine(pts[i]!, p), 0);

describe('segments', () => {
  it('cuts the route between two distances with interpolated ends', () => {
    const pts = subRoute(route, 150, 320);
    expect(pts).toHaveLength(4); // 150, 200, 300, 320
    expect(len(pts)).toBeCloseTo(170, 6);
  });

  it('includes vertices exactly on the boundary only once', () => {
    expect(subRoute(route, 100, 200)).toHaveLength(2);
  });

  it('splits the whole route with stated labels and pace', () => {
    const segs = splitSegments(
      route,
      [
        { distanceM: 200, timeS: 60 },
        { distanceM: 400, timeS: 150 },
      ],
      [
        { distanceM: 190, timeS: 60 },
        { distanceM: 380, timeS: 150 },
      ],
    );
    expect(segs.map((s) => [s.fromM, s.toM, s.lapS])).toEqual([
      [0, 190, 60],
      [190, 380, 90],
    ]);
    expect(segs[1]!.paceSPerKm).toBeCloseTo(90 / 0.19, 9);
    expect(len(segs[0]!.points) + len(segs[1]!.points)).toBeCloseTo(400, 6);
  });
});
