/** Shared control styles from the design. Heights grow to 44 px touch targets on phones. */
export const inputCls =
  'h-11 w-full min-w-0 rounded-md border border-border bg-surface px-2.5 font-mono text-[13px] text-ink outline-none placeholder:text-faint focus-visible:border-muted2 focus-visible:ring-2 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-bad md:h-8';
export const btnSecondary =
  'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border2 bg-surface px-3 text-xs font-medium text-ink hover:bg-chip focus-visible:ring-2 focus-visible:ring-border focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:h-8';
export const btnPrimary =
  'inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-md bg-ink-bg px-4 text-[13px] font-medium text-on-ink hover:opacity-90 focus-visible:ring-2 focus-visible:ring-muted2 focus-visible:ring-offset-2 focus-visible:ring-offset-panel focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-faint disabled:hover:opacity-100 md:h-8';
export const btnLink =
  'cursor-pointer rounded text-xs font-medium text-accent-text hover:text-warn focus-visible:ring-2 focus-visible:ring-border focus-visible:outline-none';
export const monoMeta = 'font-mono text-xs text-muted';

export const toneText: Record<'faint' | 'bad' | 'accent' | 'ok', string> = {
  faint: 'text-faint',
  bad: 'text-bad',
  accent: 'text-accent-text',
  ok: 'text-ok',
};
export const toneBg: Record<'faint' | 'bad' | 'accent' | 'ok', string> = {
  faint: 'bg-faint',
  bad: 'bg-bad',
  accent: 'bg-accent-text',
  ok: 'bg-ok',
};
