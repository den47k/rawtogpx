import 'leaflet/dist/leaflet.css';
import { divIcon, latLngBounds, type LatLng, type LatLngExpression } from 'leaflet';
import { useEffect, useRef } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet';
import { formatDuration } from '../../core/format.ts';
import { pointAtDistance } from '../../core/geo.ts';
import { pickPass, polylinePasses, type XY } from '../../core/probe.ts';
import type { SplitSegment } from '../../core/segments.ts';
import type { PreparedRoute, RoutePoint } from '../../core/types.ts';
import type { PaceScale } from '../lib/paceColor.ts';

interface RouteMapProps {
  route: PreparedRoute | null;
  segments: SplitSegment[] | null;
  scale: PaceScale | null;
  /** The view refits to the route only when this changes (a new file or track location). */
  fitKey: unknown;
  /** When set, clicking the map picks a location (track placement). */
  onPick?: ((lat: number, lon: number) => void) | undefined;
  /** The hovered (or tapped) split segment index, for the hover card. */
  hovered: number | null;
  onHover: (index: number | null) => void;
  /** Distance along `route` of the probed (hovered or tapped) point, metres. */
  probeM: number | null;
  onProbe: (probe: MapProbe | null) => void;
}

/** The probed point: the pass shown (`distanceM`) and every pass of the route there. */
export interface MapProbe {
  distanceM: number;
  passes: number[];
}

/** How close the pointer must be to the route to probe it, in pixels. */
const HOVER_TOLERANCE_PX = 14;
const TAP_TOLERANCE_PX = 24;

const REST_ICON = divIcon({ className: 'rest-marker', html: 'R', iconSize: [22, 22] });
const REST_ICON_HOT = divIcon({ className: 'rest-marker', html: 'R', iconSize: [30, 30] });
const toLatLngs = (pts: RoutePoint[]): LatLngExpression[] => pts.map((p) => [p.lat, p.lon]);

/**
 * Fit the view to the route when `fitKey` changes or a route first appears, not on every
 * edit of the same route (e.g. turning the track's heading).
 */
function FitBounds({ route, fitKey }: { route: PreparedRoute | null; fitKey: unknown }) {
  const map = useMap();
  const hasRoute = route !== null;
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });
  useEffect(() => {
    const r = routeRef.current;
    if (!r) return;
    map.fitBounds(latLngBounds(r.points.map((p) => [p.lat, p.lon])), {
      padding: [32, 32],
      maxZoom: 17,
    });
  }, [map, fitKey, hasRoute]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/**
 * Snap the pointer to the route and report every pass of it there. Moving keeps to the same
 * pass; clicking (or tapping the same spot again) switches to the next one. Route pixels are
 * cached per zoom level (absolute pixel coordinates don't change on pan).
 */
function RouteProbe({
  route,
  probeM,
  onProbe,
}: {
  route: PreparedRoute;
  probeM: number | null;
  onProbe: (probe: MapProbe | null) => void;
}) {
  const map = useMap();
  const cache = useRef<{ route: PreparedRoute; zoom: number; xy: XY[] } | null>(null);
  const last = useRef(probeM);
  const lastPt = useRef<XY | null>(null);
  const lastTouch = useRef(-Infinity);
  useEffect(() => {
    last.current = probeM;
  });

  // Browsers wrap a tap in synthetic mouse events (a mousemove before, a mouseout after);
  // they mustn't count as hovering. Tapping off the route clears instead.
  useEffect(() => {
    const el = map.getContainer();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') lastTouch.current = e.timeStamp;
    };
    el.addEventListener('pointerdown', onDown, true);
    return () => el.removeEventListener('pointerdown', onDown, true);
  }, [map]);

  const clear = () => {
    lastPt.current = null;
    if (last.current === null) return;
    last.current = null;
    onProbe(null);
  };

  const probe = (latlng: LatLng, tolerancePx: number, cycle: boolean) => {
    const zoom = map.getZoom();
    if (cache.current?.route !== route || cache.current.zoom !== zoom) {
      cache.current = {
        route,
        zoom,
        xy: route.points.map((p) => map.project([p.lat, p.lon], zoom)),
      };
    }
    const pt = map.project(latlng, zoom);
    const prevPt = lastPt.current;
    const passes = polylinePasses(cache.current.xy, route.cum, pt, tolerancePx);
    if (passes.length === 0) return clear();
    lastPt.current = pt;
    let i = pickPass(passes, last.current ?? undefined);
    const samePlace =
      prevPt !== null && Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) <= tolerancePx;
    if (cycle && samePlace && last.current !== null) i = (i + 1) % passes.length;
    const d = passes[i]!.distanceM;
    if (d === last.current && !cycle) return;
    last.current = d;
    onProbe({ distanceM: d, passes: passes.map((h) => h.distanceM) });
  };

  const fromTouch = (e: Event) => e.timeStamp - lastTouch.current < 800;
  useMapEvents({
    mousemove: (e) => {
      if (!fromTouch(e.originalEvent)) probe(e.latlng, HOVER_TOLERANCE_PX, false);
    },
    click: (e) => probe(e.latlng, TAP_TOLERANCE_PX, true),
    mouseout: (e) => {
      if (!fromTouch(e.originalEvent)) clear();
    },
  });
  return null;
}

