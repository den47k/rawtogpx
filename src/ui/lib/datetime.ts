/** The browser's IANA time zone, e.g. `Europe/Kyiv`. */
export const localTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Epoch ms -> `YYYY-MM-DDTHH:mm[:ss]` for `<input type="datetime-local">`, in local time. */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.getSeconds() === 0 ? base : `${base}:${pad(d.getSeconds())}`;
}

/** `YYYY-MM-DDTHH:mm[:ss[.sss]]` in local time -> epoch ms; undefined if blank/invalid. */
export function parseLocalInputValue(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!m) return undefined;
  const [y, mo, d, h, mi, s = '0', frac = '0'] = m.slice(1) as [
    string,
    string,
    string,
    string,
    string,
    string?,
    string?,
  ];
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s, +frac.padEnd(3, '0'));
  // Reject rollovers like Feb 30.
  if (date.getMonth() !== +mo - 1 || date.getDate() !== +d) return undefined;
  return date.getTime();
}

/** Current time rounded down to the minute. */
export const nowToMinute = (now = Date.now()): number => Math.floor(now / 60_000) * 60_000;

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Local clock time, with the date only when it differs from `sameDayAs`. */
export function formatClock(ms: number, sameDayAs?: number): string {
  const sameDay =
    sameDayAs === undefined || new Date(ms).toDateString() === new Date(sameDayAs).toDateString();
  return (sameDay ? timeFmt : dateTimeFmt).format(ms);
}
