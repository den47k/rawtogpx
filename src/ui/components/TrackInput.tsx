import { useId } from 'react';
import { TRACK_LENGTHS, type TrackLength } from '../../core/track.ts';
import type { SavedTrack } from '../lib/savedTracks.ts';
import { SegmentedControl } from './SegmentedControl.tsx';

interface TrackInputProps {
  lengthM: TrackLength;
  onLength: (m: TrackLength) => void;
  lapsText: string;
  onLapsText: (s: string) => void;
  /** Laps that would match the splits' total distance; used when the field is blank. */
  suggestedLaps: number | null;
  lapsError: string | null;
  centerText: string;
  onCenterText: (s: string) => void;
  centerError: string | null;
  onLocate: () => void;
  locating: boolean;
  headingDeg: number;
  onHeading: (deg: number) => void;

  savedTracks: SavedTrack[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The selected track's placement was changed since it was saved. */
  modified: boolean;
  onSave: () => void;
  onDelete: () => void;
  /** Show the placement controls (always, when no saved track is selected). */
  placing: boolean;
  onPlacing: (on: boolean) => void;
  onFitFile: (file: File) => void;
  /** Result of fitting a GPX, good or bad. */
  notice: { kind: 'ok' | 'error'; text: string } | null;
}

const LENGTHS = TRACK_LENGTHS.map((m) => ({ value: String(m), label: `${m} m` }));
const fieldClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm aria-invalid:border-red-400 md:min-h-9 dark:border-slate-700 dark:bg-slate-950';
const buttonClass =
  'min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 md:min-h-9 dark:border-slate-700 dark:hover:bg-slate-800';
const labelClass = 'shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400';

const fmtLaps = (laps: number): string => String(+laps.toFixed(2));

/** Generated running track: which one (saved / fitted / placed by hand), and how many laps. */
export function TrackInput(props: TrackInputProps) {
  const selectId = useId();
  const fileId = useId();
  const lapsId = useId();
  const centerId = useId();
  const errorId = useId();
  const headingId = useId();
  const error = props.lapsError ?? props.centerError;
  const selected = props.savedTracks.find((t) => t.id === props.selectedId) ?? null;
  const showPlacement = props.placing || !selected;
  const canSave = props.centerText.trim() !== '' && props.centerError === null;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor={selectId} className="sr-only">
          Saved track
        </label>
        <select
          id={selectId}
          value={props.selectedId ?? ''}
          onChange={(e) => props.onSelect(e.target.value === '' ? null : e.target.value)}
          className={`${fieldClass} pr-8`}
        >
          <option value="">
            {props.savedTracks.length === 0 ? 'No saved tracks yet' : 'New track…'}
          </option>
          {props.savedTracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.lengthM} m)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={props.onSave}
          disabled={!canSave || (selected !== null && !props.modified)}
          title={selected ? 'Save changes to this track' : 'Remember this track on this device'}
          className={buttonClass}
        >
          {selected && props.modified ? 'Update' : 'Save'}
        </button>
        {selected && (
          <button
            type="button"
            onClick={props.onDelete}
            aria-label={`Delete saved track ${selected.name}`}
            title="Delete this saved track"
            className={buttonClass}
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="shrink-0">
          <SegmentedControl
            legend="Track length"
            value={String(props.lengthM)}
            options={LENGTHS}
            onChange={(v) => props.onLength(Number(v) as TrackLength)}
          />
        </div>
        <label htmlFor={lapsId} className={`${labelClass} ml-1`}>
          Laps
        </label>
        <input
          id={lapsId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={props.lapsText}
          placeholder={
            props.suggestedLaps === null ? 'e.g. 12.5' : `${fmtLaps(props.suggestedLaps)} (splits)`
          }
          title="Blank = match your splits. Half laps start on the far side; every run finishes on the line."
          onChange={(e) => props.onLapsText(e.target.value)}
          aria-invalid={props.lapsError ? true : undefined}
          aria-describedby={props.lapsError ? errorId : undefined}
          className={fieldClass}
        />
      </div>

      {showPlacement ? (
        <>
          <div className="flex flex-wrap gap-2 md:flex-nowrap">
            <label htmlFor={centerId} className="sr-only">
              Track location (latitude, longitude)
            </label>
            <input
              id={centerId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="Click the map, or lat, lon"
              value={props.centerText}
              onChange={(e) => props.onCenterText(e.target.value)}
              aria-invalid={props.centerError ? true : undefined}
              aria-describedby={props.centerError ? errorId : undefined}
              className={`${fieldClass} basis-full font-mono md:basis-auto`}
            />
            <button
              type="button"
              onClick={props.onLocate}
              disabled={props.locating}
              className={`${buttonClass} flex-1 md:flex-none`}
            >
              {props.locating ? 'Locating…' : 'My location'}
            </button>
            <input
              id={fileId}
              type="file"
              accept=".gpx,.tcx,application/gpx+xml,application/octet-stream,text/xml,application/xml"
              className="peer sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) props.onFitFile(file);
                e.target.value = '';
              }}
            />
            <label
              htmlFor={fileId}
              title="Place the track from a GPX that goes round it, e.g. a Strava activity on it"
              className={`${buttonClass} inline-flex flex-1 cursor-pointer items-center justify-center md:flex-none peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500`}
            >
              From GPX…
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor={headingId} className={labelClass}>
              Heading
            </label>
            <input
              id={headingId}
              type="range"
              min={0}
              max={359}
              step={1}
              value={props.headingDeg}
              onChange={(e) => props.onHeading(Number(e.target.value))}
              aria-valuetext={`${props.headingDeg} degrees`}
              className="min-h-11 min-w-0 flex-1 accent-orange-600 md:min-h-8"
            />
            <output htmlFor={headingId} className="w-10 shrink-0 text-right text-sm tabular-nums">
              {props.headingDeg}°
            </output>
            <button
              type="button"
              onClick={() => props.onHeading((props.headingDeg + 180) % 360)}
              title="Put the finish line on the other straight"
              className={buttonClass}
            >
              Flip
            </button>
            {selected && (
              <button type="button" onClick={() => props.onPlacing(false)} className={buttonClass}>
                Done
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">
            {props.centerText} · home straight {props.headingDeg}°
            {props.modified ? ' · changed' : ''}
          </span>
          <button
            type="button"
            onClick={() => props.onPlacing(true)}
            className="shrink-0 font-medium text-orange-600 underline dark:text-orange-400"
          >
            Adjust
          </button>
        </p>
      )}

      {(error ?? props.notice) && (
        <p
          id={errorId}
          role={error || props.notice?.kind === 'error' ? 'alert' : 'status'}
          className={`text-xs ${error || props.notice?.kind === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
        >
          {error ?? props.notice?.text}
        </p>
      )}
    </div>
  );
}
