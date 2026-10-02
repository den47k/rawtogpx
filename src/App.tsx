import { useState } from 'react';
import { IntervalBuilderDialog } from './ui/components/IntervalBuilderDialog.tsx';
import { SavedTracksDialog } from './ui/components/SavedTracksDialog.tsx';
import { useMediaQuery } from './ui/hooks/useMediaQuery.ts';
import { DesktopLayout } from './ui/layouts/DesktopLayout.tsx';
import { MobileLayout } from './ui/layouts/MobileLayout.tsx';
import { useRebuilder } from './ui/useRebuilder.ts';

export default function App() {
  const r = useRebuilder();
  const desktop = useMediaQuery('(min-width: 768px)');
  const [dialog, setDialog] = useState<'builder' | 'saved' | null>(null);
  const openBuilder = () => setDialog('builder');
  const openSaved = () => setDialog('saved');
  const close = () => setDialog(null);

  return (
    <>
      {desktop ? (
        <DesktopLayout r={r} openBuilder={openBuilder} openSaved={openSaved} />
      ) : (
        <MobileLayout r={r} openBuilder={openBuilder} openSaved={openSaved} />
      )}

      <IntervalBuilderDialog
        open={dialog === 'builder'}
        onClose={close}
        onInsert={(line) =>
          r.setSplitsText((text) => (text.trim() === '' ? line : `${text.trimEnd()}\n${line}`))
        }
      />
      <SavedTracksDialog r={r} open={dialog === 'saved'} onClose={close} />

      {r.dragging && (
        <div className="pointer-events-none fixed inset-0 z-[2000] flex items-center justify-center bg-ink-bg/10 backdrop-blur-sm">
          <p className="m-0 rounded-xl border border-dashed border-border2 bg-panel px-8 py-6 text-sm font-medium shadow-[0_20px_60px_rgba(16,22,30,.25)]">
            Drop the GPX or TCX to load it
          </p>
        </div>
      )}
    </>
  );
}
