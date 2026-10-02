import { useId, useState } from 'react';
import type { Rebuilder } from '../useRebuilder.ts';
import { Dialog } from './Dialog.tsx';
import { btnPrimary, btnSecondary, inputCls } from '../lib/styles.ts';

/** List, use, update, delete and save track placements (stored on this device). */
export function SavedTracksDialog({
  r,
  open,
  onClose,
}: {
  r: Rebuilder;
  open: boolean;
  onClose: () => void;
}) {
  const nameId = useId();
  const [name, setName] = useState('');
  const save = () => {
    if (r.saveTrack(name)) setName('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Saved tracks"
      subtitle="Stored on this device"
      width={520}
    >
      <div className="flex max-h-[50dvh] flex-col overflow-y-auto">
        {r.savedTracks.length === 0 && (
          <div className="border-b border-line3 px-5 py-4 text-xs text-faint">
            No saved tracks yet. Place a track, then save it below.
          </div>
        )}
        {r.savedTracks.map((t) => {
          const inUse = r.selectedTrack?.id === t.id;
          return (
            <div
              key={t.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line3 px-5 py-3 ${inUse ? 'bg-surface' : ''}`}
            >
              <div className="flex min-w-0 flex-col gap-[3px]">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">{t.name}</span>
                  <span className="font-mono text-[11px] text-muted">{t.lengthM} m</span>
                  {inUse && <span className="text-[11px] text-accent-text">In use</span>}
                </div>
                <div className="font-mono text-[11px] text-muted2">
                  {t.lat.toFixed(4)}, {t.lon.toFixed(4)} · {t.headingDeg}°
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (inUse) r.updateTrack(t);
                    else {
                      r.applyTrack(t);
                      onClose();
                    }
                  }}
                  disabled={inUse && !r.canSaveTrack}
                  title={inUse ? 'Overwrite with the current placement' : 'Use this track'}
                  className={`${btnSecondary} md:h-7`}
                >
                  {inUse ? 'Update' : 'Use'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete saved track “${t.name}”?`)) r.deleteTrack(t);
                  }}
                  className="h-11 cursor-pointer rounded-md px-2.5 text-xs text-bad hover:bg-bad-bg md:h-7"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-5 pt-3.5 pb-[18px]"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor={nameId} className="sr-only">
          Name for the current placement
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this placement"
          maxLength={60}
          className={`${inputCls} font-sans`}
        />
        <button
          type="submit"
          disabled={!r.canSaveTrack || name.trim() === ''}
          title={r.canSaveTrack ? undefined : 'Place a track first'}
          className={btnPrimary}
        >
          Save current
        </button>
      </form>
    </Dialog>
  );
}
