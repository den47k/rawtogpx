import { useMemo, useRef, useState } from 'react';
import { formatDuration, formatPace } from '../../core/format.ts';
import { probeRoute } from '../../core/probe.ts';
import type { PreparedRoute } from '../../core/types.ts';
import { formatClock } from '../lib/datetime.ts';
import { divergingColor } from '../lib/paceColor.ts';
import { formatTableDistance } from '../lib/checkRows.ts';
import { fmtCenter, type Rebuilder } from '../useRebuilder.ts';
import { RouteMap } from './RouteMap.tsx';

const GRADIENT = `linear-gradient(90deg, ${[-1, -0.5, 0, 0.5, 1].map(divergingColor).join(', ')})`;

const cardCls =
  'pointer-events-none absolute left-3 z-[600] flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-[0_4px_16px_rgba(20,28,38,.06)]';

const signed = (n: number, digits: number): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

/** The map with its overlays: hover card, placing hint, empty state and pace legend. */
export function MapPanel({
  r,
  showCard = true,
  cardClass = 'top-3',
  legendClass = 'bottom-3',
}: {
  r: Rebuilder;
  /** Show the card for a split hovered in the table (a probed route point always shows). */
  showCard?: boolean;
  /** Vertical position of the hover card. */
  cardClass?: string;
  /** Vertical position of the legend (the mobile sheet overlaps the map's bottom edge). */
  legendClass?: string;
}) {
  const hovered = r.hoveredSplit;
  const placing = r.routeSource === 'track' && r.placeMode === 'map';
  const { result } = r;
  const mapRoute = result?.route ?? r.route ?? r.trackPreview;
  const seg = hovered === null ? undefined : r.segments?.find((s) => s.index === hovered);
  const avg = r.scale?.averageSPerKm;
  const delta = seg && !seg.rest && avg !== undefined ? Math.round(seg.paceSPerKm - avg) : null;

  // The probed point is tied to the route it was measured on; a new route drops it.
  const [probe, setProbe] = useState<{ route: PreparedRoute; d: number } | null>(null);
  const probeM = probe && probe.route === mapRoute ? probe.d : null;
  const stats = useMemo(
    () =>
      probeM === null || !mapRoute
        ? null
        : probeRoute(mapRoute, probeM, result?.route === mapRoute ? result.splits : undefined),
    [probeM, mapRoute, result],
  );
  const probeSeg =
    stats?.splitIndex === undefined
      ? undefined
      : r.segments?.find((s) => s.index === stats.splitIndex);

  // Highlight the probed split (map and table), only when it changes so a rest marker's
  // own hover isn't overridden while the pointer sits on it.
  const lastSplit = useRef<number | null>(null);
  const onProbe = (d: number | null) => {
    setProbe(d === null || !mapRoute ? null : { route: mapRoute, d });
    const split =
      d === null || !mapRoute || result?.route !== mapRoute
        ? null
        : (probeRoute(mapRoute, d, result.splits).splitIndex ?? null);
    if (split !== lastSplit.current) {
      lastSplit.current = split;
      r.setHoveredSplit(split);
    }
  };

  const probeRows: { k: string; v: string; sub?: string }[] = [];
  if (stats) {
    probeRows.push({ k: 'Distance', v: formatTableDistance(stats.distanceM) });
    if (stats.elapsedS !== undefined && result) {
      probeRows.push({
        k: 'Time',
        v: formatDuration(stats.elapsedS),
        sub: formatClock(result.startMs + stats.elapsedS * 1000, result.startMs),
      });
    }
    if (probeSeg && !probeSeg.rest) {
      probeRows.push({ k: 'Pace', v: formatPace(probeSeg.paceSPerKm).replace(' /km', '/km') });
    }
    if (stats.ele !== undefined) {
      probeRows.push({ k: 'Elevation', v: `${Math.round(stats.ele)} m` });
    }
    if (stats.gradePct !== undefined) {
      probeRows.push({ k: 'Grade', v: `${signed(stats.gradePct, 1)}%` });
    }
    if (stats.ascentM !== undefined) {
      probeRows.push({ k: 'Climb', v: `+${Math.round(stats.ascentM)} m` });
    }
  }

  return (
    <div className="relative h-full w-full">
      <RouteMap
        route={mapRoute}
        segments={r.segments}
        scale={r.scale}
        fitKey={r.routeSource === 'file' ? r.loaded : `${r.debouncedCenter}|${r.trackLengthM}`}
        onPick={placing ? (lat, lon) => r.setCenter(fmtCenter(lat, lon)) : undefined}
        hovered={hovered}
        onHover={r.setHoveredSplit}
        probeM={placing ? null : probeM}
        onProbe={onProbe}
      />

      {!mapRoute && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex flex-col items-center justify-center gap-1.5 bg-map/60">
          <div className="text-[13px] font-medium text-muted3">
            {r.routeSource === 'track' ? 'No track placed' : 'No route yet'}
          </div>
          <div className="text-xs text-muted2">
            {r.routeSource === 'track'
              ? 'Click the map where the track is, or pick another placement.'
              : 'Load a GPX/TCX or place a track.'}
          </div>
        </div>
      )}

      {placing && (
        <div className="pointer-events-none absolute top-3 left-3 z-[600] rounded-md bg-ink-bg px-2.5 py-1.5 text-xs text-on-ink">
          Click the map to {r.debouncedCenter ? 'move' : 'place'} the track
        </div>
      )}

      {!placing && stats && (
        <div className={`${cardClass} ${cardCls}`}>
          <div className="text-[11px] text-muted">
            {probeSeg
              ? `${probeSeg.label ?? `Split ${probeSeg.index + 1}`} · ${formatTableDistance(probeSeg.fromM)}–${formatTableDistance(probeSeg.toM)}`
              : `Route · ${formatTableDistance(mapRoute?.lengthM ?? 0)}`}
          </div>
          <dl className="m-0 grid grid-cols-[repeat(3,auto)] gap-x-4 gap-y-1.5">
            {probeRows.map((row) => (
              <div key={row.k} className="flex flex-col">
                <dt className="text-[11px] text-muted">{row.k}</dt>
                <dd className="m-0 font-mono text-[13px] font-medium whitespace-nowrap">
                  {row.v}
                  {row.sub && (
                    <span className="block text-[11px] font-normal text-faint">{row.sub}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {showCard && !placing && !stats && seg && (
        <div className={`${cardClass} ${cardCls} min-w-[170px]`}>
          <div className="text-[11px] text-muted">
            {seg.rest
              ? `Rest · at ${formatTableDistance(seg.fromM)}`
              : `${seg.label ?? `Split ${seg.index + 1}`} · ${formatTableDistance(seg.fromM)}–${formatTableDistance(seg.toM)}`}
          </div>
          <div className="font-mono text-[15px] font-medium">
            {seg.rest ? 'Standing' : formatPace(seg.paceSPerKm)}
          </div>
          <div
            className={`font-mono text-[11px] ${delta === null || delta === 0 ? 'text-muted' : delta > 0 ? 'text-accent-text' : 'text-[#2d78bd]'}`}
          >
            {formatDuration(seg.lapS, seg.lapS % 1 ? 1 : 0)}
            {delta !== null &&
              ` · ${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} s vs avg`}
          </div>
        </div>
      )}

      {r.segments && r.scale && (
        <div
          className={`pointer-events-none absolute left-3 z-[600] ${legendClass} flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] text-muted3`}
        >
          <span>Faster</span>
          <span
            aria-hidden
            className="h-1.5 w-[90px] rounded-[3px]"
            style={{ background: GRADIENT }}
          />
          <span>Slower</span>
          <span className="font-mono text-faint">
            avg {formatPace(r.scale.averageSPerKm).replace(' /km', '/km')}
          </span>
        </div>
      )}
    </div>
  );
}
