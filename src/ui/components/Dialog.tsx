import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Modal built on <dialog>: focus trapping and Esc come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  width = 480,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-40px)] rounded-xl bg-panel p-0 text-ink shadow-[0_20px_60px_rgba(16,22,30,.25)]"
      style={{ width: `min(${width}px, calc(100% - 40px))` }}
    >
      {open && (
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2.5 border-b border-line2 px-5 py-4">
            <h2 id={titleId} className="m-0 text-sm font-semibold">
              {title}
            </h2>
            {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto cursor-pointer rounded text-xs text-muted hover:text-ink"
            >
              Close
            </button>
          </div>
          {children}
          {footer}
        </div>
      )}
    </dialog>
  );
}
