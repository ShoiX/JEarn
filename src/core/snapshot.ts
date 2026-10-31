import { isDay, isYearMonth, type Day } from './calendar';
import {
  ACCOUNT_TYPES, type Account, type BudgetEntry, type ExpenseCategory, type IncomeCategory, type SubCategory,
} from './accounts';
import { Ledger, OPENING_BALANCES_ID, type Entry, type EntryKind } from './ledger';
import { currencyByCode, isMinor, type Currency } from './money';

// The JSON backup/export format (docs/spec/backup.md). Encode/decode lives here, apart from the UI.
export const SCHEMA_VERSION = 1;

export type SnapshotErrorCode =
  | 'malformed' | 'unsupportedSchemaVersion' | 'duplicateId' | 'badSequence' | 'invalidAmount'
  | 'sameDebitCredit' | 'unknownAccount' | 'badReversal';

export class SnapshotError extends Error {
  constructor(readonly code: SnapshotErrorCode, readonly version?: number) { super(code); this.name = 'SnapshotError'; }
}

export interface EntryRecord {
  id: string; seq: number; kind: EntryKind; date: Day; recordedAt: string;
  debitId: string; creditId: string; debitName: string; creditName: string;
  amountMinor: number; note: string; reverses?: string;
}

export interface Snapshot {
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  currency: string;
  accounts: Account[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: IncomeCategory[];
  entries: EntryRecord[]; // ordered by seq
}

/** Domain values restored from a validated snapshot. */
export interface Imported {
  ledger: Ledger; accounts: Account[]; expenseCategories: ExpenseCategory[]; incomeCategories: IncomeCategory[]; currency: Currency;
}

export interface SnapshotInput {
  ledger: Ledger; accounts: Account[]; expenseCategories: ExpenseCategory[]; incomeCategories: IncomeCategory[];
  currency: Currency; appVersion: string; exportedAt: Date;
}

export function makeSnapshot(i: SnapshotInput): Snapshot {
  const names = new Map<string, string>([[OPENING_BALANCES_ID, 'Opening Balances']]);
  for (const a of i.accounts) names.set(a.id, a.name);
  for (const c of i.expenseCategories) { names.set(c.id, c.name); for (const s of c.subs) names.set(s.id, s.name); }
  for (const c of i.incomeCategories) names.set(c.id, c.name);
  const entries = [...i.ledger.entries].sort((a, b) => a.seq - b.seq).map((e): EntryRecord => {
    const debitName = names.get(e.debitId), creditName = names.get(e.creditId);
    if (debitName === undefined || creditName === undefined) throw new SnapshotError('unknownAccount');
    return { ...e, debitName, creditName };
  });
  return {
    schemaVersion: SCHEMA_VERSION, exportedAt: i.exportedAt.toISOString(), appVersion: i.appVersion, currency: i.currency.code,
    accounts: i.accounts, expenseCategories: i.expenseCategories, incomeCategories: i.incomeCategories, entries,
  };
}

const sortKeys = (_: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;

/** Pretty-printed JSON with sorted keys. */
export const snapshotToJson = (s: Snapshot): string => JSON.stringify(s, sortKeys, 2);

// ---- Decoding: strict structural checks, anything off is `malformed`.
type Rec = Record<string, unknown>;
const bad = (): never => { throw new SnapshotError('malformed'); };
const rec = (x: unknown): Rec => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Rec) : bad());
const str = (o: Rec, k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : bad());
const int = (o: Rec, k: string): number => (isMinor(o[k]) ? (o[k] as number) : bad());
const bool = (o: Rec, k: string): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : bad());
const list = <T>(o: Rec, k: string, f: (x: Rec) => T): T[] => (Array.isArray(o[k]) ? (o[k] as unknown[]).map((x) => f(rec(x))) : bad());
const iso = (o: Rec, k: string): string => { const s = str(o, k); return Number.isNaN(Date.parse(s)) ? bad() : s; };
const month = (o: Rec, k: string): string => { const s = str(o, k); return isYearMonth(s) ? s : bad(); };
const opt = <T>(o: Rec, k: string, f: (o: Rec, k: string) => T): { [x: string]: T } | object => (o[k] === undefined ? {} : { [k]: f(o, k) });

