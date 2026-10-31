import { addDays, monthOf, today, weekdayIndex, type Day, type YearMonth } from './calendar';
import type { Account, ExpenseCategory, IncomeCategory } from './accounts';
import { liveAmount } from './amountInput';
import { budgetAt } from './budgets';
import { Ledger, LedgerError, OPENING_BALANCES_ID, type Entry, type EntryKind } from './ledger';
import { formatMoney, plainAmount, type Currency } from './money';

// ---- Reference-data helpers
/** Non-archived items (what pickers list). */
export const active = <T extends { archivedAt?: string }>(xs: readonly T[]): T[] => xs.filter((x) => !x.archivedAt);

/** Non-archived categories, each with only its non-archived subcategories (inputs untouched). */
export const pickable = (cats: readonly ExpenseCategory[]): ExpenseCategory[] =>
  active(cats).map((c) => ({ ...c, subs: active(c.subs) }));

export interface SubBudgetOverflow { subsTotalMinor: number; categoryMinor: number }

/** Non-null when the non-archived subcategory budgets for `month` add up to more than the category budget. */
export function subBudgetOverflow(cat: ExpenseCategory, month: YearMonth): SubBudgetOverflow | null {
  const subsTotalMinor = active(cat.subs).reduce((t, s) => t + budgetAt(s.budgets, month), 0);
  const categoryMinor = budgetAt(cat.budgets, month);
  return subsTotalMinor > categoryMinor ? { subsTotalMinor, categoryMinor } : null;
}

// Currency and import are only allowed while the ledger is empty.
export const canChangeCurrency = (l: Ledger) => l.entries.length === 0;
export const canImport = canChangeCurrency;

// ---- Home list
/** Resolves ids to names (archived items included, so history keeps its names). */
export interface Directory {
  name(id: string): string;
  /** The category name for an expense debit id (the id itself if it is a category). */
  categoryName(id: string): string;
}

export function makeDirectory(accounts: readonly Account[], expense: readonly ExpenseCategory[], income: readonly IncomeCategory[]): Directory {
  const names = new Map<string, string>([[OPENING_BALANCES_ID, 'Opening Balances']]);
  const parents = new Map<string, string>(); // subcategory id -> category name
  for (const a of accounts) names.set(a.id, a.name);
  for (const c of expense) {
    names.set(c.id, c.name);
    for (const s of c.subs) { names.set(s.id, s.name); parents.set(s.id, c.name); }
  }
  for (const c of income) names.set(c.id, c.name);
  const name = (id: string) => names.get(id) ?? '';
  return { name, categoryName: (id) => parents.get(id) ?? name(id) };
}

export type AmountKind = 'expense' | 'income' | 'transfer';
export interface HomeRow { id: string; title: string; meta: string; kind: AmountKind; amountText: string }
export interface DaySection { date: Day; label: string; rows: HomeRow[] }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", otherwise "Tue 6 Oct". */
export function dayLabel(date: Day, todayDay: Day): string {
  if (date === todayDay) return 'Today';
  if (date === addDays(todayDay, -1)) return 'Yesterday';
  return `${WEEKDAYS[weekdayIndex(date)]} ${+date.slice(8, 10)} ${MONTH_ABBR[+date.slice(5, 7) - 1]}`;
}

/** Latest month the month switcher may reach: the current month, or a later one that holds an entry. */
export function lastNavMonth(l: Ledger, thisMonth: YearMonth): YearMonth {
  return l.entries.reduce((m, e) => (monthOf(e.date) > m ? monthOf(e.date) : m), thisMonth);
}

const join = (parts: string[]) => parts.filter(Boolean).join(' · ');

function row(e: Entry, dir: Directory, c: Currency): HomeRow {
  switch (e.kind) {
    case 'income':
      return { id: e.id, title: dir.name(e.creditId), meta: join([dir.name(e.debitId), e.note]), kind: 'income', amountText: formatMoney(c, e.amountMinor, 'plus') };
    case 'transfer':
      return { id: e.id, title: 'Transfer', meta: `${dir.name(e.creditId)} → ${dir.name(e.debitId)}`, kind: 'transfer', amountText: formatMoney(c, e.amountMinor) };
    default:
      return {
        id: e.id, title: dir.name(e.debitId), meta: join([dir.categoryName(e.debitId), dir.name(e.creditId), e.note]),
        kind: 'expense', amountText: formatMoney(c, e.amountMinor, 'minus'),
      };
  }
}

/** The month's visible entries grouped by day, newest first (date desc, then seq desc). */
export function homeSections(l: Ledger, month: YearMonth, dir: Directory, todayDay: Day, c: Currency): DaySection[] {
  const list = l.visibleEntries.filter((e) => monthOf(e.date) === month)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.seq - a.seq));
  const out: DaySection[] = [];
  for (const e of list) {
    let s = out.at(-1);
    if (s?.date !== e.date) out.push((s = { date: e.date, label: dayLabel(e.date, todayDay), rows: [] }));
    s.rows.push(row(e, dir, c));
  }
  return out;
}

