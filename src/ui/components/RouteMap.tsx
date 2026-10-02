import 'leaflet/dist/leaflet.css';
import { divIcon, latLngBounds, type LatLngExpression } from 'leaflet';
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
} from 'react-leaflet';
import { formatDistance, formatDuration, formatPace } from '../../core/format.ts';
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
  /** Shown over the map while there is no route. */
  emptyMessage: string;
}

const ROUTE_GRAY = '#707070';
const REST_ICON = divIcon({ className: 'rest-marker', html: '‖', iconSize: [20, 20] });
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
      padding: [24, 24],
      maxZoom: 17,
    });
  }, [map, fitKey, hasRoute]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
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

export function RouteMap({ route, segments, scale, fitKey, onPick, emptyMessage }: RouteMapProps) {
  const first = route?.points[0];
  const last = route?.points[route.points.length - 1];

  return (
    <div
      className={`relative h-full min-h-0 overflow-hidden rounded-lg ${onPick ? 'map-picking' : ''}`}
    >
      <MapContainer
        center={[30, 10]}
        zoom={2}
        className="h-full w-full bg-slate-100 dark:bg-slate-800"
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <FitBounds route={route} fitKey={fitKey} />
        {onPick && <ClickToPick onPick={onPick} />}
        <TrackContainerSize />

        {/* Panes fix stacking regardless of render order: casing < route (400) < endpoints. */}
        <Pane name="casing" style={{ zIndex: 390 }}>
          {route && (
            // White casing keeps the coloured line legible over busy tiles.
            <Polyline
              positions={toLatLngs(route.points)}
              pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }}
              interactive={false}
            />
          )}
        </Pane>
        {route && !segments && (
          <Polyline
            positions={toLatLngs(route.points)}
            pathOptions={{ color: ROUTE_GRAY, weight: 5 }}
          />
        )}
        {segments
          ?.filter((s) => s.rest)
          .map((s) => (
            <Marker key={s.index} position={toLatLngs(s.points)[0]!} icon={REST_ICON}>
              <Tooltip>Rest {formatDuration(s.lapS, s.lapS % 1 ? 1 : 0)}</Tooltip>
            </Marker>
          ))}
        {segments
          ?.filter((s) => !s.rest)
          .map((s) => (
            <Polyline
              key={s.index}
              positions={toLatLngs(s.points)}
              pathOptions={{
                color: scale?.color(s.paceSPerKm) ?? ROUTE_GRAY,
                weight: 5,
                lineCap: 'butt',
              }}
            >
              <Tooltip sticky>
                <strong>{s.label ?? `Split ${s.index + 1}`}</strong> · {formatDistance(s.fromM)}–
                {formatDistance(s.toM)}
                <br />
                {formatDuration(s.lapS, s.lapS % 1 ? 1 : 0)} · {formatPace(s.paceSPerKm)}
              </Tooltip>
            </Polyline>
          ))}

        <Pane name="endpoints" style={{ zIndex: 450 }}>
          {first && (
            <CircleMarker
              center={[first.lat, first.lon]}
              radius={7}
              pathOptions={{ color: '#111827', weight: 3, fillColor: '#ffffff', fillOpacity: 1 }}
            >
              <Tooltip>Start</Tooltip>
            </CircleMarker>
          )}
          {last && (
            <CircleMarker
              center={[last.lat, last.lon]}
              radius={7}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#111827', fillOpacity: 1 }}
            >
              <Tooltip>Finish</Tooltip>
            </CircleMarker>
          )}
        </Pane>
      </MapContainer>

      {!route && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-slate-600 shadow dark:bg-slate-900/90 dark:text-slate-300">
            {emptyMessage}
          </p>
        </div>
      )}
    </div>
  );
}
