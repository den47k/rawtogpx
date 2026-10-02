import { useId, useRef, type RefObject } from 'react';
import { TRACK_LENGTHS, type TrackLength } from '../../core/track.ts';
import type { Rebuilder } from '../useRebuilder.ts';
import { Chip, Field, Segmented } from './ui.tsx';
import { btnLink, btnPrimary, btnSecondary, inputCls, toneBg, toneText } from '../lib/styles.ts';

// Android often reports GPX files as octet-stream.
const ACCEPT = '.gpx,.tcx,application/gpx+xml,application/octet-stream,text/xml,application/xml';
const fmtLaps = (laps: number): string => String(+laps.toFixed(2));

function FilePicker({
  inputRef,
  onFile,
  label,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  label: string;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      aria-label={label}
      tabIndex={-1}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = '';
      }}
    />
  );
}

// ---------------------------------------------------------------- 01 Route

export function RouteBody({ r, onManageSaved }: { r: Rebuilder; onManageSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = () => fileRef.current?.click();
  const ext = r.loaded?.fileName.split('.').pop()?.toUpperCase().slice(0, 3) ?? 'GPX';

  return (
    <>
      <Segmented
        legend="Route source"
        value={r.routeSource}
        options={[
          { value: 'file', label: 'GPX / TCX file' },
          { value: 'track', label: 'Running track' },
        ]}
        onChange={r.setRouteSource}
      />
      <FilePicker inputRef={fileRef} onFile={r.onFile} label="Route file" />

      {r.routeSource === 'file' &&
        (r.loaded ? (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-chip font-mono text-[9px] font-medium text-muted">
              {ext}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="truncate text-[13px] font-medium">{r.loaded.fileName}</div>
              <div className="font-mono text-[11px] text-muted">
                {r.routeMeta} · {r.loaded.route.points.length.toLocaleString('en-US')} points
                {r.loaded.route.hasElevation ? '' : ' · no elevation'}
              </div>
            </div>
            <button
              type="button"
              onClick={pick}
              className="ml-auto h-11 shrink-0 cursor-pointer rounded px-2.5 text-xs text-muted hover:text-ink md:h-[26px]"
            >
              Replace
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border2 bg-surface px-4 py-[22px] text-center">
            <div className="text-[13px] font-medium">Drop a GPX or TCX anywhere</div>
            <div className="text-xs text-muted">or share it from another app</div>
            <button type="button" onClick={pick} className={`${btnSecondary} mt-1 bg-panel px-3.5`}>
              Choose file
            </button>
          </div>
        ))}
      {r.routeSource === 'file' && r.routeError && (
        <p role="alert" className="m-0 text-xs text-bad">
          {r.routeError}
        </p>
      )}

      {r.routeSource === 'track' && <TrackBody r={r} onManageSaved={onManageSaved} />}
    </>
  );
}

function TrackBody({ r, onManageSaved }: { r: Rebuilder; onManageSaved: () => void }) {
  const fitRef = useRef<HTMLInputElement>(null);
  const lapsId = useId();
  const coordsId = useId();
  const headingId = useId();
  const hintId = useId();

  const notice = r.trackNotice;
  const hint: { tone: 'faint' | 'bad' | 'ok'; text: string } = (() => {
    if (r.centerError) return { tone: 'bad', text: r.centerError };
    if (notice && notice.tone === 'bad') return { tone: 'bad', text: notice.text };
    switch (r.placeMode) {
      case 'map':
        return {
          tone: 'faint',
          text: r.centerText
            ? `${r.centerText} · click to move`
            : 'Click the map where the track is',
        };
      case 'gps':
        return {
          tone: 'faint',
          text: r.locating ? 'Using device location…' : `${r.centerText} · device location`,
        };
      case 'fit':
        return notice
          ? { tone: 'ok', text: notice.text }
          : { tone: 'faint', text: 'Pick a GPX that goes round the track' };
      case 'coords':
        return { tone: 'faint', text: 'Latitude, longitude' };
      default:
        return { tone: 'faint', text: r.centerText || 'Choose how to place the track' };
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex min-w-0 flex-col gap-[5px]">
          <span className="text-xs text-muted" aria-hidden>
            Size
          </span>
          <Segmented
            legend="Track size"
            value={String(r.trackLengthM)}
            options={TRACK_LENGTHS.map((m) => ({ value: String(m), label: `${m} m` }))}
            onChange={(v) => r.setTrackLengthM(Number(v) as TrackLength)}
          />
        </div>
        <Field label="Laps" htmlFor={lapsId}>
          <input
            id={lapsId}
            inputMode="decimal"
            autoComplete="off"
            value={r.trackLapsText}
            onChange={(e) => r.setTrackLapsText(e.target.value)}
            placeholder={r.suggestedLaps === null ? 'Auto' : `Auto · ${fmtLaps(r.suggestedLaps)}`}
            title="Blank = match your splits. Half laps start on the far side; every run finishes on the line."
            aria-invalid={r.lapsError ? true : undefined}
            className={inputCls}
          />
        </Field>
      </div>
      {r.lapsError && <p className="m-0 text-xs text-bad">{r.lapsError}</p>}

      <div className="flex flex-col gap-[5px]">
        <span className="text-xs text-muted">Placement</span>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Chip
            on={r.placeMode === 'map'}
            onClick={() => r.setPlaceMode(r.placeMode === 'map' ? null : 'map')}
          >
            Click map
          </Chip>
          <Chip on={r.placeMode === 'coords'} onClick={() => r.setPlaceMode('coords')}>
            Coordinates
          </Chip>
          <Chip on={r.placeMode === 'gps'} onClick={r.locate}>
            My location
          </Chip>
          <Chip
            on={r.placeMode === 'fit'}
            onClick={() => fitRef.current?.click()}
            title="Place the track from a GPX that goes round it, e.g. a Strava activity on it"
          >
            Fit from GPX
          </Chip>
        </div>
        <FilePicker inputRef={fitRef} onFile={r.fitFromFile} label="GPX of the track" />
        {r.placeMode === 'coords' && (
          <>
            <label htmlFor={coordsId} className="sr-only">
              Track location (latitude, longitude)
            </label>
            <input
              id={coordsId}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="50.4501, 30.5234"
              value={r.centerText}
              onChange={(e) => r.setCenter(e.target.value)}
              aria-invalid={r.centerError ? true : undefined}
              aria-describedby={hintId}
              className={`${inputCls} mt-1`}
            />
          </>
        )}
        <div
          id={hintId}
          role={hint.tone === 'bad' ? 'alert' : 'status'}
          className={`pt-0.5 font-mono text-[11px] ${hint.tone === 'bad' ? 'text-bad' : hint.tone === 'ok' ? 'text-ok' : 'text-muted'}`}
        >
          {hint.text}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Field label="Home straight" htmlFor={headingId}>
          <div className="relative">
            <input
              id={headingId}
              type="number"
              inputMode="numeric"
              min={0}
              max={359}
              step={1}
              value={r.headingDeg}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) r.setHeadingDeg(((Math.round(v) % 360) + 360) % 360);
              }}
              title="Direction of running along the home straight (compass degrees)"
              className={`${inputCls} pr-7`}
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[13px] text-muted">
              °
            </span>
          </div>
        </Field>
        <button
          type="button"
          onClick={() => r.setHeadingDeg((r.headingDeg + 180) % 360)}
          title="Put the finish line on the other straight"
          className={btnSecondary}
        >
          Flip straight
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2">
        <span className="text-xs text-muted">Saved</span>
        <span className="truncate text-[13px] font-medium">{r.selectedTrack?.name ?? 'None'}</span>
        <button
          type="button"
          onClick={onManageSaved}
          className={`${btnSecondary} ml-auto bg-panel px-2.5 md:h-[26px]`}
        >
          Manage
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 02 Splits

const PLACEHOLDER = '1k 4:52\n2k 9:41\nrest 1:00\n6x400 @1:20 jog 200m 1:00';

export function SplitsBody({ r }: { r: Rebuilder }) {
  const textId = useId();
  const errorsId = useId();
  const lapId = useId();
  const lines = Math.max(6, r.splitsText.split('\n').length);
  const errLines = new Set(r.errors.map((e) => e.line));

  return (
    <>
      <div
        className={`grid grid-cols-[28px_minmax(0,1fr)] overflow-hidden rounded-lg border bg-surface focus-within:ring-2 focus-within:ring-border ${r.errors.length > 0 ? 'border-bad-line' : 'border-line'}`}
      >
        <div aria-hidden className="flex flex-col border-r border-line2 bg-gutter py-2.5">
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              className={`text-center font-mono text-[11px] leading-5 ${errLines.has(i + 1) ? 'font-semibold text-bad' : 'text-faint'}`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <label htmlFor={textId} className="sr-only">
          Splits
        </label>
        <textarea
          id={textId}
          value={r.splitsText}
          onChange={(e) => r.setSplitsText(e.target.value)}
          rows={lines}
          wrap="off"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={PLACEHOLDER}
          aria-invalid={r.errors.length > 0 ? true : undefined}
          aria-describedby={errorsId}
          className="resize-none overflow-x-auto overflow-y-hidden border-0 bg-transparent px-3 py-2.5 font-mono text-[13px] leading-5 whitespace-pre text-ink outline-none placeholder:text-faint"
        />
      </div>

      <div id={errorsId} aria-live="polite" className="flex flex-col gap-1 empty:hidden">
        {r.errors.map((e, i) => (
          <div key={i} className="grid grid-cols-[28px_1fr] gap-1.5 text-xs text-bad">
            <span className="font-mono text-[11px] leading-[18px] font-medium">
              {e.line === null ? '' : `L${e.line}`}
            </span>
            <span className="leading-[18px]">{e.message}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_108px] items-end gap-2.5">
        <div className="flex min-w-0 flex-col gap-[5px] text-xs text-muted">
          <span>
            Mode{' '}
            <span className="font-mono text-[11px] text-faint">
              {r.splitsText.trim() === '' ? '' : r.modeIsManual ? 'manual' : 'auto-detected'}
            </span>
            {r.suggestion && (
              <button
                type="button"
                onClick={() => r.setMode(r.suggestion!)}
                className={`${btnLink} ml-1 text-[11px]`}
              >
                · looks {r.suggestion === 'laps' ? 'per lap' : 'cumulative'}, switch
              </button>
            )}
          </span>
          <Segmented
            legend="Split mode"
            value={r.mode}
            options={[
              { value: 'cumulative', label: 'Cumulative' },
              { value: 'laps', label: 'Per lap' },
            ]}
            onChange={r.setMode}
          />
        </div>
        <Field label="Lap distance" htmlFor={lapId}>
          <input
            id={lapId}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="—"
            value={r.lapText}
            onChange={(e) => r.setLapText(e.target.value)}
            disabled={r.mode !== 'laps'}
            title={
              r.mode === 'laps'
                ? 'Optional: with a lap distance, each lap needs only a time'
                : 'Used in per-lap mode'
            }
            aria-invalid={r.lapError ? true : undefined}
            className={inputCls}
          />
        </Field>
      </div>
      {r.lapError && <p className="m-0 text-xs text-bad">{r.lapError}</p>}
    </>
  );
}

// ---------------------------------------------------------------- 03 Time

export function TimeBody({ r }: { r: Rebuilder }) {
  const inputId = useId();
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[104px_minmax(0,1fr)_auto]">
        <Segmented
          legend="The time entered is the run's"
          value={r.anchorKind}
          options={[
            { value: 'start', label: 'Start' },
            { value: 'finish', label: 'Finish' },
          ]}
          onChange={r.setAnchorKind}
          className="col-span-2 md:col-span-1"
        />
        <label htmlFor={inputId} className="sr-only">
          {r.anchorKind === 'start' ? 'Start time' : 'Finish time'}
        </label>
        <input
          id={inputId}
          type="datetime-local"
          step={1}
          value={r.anchorValue}
          onChange={(e) => r.setAnchorValue(e.target.value)}
          aria-invalid={r.anchorInvalid ? true : undefined}
          className={`${inputCls} px-2 font-sans tabular-nums`}
        />
        <button type="button" onClick={r.setAnchorNow} className={`${btnSecondary} px-2.5`}>
          Now
        </button>
      </div>
      <div
        aria-live="polite"
        className={`font-mono text-xs ${r.anchorInvalid ? 'text-bad' : 'text-muted'}`}
      >
        {r.anchorInvalid ? 'Enter a valid date and time.' : r.otherEnd}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 04 Options

export function OptionsBody({ r }: { r: Rebuilder }) {
  const sampleId = useId();
  const nameId = useId();
  return (
    <>
      <div className="flex flex-col gap-[5px]">
        <span className="text-xs text-muted" aria-hidden>
          If lengths differ
        </span>
        <Segmented
          legend="If route and splits differ in length"
          value={r.mismatch}
          options={[
            { value: 'scale', label: 'Stretch splits' },
            { value: 'trim', label: 'Cut route' },
          ]}
          onChange={r.setMismatch}
        />
      </div>
      {r.warnings.map((w) => (
        <div key={w} className="rounded-md bg-warn-bg px-2.5 py-2 text-xs text-warn">
          {w}
        </div>
      ))}
      <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-2.5">
        <Field label="Sample (s)" htmlFor={sampleId}>
          <input
            id={sampleId}
            type="number"
            inputMode="decimal"
            min={0.1}
            max={60}
            step={0.1}
            value={r.sampleText}
            onChange={(e) => r.setSampleText(e.target.value)}
            title="A point every N seconds, plus every route vertex. 1 s keeps Strava from auto-pausing."
            aria-invalid={r.sampleError ? true : undefined}
            className={inputCls}
          />
        </Field>
        <Field label="Activity name" htmlFor={nameId}>
          <input
            id={nameId}
            maxLength={100}
            autoComplete="off"
            placeholder={r.defaultName}
            value={r.activityName}
            onChange={(e) => r.setActivityName(e.target.value)}
            className={`${inputCls} font-sans`}
          />
        </Field>
      </div>
      {r.sampleError && <p className="m-0 text-xs text-bad">{r.sampleError}</p>}
    </>
  );
}

// ---------------------------------------------------------------- 05 Summary

export function SummaryBody({ r }: { r: Rebuilder }) {
  if (!r.summary) return <div className="text-xs text-faint">{r.summaryEmpty}</div>;
  return (
    <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line2 bg-line2">
      {r.summary.map((s) => (
        <div key={s.k} className="flex flex-col gap-[3px] bg-surface px-3 py-2.5">
          <dt className="text-[11px] text-muted">{s.k}</dt>
          <dd className="m-0 font-mono text-sm font-medium tracking-[-0.01em]">{s.v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- footer

export function StatusLine({ r }: { r: Rebuilder }) {
  return (
    <div role="status" className={`flex items-center gap-2 text-xs ${toneText[r.status.tone]}`}>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${toneBg[r.status.tone]}`} />
      <span className="min-w-0">{r.status.text}</span>
    </div>
  );
}

export function FormatToggle({ r, tall = false }: { r: Rebuilder; tall?: boolean }) {
  return (
    <Segmented
      legend="File format"
      value={r.format}
      options={[
        { value: 'gpx', label: 'GPX' },
        { value: 'tcx', label: 'TCX' },
      ]}
      onChange={r.setFormat}
      tall={tall}
    />
  );
}

export function DownloadButton({
  r,
  label = 'Download',
  className = '',
}: {
  r: Rebuilder;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={r.download}
      disabled={!r.canDownload}
      title={r.format === 'tcx' ? 'TCX has a lap per split, which Strava shows' : undefined}
      className={`${btnPrimary} ${className}`}
    >
      {label}
    </button>
  );
}