// ---- Add Transaction draft
export type TxType = 'expense' | 'income' | 'transfer';
export type DraftErrorCode = 'invalidAmount' | 'missingAccount' | 'sameAccount' | 'missingCategory';
export class DraftError extends Error {
  constructor(readonly code: DraftErrorCode) { super(code); this.name = 'DraftError'; }
}

export interface TransactionDraft {
  type: TxType;
  expression: string;
  accountId?: string;
  toAccountId?: string;
  date: Day;
  note: string;
  /** Expense category or income category, depending on `type`. */
  categoryId?: string;
  subcategoryId?: string;
}

export const newDraft = (type: TxType, date: Day, accountId?: string, toAccountId?: string): TransactionDraft => ({
  type, expression: '', date, note: '', ...(accountId && { accountId }), ...(toAccountId && { toAccountId }),
});

export function validateDraft(d: TransactionDraft, c: Currency, now: Date, timeZone?: string): void {
  if (liveAmount(d.expression, c) <= 0) throw new DraftError('invalidAmount');
  if (!d.accountId || (d.type === 'transfer' && !d.toAccountId)) throw new DraftError('missingAccount');
  if (d.type === 'transfer' && d.accountId === d.toAccountId) throw new DraftError('sameAccount');
  if (d.type === 'expense' ? !(d.categoryId || d.subcategoryId) : d.type === 'income' && !d.categoryId) {
    throw new DraftError('missingCategory');
  }
}

export function isValidDraft(d: TransactionDraft, c: Currency, now: Date, timeZone?: string): boolean {
  try { validateDraft(d, c, now, timeZone); return true; } catch { return false; }
}

interface PostFields { kind: EntryKind; debit: string; credit: string; amountMinor: number; date: Day; note: string }
/** The ledger fields a draft posts, with the debit/credit mapping from ledger.md. */
function draftFields(d: TransactionDraft, c: Currency): PostFields {
  const account = d.accountId!;
  const [kind, debit, credit]: [EntryKind, string, string] =
    d.type === 'expense' ? ['expense', (d.subcategoryId ?? d.categoryId)!, account]
      : d.type === 'income' ? ['income', account, d.categoryId!]
        : ['transfer', d.toAccountId!, account];
  return { kind, debit, credit, amountMinor: liveAmount(d.expression, c), date: d.date, note: d.note.trim() };
}

/** Validates, then posts. */
export function postDraft(l: Ledger, d: TransactionDraft, c: Currency, now: Date, timeZone?: string): Entry {
  validateDraft(d, c, now, timeZone);
  return l.post({ ...draftFields(d, c), now, timeZone });
}

// ---- Edit a transaction (void + repost)
/** Only live expense/income/transfer entries can be edited. */
export function canEdit(l: Ledger, id: string): boolean {
  return l.visibleEntries.some((e) => e.id === id);
}

/** Rebuilds the draft an entry was posted from; null for opening and reversal entries. */
export function draftFromEntry(e: Entry, expense: readonly ExpenseCategory[], c: Currency): TransactionDraft | null {
  const common = { expression: plainAmount(c, e.amountMinor), date: e.date, note: e.note };
  switch (e.kind) {
    case 'income': return { ...common, type: 'income', accountId: e.debitId, categoryId: e.creditId };
    case 'transfer': return { ...common, type: 'transfer', accountId: e.creditId, toAccountId: e.debitId };
    case 'expense': {
      const cat = expense.find((x) => x.id === e.debitId || x.subs.some((s) => s.id === e.debitId));
      const sub = cat?.id === e.debitId ? undefined : e.debitId;
      return { ...common, type: 'expense', accountId: e.creditId, categoryId: cat?.id ?? e.debitId, ...(sub && { subcategoryId: sub }) };
    }
    default: return null;
  }
}

/** True when saving `d` would post exactly what `e` already is (so an edit is a no-op). */
export function draftMatchesEntry(e: Entry, d: TransactionDraft, c: Currency): boolean {
  const f = draftFields(d, c);
  return f.kind === e.kind && f.debit === e.debitId && f.credit === e.creditId
    && f.amountMinor === e.amountMinor && f.date === e.date && f.note === e.note;
}

/** Validates `d` first (nothing is written if it is invalid), then voids `entryId` and posts the corrected entry. */
export function correctDraft(l: Ledger, entryId: string, d: TransactionDraft, c: Currency, now: Date, timeZone?: string): { reversal: Entry; posted: Entry } {
  const e = l.entries.find((x) => x.id === entryId);
  if (!e) throw new LedgerError('entryNotFound');
  if (e.kind === 'opening' || e.kind === 'reversal') throw new LedgerError('cannotEdit');
  if (l.isVoided(entryId)) throw new LedgerError('alreadyVoided');
  validateDraft(d, c, now, timeZone);
  const reversal = l.void(entryId, now);
  return { reversal, posted: postDraft(l, d, c, now, timeZone) };
}
