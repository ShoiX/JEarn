import { monthLabel, previousMonth, type Day, type YearMonth } from './calendar';
import type { Currency } from './money';
import { formatMoney } from './money';
import type { ExpenseCategory, SubCategory } from './accounts';
import { spent, spentSub } from './budgets';
import type { Entry, Ledger } from './ledger';
import { dayLabel, type AmountKind, type Directory } from './screenLogic';

/** Progress-bar fill, 0..100. No (or negative) budget: full if anything was spent, else empty. */
export function barPercent(spentMinor: number, availableMinor: number): number {
  if (availableMinor <= 0) return spentMinor > 0 ? 100 : 0;
  return Math.min(100, (spentMinor / availableMinor) * 100);
}

/** Categories a month's screens list: active ones, ones archived after that month, or ones with spending in it. */
export const categoriesInView = (l: Ledger, cats: readonly ExpenseCategory[], month: YearMonth): ExpenseCategory[] =>
  cats.filter((c) => !c.archivedAt || c.archivedAt.slice(0, 7) > month || spent(l, c, month) !== 0);

/** Subcategories shown for a month: active ones, or archived ones with spending in it. */
export const subsInView = (l: Ledger, cat: ExpenseCategory, month: YearMonth): SubCategory[] =>
  cat.subs.filter((s) => !s.archivedAt || spentSub(l, s, month) !== 0);

/** The account's opening entry that has not been voided. */
export const openingEntry = (l: Ledger, accountId: string): Entry | undefined =>
  l.entries.find((e) => e.kind === 'opening' && (e.debitId === accountId || e.creditId === accountId) && !l.isVoided(e.id));

export interface Note { text: string; negative: boolean }
const signed = (c: Currency, n: number) => formatMoney(c, Math.abs(n), n < 0 ? 'minus' : 'plus');
const abbr = (m: YearMonth) => monthLabel(m, true).slice(0, 3);
const started = (cat: ExpenseCategory, month: YearMonth) => cat.rollover && cat.rollStart !== undefined && cat.rollStart < month;

/** Budgets-screen line under the bar, e.g. "+₱45.00 from Sep · ₱945.00 available". */
export function rolloverLine(cat: ExpenseCategory, carry: number, availableMinor: number, month: YearMonth, c: Currency): Note {
  if (!started(cat, month)) return { text: 'Rollover starts this month', negative: false };
  return { text: `${signed(c, carry)} from ${abbr(previousMonth(month))} · ${formatMoney(c, availableMinor)} available`, negative: carry < 0 };
}

/** Setup-screen note under the "Roll over to next month" switch (carry = carryover into `month`). */
export function rolloverNote(cat: ExpenseCategory, carry: number, month: YearMonth, c: Currency): Note {
  if (!cat.rollover) return { text: 'Unspent budget resets each month', negative: false };
  if (!started(cat, month)) return { text: 'Starts fresh this month', negative: false };
  return { text: `Carrying ${signed(c, carry)} into ${abbr(month)}`, negative: carry < 0 };
}

export interface Detail { kind: string; amountText: string; tone: AmountKind; rows: [string, string][] }

/** Content of the Transaction Detail sheet. */
export function detailRows(e: Entry, dir: Directory, c: Currency, todayDay: Day): Detail {
  const date: [string, string] = ['Date', dayLabel(e.date, todayDay)];
  const note: [string, string][] = e.note ? [['Note', e.note]] : [];
  if (e.kind === 'transfer') {
    return { kind: 'Transfer', amountText: formatMoney(c, e.amountMinor), tone: 'transfer',
      rows: [['From', dir.name(e.creditId)], ['To', dir.name(e.debitId)], date, ...note] };
  }
  if (e.kind === 'income') {
    return { kind: 'Income', amountText: formatMoney(c, e.amountMinor, 'plus'), tone: 'income',
      rows: [['Category', dir.name(e.creditId)], ['Account', dir.name(e.debitId)], date, ...note] };
  }
  const cat = dir.categoryName(e.debitId), sub = dir.name(e.debitId);
  return { kind: 'Expense', amountText: formatMoney(c, e.amountMinor, 'minus'), tone: 'expense',
    rows: [['Category', cat], ...(sub !== cat ? [['Subcategory', sub] as [string, string]] : []), ['Account', dir.name(e.creditId)], date, ...note] };
}
