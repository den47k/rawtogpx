import { useId, useState, type ReactNode } from 'react';
import { formatDuration, formatPace } from '../../core/format.ts';
import { formatTableDistance } from '../lib/checkRows.ts';
import { MapPanel } from '../components/MapPanel.tsx';
import {
  DownloadButton,
  FormatToggle,
  OptionsBody,
  RouteBody,
  SplitsBody,
  StatusLine,
  TimeBody,
} from '../components/sections.tsx';
import { SplitCheckTable } from '../components/SplitCheck.tsx';
import { Logo } from '../components/ui.tsx';
import { btnLink } from '../lib/styles.ts';
import { localTimeZone } from '../lib/datetime.ts';
import type { Rebuilder } from '../useRebuilder.ts';

function Accordion({
  n,
  title,
  meta,
  open,
  onToggle,
  flush = false,
  children,
}: {
  n: string;
  title: string;
  meta: string;
  open: boolean;
  onToggle: () => void;
  flush?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="border-t border-line2">
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-4 text-left text-ink"
        >
          <span className="font-mono text-[11px] font-medium text-faint">{n}</span>
          <span className="text-sm font-semibold">{title}</span>
          <span className="ml-auto min-w-0 truncate font-mono text-xs font-normal text-muted">
            {meta}
          </span>
          <span aria-hidden className="w-3 text-center text-xs text-faint">
            {open ? '−' : '+'}
          </span>
        </button>
      </h2>
      {open && (
        <div id={id} className={`flex flex-col gap-3 pb-4 ${flush ? '' : 'px-4'}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/** < 768 px: map on top, a bottom sheet of collapsible sections, sticky download bar. */
export function MobileLayout({
  r,
  openBuilder,
  openSaved,
}: {
  r: Rebuilder;
  openBuilder: () => void;
  openSaved: () => void;
}) {
  const [open, setOpen] = useState<number>(r.route ? 1 : 0);
  const toggle = (i: number) => setOpen(open === i ? -1 : i);
  const lines = r.splitsText.split('\n').filter((l) => l.trim() !== '').length;

  const stats = [
    { k: 'Distance', v: r.stated !== undefined ? formatTableDistance(r.stated) : '—' },
    {
      k: 'Time',
      v: r.timing ? formatDuration(r.timing.totalS, r.timing.totalS % 1 ? 1 : 0) : '—',
    },
    {
      k: 'Pace',
      v:
        r.timing && r.stated !== undefined
          ? formatPace(r.movingS / (r.stated / 1000)).replace(' /km', '')
          : '—',
    },
  ];

  return (
    <div className="grid h-dvh grid-rows-[minmax(220px,38dvh)_minmax(0,1fr)_auto] bg-panel">
      <div className="relative isolate bg-map">
        <MapPanel r={r} showCard={false} legendClass="bottom-7" />
        <div className="pointer-events-none absolute top-3 left-3 z-[700] flex items-center gap-2 rounded-lg bg-panel/85 px-2.5 py-1.5 backdrop-blur">
          <Logo size={20} />
          <h1 className="m-0 text-sm font-semibold">GPX Rebuilder</h1>
        </div>
      </div>

      <div className="relative z-10 -mt-[18px] overflow-y-auto rounded-t-[18px] bg-panel shadow-[0_-6px_20px_rgba(20,28,38,.08)]">
        <div aria-hidden className="mx-auto mt-2 mb-1 h-1 w-9 rounded-sm bg-border2" />
        <dl className="m-0 grid grid-cols-3 gap-2 px-4 pt-2 pb-2">
          {stats.map((s) => (
            <div key={s.k} className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-muted">{s.k}</dt>
              <dd className="m-0 font-mono text-[15px] font-medium">{s.v}</dd>
            </div>
          ))}
        </dl>
        <div className="px-4 pb-3">
          <StatusLine r={r} />
        </div>

        <Accordion
          n="01"
          title="Route"
          meta={r.routeSource === 'file' ? (r.loaded?.fileName ?? 'None') : r.routeMeta}
          open={open === 0}
          onToggle={() => toggle(0)}
        >
          <RouteBody r={r} onManageSaved={openSaved} />
        </Accordion>
        <Accordion
          n="02"
          title="Splits"
          meta={
            r.errors.length > 0
              ? `${r.errors.length} error${r.errors.length > 1 ? 's' : ''}`
              : lines === 0
                ? 'Empty'
                : `${lines} line${lines > 1 ? 's' : ''} · ${r.mode === 'laps' ? 'per lap' : 'cumulative'}`
          }
          open={open === 1}
          onToggle={() => toggle(1)}
        >
          <SplitsBody r={r} />
          <button type="button" onClick={openBuilder} className={`${btnLink} self-start py-2`}>
            Interval builder
          </button>
        </Accordion>
        <Accordion
          n="03"
          title="Time"
          meta={r.anchorInvalid ? 'Invalid' : r.otherEnd}
          open={open === 2}
          onToggle={() => toggle(2)}
        >
          <div className="text-xs text-muted">Local · {localTimeZone()}</div>
          <TimeBody r={r} />
        </Accordion>
        <Accordion
          n="04"
          title="Options"
          meta={`${r.mismatch === 'scale' ? 'Stretch' : 'Cut'} · ${r.sampleText || '?'} s`}
          open={open === 3}
          onToggle={() => toggle(3)}
        >
          <OptionsBody r={r} />
        </Accordion>
        <Accordion
          n="05"
          title="Split check"
          meta={
            r.rows.length === 0
              ? '—'
              : r.flagged > 0
                ? `${r.flagged} flagged`
                : `${r.rows.length}/${r.rows.length} ✓`
          }
          open={open === 4}
          onToggle={() => toggle(4)}
          flush
        >
          <SplitCheckTable r={r} compact />
        </Accordion>
      </div>

      <div className="grid grid-cols-[104px_1fr] gap-2.5 border-t border-line bg-panel px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <FormatToggle r={r} tall />
        <DownloadButton
          r={r}
          label={`Download ${r.format.toUpperCase()}`}
          className="h-11 rounded-lg text-sm md:h-11"
        />
      </div>
    </div>
  );
}
