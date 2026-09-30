import { useId, type ReactNode } from 'react';

interface CardProps {
  title: string;
  /** Extra content on the right of the title row. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, aside, className = '', children }: CardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className={`mb-2 flex items-center justify-between gap-2 ${aside ? 'min-h-9' : ''}`}>
        <h2
          id={id}
          className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
