// Calendar days ('YYYY-MM-DD') and months ('YYYY-MM') are plain strings, independent of time zone.
// Only today() depends on the device zone.
export type Day = string;
export type YearMonth = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const p2 = (n: number) => String(n).padStart(2, '0');
const p4 = (n: number) => String(n).padStart(4, '0');

const toUtc = (d: Day) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number): Day => new Date(ms).toISOString().slice(0, 10);

/** Strict real-date check (rejects 2026-02-30). */
export function isDay(s: string): boolean {
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

/** The calendar day at `now` in `timeZone` (default: the device's zone). */
export function today(now: Date, timeZone?: string): Day {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export const addDays = (d: Day, n: number): Day => fromUtc(toUtc(d) + n * 86_400_000);
/** 0 = Sunday. */
export const weekdayIndex = (d: Day): number => new Date(toUtc(d)).getUTCDay();

export const isYearMonth = (s: string): boolean => MONTH_RE.test(s);
export const monthOf = (d: Day): YearMonth => d.slice(0, 7);

function shift(ym: YearMonth, by: number): YearMonth {
  const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + by;
  return `${p4(Math.floor(t / 12))}-${p2((t % 12) + 1)}`;
}
export const nextMonth = (ym: YearMonth) => shift(ym, 1);
export const previousMonth = (ym: YearMonth) => shift(ym, -1);

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** "October 2026", or "Oct 2026" when short. */
export function monthLabel(ym: YearMonth, short = false): string {
  const name = MONTHS[+ym.slice(5, 7) - 1]!;
  return `${short ? name.slice(0, 3) : name} ${ym.slice(0, 4)}`;
}
