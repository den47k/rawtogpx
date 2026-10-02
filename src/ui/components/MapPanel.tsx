import { formatDuration, formatPace } from '../../core/format.ts';
import { divergingColor } from '../lib/paceColor.ts';
import { formatTableDistance } from '../lib/checkRows.ts';
import { fmtCenter, type Rebuilder } from '../useRebuilder.ts';
import { RouteMap } from './RouteMap.tsx';

const GRADIENT = `linear-gradient(90deg, ${[-1, -0.5, 0, 0.5, 1].map(divergingColor).join(', ')})`;

/** The map with its overlays: hover card, placing hint, empty state and pace legend. */
export function MapPanel({
  r,
  showCard = true,
  legendClass = 'bottom-3',
}: {
  r: Rebuilder;
  showCard?: boolean;
  /** Vertical position of the legend (the mobile sheet overlaps the map's bottom edge). */
  legendClass?: string;
}) {
  const hovered = r.hoveredSplit;
  const placing = r.routeSource === 'track' && r.placeMode === 'map';
  const mapRoute = r.result?.route ?? r.route ?? r.trackPreview;
  const seg = hovered === null ? undefined : r.segments?.find((s) => s.index === hovered);
  const avg = r.scale?.averageSPerKm;
  const delta = seg && !seg.rest && avg !== undefined ? Math.round(seg.paceSPerKm - avg) : null;

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

      {showCard && !placing && seg && (
        <div className="pointer-events-none absolute top-3 left-3 z-[600] flex min-w-[170px] flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-[0_4px_16px_rgba(20,28,38,.06)]">
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
