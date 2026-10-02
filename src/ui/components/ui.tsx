import { useId, type ReactNode } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
}

/** Radio group drawn as the design's segmented control (arrow keys move the selection). */
export function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
  tall = false,
  className = '',
}: {
  legend: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
  tall?: boolean;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex gap-0.5 rounded-[7px] bg-line2 p-0.5">
        {options.map((o) => (
          <label key={o.value} className="flex min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={`flex w-full cursor-pointer items-center justify-center truncate rounded-[5px] px-2.5 text-[13px] font-medium whitespace-nowrap text-muted transition-colors peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-seg peer-focus-visible:ring-2 peer-focus-visible:ring-border ${tall ? 'h-10' : 'h-10 md:h-7'}`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Label stacked over its control, small and muted. */
export function Field({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-[5px] ${className}`}>
      <label htmlFor={htmlFor} className="text-xs text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A pressable chip (the track placement options); `on` marks the active one. */
export function Chip({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`h-11 cursor-pointer truncate rounded-md border px-1 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:ring-border focus-visible:outline-none md:h-[30px] ${on ? 'border-ink bg-ink-bg text-on-ink' : 'border-border bg-surface text-ink hover:bg-chip'}`}
    >
      {children}
    </button>
  );
}

/** "01  Route ............ meta" heading row. */
export function SectionHeader({
  n,
  title,
  id,
  right,
}: {
  n: string;
  title: string;
  id?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="font-mono text-[11px] font-medium text-faint">{n}</span>
      <h2 id={id} className="m-0 text-[13px] font-semibold">
        {title}
      </h2>
      {right !== undefined && <div className="ml-auto min-w-0">{right}</div>}
    </div>
  );
}

/** One desktop sidebar section: header, then its body. */
export function Section({
  n,
  title,
  right,
  last = false,
  children,
}: {
  n: string;
  title: string;
  right?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`flex flex-col gap-3 py-[18px] ${last ? 'pb-0' : 'border-b border-line2'}`}
    >
      <SectionHeader n={n} title={title} id={id} right={right} />
      {children}
    </section>
  );
}

/** The app mark: orange rounded square with a white ring (the Claude Design logo). */
export function Logo({ size = 22 }: { size?: number }) {
  // Same drawing as public/icons/icon.svg, so the header mark, favicon and app icon match.
  return (
    <svg aria-hidden viewBox="0 0 512 512" width={size} height={size} className="shrink-0">
      <rect width="512" height="512" rx="139.6" fill="#ea580c" />
      <circle cx="256" cy="256" r="69.8" fill="none" stroke="#fff" strokeWidth="46.5" />
    </svg>
  );
}