/** Leaflet caches its container size; tell it when the layout resizes the map. */
function TrackContainerSize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export function RouteMap({
  route,
  segments,
  scale,
  fitKey,
  onPick,
  hovered,
  onHover,
  probeM,
  onProbe,
}: RouteMapProps) {
  const probePoint = route && probeM !== null ? pointAtDistance(route, probeM) : null;
  const hot = hovered === null ? undefined : segments?.find((s) => s.index === hovered);
  const first = route?.points[0];
  const last = route?.points[route.points.length - 1];
  const loop =
    first !== undefined &&
    last !== undefined &&
    Math.abs(first.lat - last.lat) + Math.abs(first.lon - last.lon) < 2e-4;

  return (
    <div className={`h-full w-full ${onPick ? 'map-picking' : probePoint ? 'map-probing' : ''}`}>
      <MapContainer center={[30, 10]} zoom={2} zoomControl={false} className="h-full w-full">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <ZoomControl position="topright" />
        <FitBounds route={route} fitKey={fitKey} />
        <TrackContainerSize />
        {onPick && <ClickToPick onPick={onPick} />}
        {route && !onPick && <RouteProbe route={route} probeM={probeM} onProbe={onProbe} />}

        {/* Panes fix stacking regardless of render order: halo < route (400) < markers. */}
        <Pane name="casing" style={{ zIndex: 390 }}>
          {route && (
            <Polyline
              positions={toLatLngs(route.points)}
              pathOptions={{
                color: 'var(--halo)',
                weight: 12,
                opacity: 0.9,
                lineJoin: 'round',
              }}
              interactive={false}
            />
          )}
        </Pane>
        {route && !segments && (
          <Polyline
            positions={toLatLngs(route.points)}
            pathOptions={{
              color: 'var(--route)',
              weight: 5,
              lineJoin: 'round',
            }}
            interactive={false}
          />
        )}
        {segments
          ?.filter((s) => !s.rest)
          .map((s) => (
            <Polyline
              key={s.index}
              positions={toLatLngs(s.points)}
              pathOptions={{
                color: scale?.color(s.paceSPerKm) ?? '#80878d',
                weight: 6,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              interactive={false}
            />
          ))}

        {/* The highlighted split, redrawn above the rest (laps on a track overlap). */}
        <Pane name="highlight" style={{ zIndex: 420 }}>
          {hot && !hot.rest && (
            <>
              <Polyline
                positions={toLatLngs(hot.points)}
                pathOptions={{
                  color: 'var(--halo)',
                  weight: 16,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                interactive={false}
              />
              <Polyline
                positions={toLatLngs(hot.points)}
                pathOptions={{
                  color: scale?.color(hot.paceSPerKm) ?? '#80878d',
                  weight: 10,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                interactive={false}
              />
            </>
          )}
        </Pane>

        <Pane name="probe" style={{ zIndex: 440 }}>
          {probePoint && (
            <CircleMarker
              center={[probePoint.lat, probePoint.lon]}
              radius={6}
              pathOptions={{
                color: 'var(--ink)',
                fillColor: 'var(--halo)',
                fillOpacity: 1,
                weight: 3,
              }}
              interactive={false}
            />
          )}
        </Pane>

        <Pane name="endpoints" style={{ zIndex: 450 }}>
          {segments
            ?.filter((s) => s.rest)
            .map((s) => (
              <Marker
                key={s.index}
                position={toLatLngs(s.points)[0]!}
                icon={hovered === s.index ? REST_ICON_HOT : REST_ICON}
                zIndexOffset={hovered === s.index ? 1000 : 0}
                eventHandlers={{
                  mouseover: () => onHover(s.index),
                  mouseout: () => onHover(null),
                  click: () => onHover(s.index),
                }}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  Rest {formatDuration(s.lapS, s.lapS % 1 ? 1 : 0)}
                </Tooltip>
              </Marker>
            ))}
          {first && (
            <>
              <CircleMarker
                center={[first.lat, first.lon]}
                radius={11}
                pathOptions={{
                  color: 'var(--ink)',
                  fill: false,
                  weight: 2,
                }}
                interactive={false}
              />
              <CircleMarker
                center={[first.lat, first.lon]}
                radius={6}
                pathOptions={{
                  color: 'var(--halo)',
                  fillColor: 'var(--ink)',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip direction="left" offset={[-12, 0]}>
                  {loop ? 'Start / finish' : 'Start'}
                </Tooltip>
              </CircleMarker>
            </>
          )}
          {last && !loop && (
            <CircleMarker
              center={[last.lat, last.lon]}
              radius={6}
              pathOptions={{
                color: 'var(--halo)',
                fillColor: 'var(--ink)',
                fillOpacity: 1,
                weight: 2,
              }}
            >
              <Tooltip direction="left" offset={[-8, 0]}>
                Finish
              </Tooltip>
            </CircleMarker>
          )}
        </Pane>
      </MapContainer>
    </div>
  );
}