const stamped = (o: Rec) => ({ createdAt: iso(o, 'createdAt'), updatedAt: iso(o, 'updatedAt'), ...opt(o, 'archivedAt', iso) });
const budget = (o: Rec): BudgetEntry => ({ from: month(o, 'from'), amountMinor: int(o, 'amountMinor') });
const sub = (o: Rec): SubCategory => ({ id: str(o, 'id'), name: str(o, 'name'), budgets: list(o, 'budgets', budget), ...stamped(o) });
const decodeAccount = (o: Rec): Account => {
  const type = str(o, 'type');
  return { id: str(o, 'id'), name: str(o, 'name'), type: (ACCOUNT_TYPES as readonly string[]).includes(type) ? (type as Account['type']) : bad(), ...stamped(o) };
};
const expense = (o: Rec): ExpenseCategory => ({
  id: str(o, 'id'), name: str(o, 'name'), budgets: list(o, 'budgets', budget), rollover: bool(o, 'rollover'),
  ...opt(o, 'rollStart', month), subs: list(o, 'subs', sub), ...stamped(o),
});
const incomeCat = (o: Rec): IncomeCategory => ({ id: str(o, 'id'), name: str(o, 'name'), ...stamped(o) });

const KINDS: readonly string[] = ['expense', 'income', 'transfer', 'opening', 'reversal'];
const record = (o: Rec): EntryRecord => {
  const kind = str(o, 'kind');
  return {
    id: str(o, 'id'), seq: int(o, 'seq'), kind: KINDS.includes(kind) ? (kind as EntryKind) : bad(), date: str(o, 'date'),
    recordedAt: iso(o, 'recordedAt'), debitId: str(o, 'debitId'), creditId: str(o, 'creditId'),
    debitName: str(o, 'debitName'), creditName: str(o, 'creditName'), amountMinor: int(o, 'amountMinor'), note: str(o, 'note'),
    ...opt(o, 'reverses', str),
  };
};

/** Parses and validates `text`; rejects the whole file on any failure. */
export function importSnapshot(text: string): Imported {
  let o: Rec;
  try { o = rec(JSON.parse(text)); } catch { throw new SnapshotError('malformed'); }
  const s: Snapshot = {
    schemaVersion: int(o, 'schemaVersion'), exportedAt: iso(o, 'exportedAt'), appVersion: str(o, 'appVersion'), currency: str(o, 'currency'),
    accounts: list(o, 'accounts', decodeAccount), expenseCategories: list(o, 'expenseCategories', expense),
    incomeCategories: list(o, 'incomeCategories', incomeCat), entries: list(o, 'entries', record),
  };
  return validated(s);
}

function validated(s: Snapshot): Imported {
  if (s.schemaVersion !== SCHEMA_VERSION) throw new SnapshotError('unsupportedSchemaVersion', s.schemaVersion);
  const currency = currencyByCode(s.currency) ?? bad();
  const known = new Set([OPENING_BALANCES_ID, ...s.accounts.map((a) => a.id), ...s.incomeCategories.map((c) => c.id)]);
  for (const c of s.expenseCategories) { known.add(c.id); for (const x of c.subs) known.add(x.id); }
  const earlier = new Map<string, EntryRecord>();
  const reversed = new Set<string>();
  const entries: Entry[] = [];
  s.entries.forEach((r, i) => {
    if (r.seq !== i + 1) throw new SnapshotError('badSequence');
    if (earlier.has(r.id)) throw new SnapshotError('duplicateId');
    if (r.amountMinor <= 0) throw new SnapshotError('invalidAmount');
    if (r.debitId === r.creditId) throw new SnapshotError('sameDebitCredit');
    if (!known.has(r.debitId) || !known.has(r.creditId)) throw new SnapshotError('unknownAccount');
    if (!isDay(r.date)) throw new SnapshotError('malformed');
    if (r.kind === 'reversal') {
      const t = r.reverses === undefined ? undefined : earlier.get(r.reverses);
      if (!t || t.kind === 'reversal' || reversed.has(t.id) || r.debitId !== t.creditId || r.creditId !== t.debitId
        || r.amountMinor !== t.amountMinor || r.date !== t.date) throw new SnapshotError('badReversal');
      reversed.add(t.id);
    } else if (r.reverses !== undefined) {
      throw new SnapshotError('badReversal');
    }
    earlier.set(r.id, r);
    const { debitName: _d, creditName: _c, ...entry } = r;
    entries.push(entry);
  });
  return {
    ledger: new Ledger(entries), accounts: s.accounts, expenseCategories: s.expenseCategories,
    incomeCategories: s.incomeCategories, currency,
  };
}
