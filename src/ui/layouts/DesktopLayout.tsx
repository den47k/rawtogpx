import { useId } from 'react';
import { MapPanel } from '../components/MapPanel.tsx';
import {
  DownloadButton,
  FormatToggle,
  OptionsBody,
  RouteBody,
  SplitsBody,
  StatusLine,
  SummaryBody,
  TimeBody,
} from '../components/sections.tsx';
import { SplitCheckTable } from '../components/SplitCheck.tsx';
import { Logo, Section } from '../components/ui.tsx';
import { btnLink, monoMeta } from '../lib/styles.ts';
import { localTimeZone } from '../lib/datetime.ts';
import type { Rebuilder } from '../useRebuilder.ts';

/** ≥ 768 px: inputs sidebar with a fixed download footer; map over the split check. */
export function DesktopLayout({
  r,
  openBuilder,
  openSaved,
}: {
  r: Rebuilder;
  openBuilder: () => void;
  openSaved: () => void;
}) {
  const checkId = useId();
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-bg">
      <header className="flex h-[52px] items-center gap-3.5 border-b border-line bg-panel px-4">
        <Logo />
        <h1 className="m-0 text-sm font-semibold tracking-[-0.01em]">GPX Rebuilder</h1>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] border-r border-line bg-panel">
          <div className="overflow-y-auto px-5 pt-1 pb-6">
            <Section n="01" title="Route" right={<span className={monoMeta}>{r.routeMeta}</span>}>
              <RouteBody r={r} onManageSaved={openSaved} />
            </Section>
            <Section
              n="02"
              title="Splits"
              right={
                <button type="button" onClick={openBuilder} className={btnLink}>
                  Interval builder
                </button>
              }
            >
              <SplitsBody r={r} />
            </Section>
            <Section
              n="03"
              title="Time"
              right={<span className="text-xs text-muted">Local · {localTimeZone()}</span>}
            >
              <TimeBody r={r} />
            </Section>
            <Section n="04" title="Options">
              <OptionsBody r={r} />
            </Section>
            <Section n="05" title="Summary" last>
              <SummaryBody r={r} />
            </Section>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line bg-panel px-5 py-3">
            <StatusLine r={r} />
            <div className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-2">
              <FormatToggle r={r} />
              <div className="truncate font-mono text-[11px] text-muted">{r.filename ?? '—'}</div>
              <DownloadButton r={r} />
            </div>
          </div>
        </aside>

        <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 p-3">
          <section
            aria-label="Map preview"
            className="relative isolate min-h-[280px] overflow-hidden rounded-[10px] border border-line bg-map"
          >
            <MapPanel r={r} />
          </section>
          <section
            aria-labelledby={checkId}
            className="max-h-[42vh] overflow-auto rounded-[10px] border border-line bg-surface"
          >
            <div className="sticky top-0 z-[2] flex h-[45px] items-baseline gap-2.5 border-b border-line2 bg-surface px-4 pt-3">
              <h2 id={checkId} className="m-0 text-[13px] font-semibold">
                Split check
              </h2>
              <span className="truncate text-xs text-muted">
                File read back and compared with your splits
              </span>
            </div>
            <SplitCheckTable r={r} />
          </section>
        </main>
      </div>
    </div>
  );
}
