interface DownloadBarProps {
  filename: string | null;
  disabled: boolean;
  onDownload: () => void;
}

/** Primary action: fixed to the bottom of the screen on mobile, bottom of the inputs column on desktop. */
export function DownloadBar({ filename, disabled, onDownload }: DownloadBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:bg-transparent md:px-0 md:pb-0 md:backdrop-blur-none dark:border-slate-800 dark:bg-slate-950/95 md:dark:bg-transparent">
      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-600 px-4 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:focus-visible:ring-offset-slate-950 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
      >
        Download GPX
      </button>
      <p className="mt-1 truncate text-center text-xs text-slate-500 dark:text-slate-400">
        {filename ?? 'Nothing to download yet'}
      </p>
    </div>
  );
}
