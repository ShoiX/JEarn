import { isDay, monthOf, today, type Day, type YearMonth } from './calendar';
import { isMinor } from './money';

export type EntryKind = 'expense' | 'income' | 'transfer' | 'opening' | 'reversal';
export type AccountClass = 'bank' | 'savings' | 'cash' | 'investment' | 'credit' | 'loan' | 'expense' | 'income' | 'equity';

export const isAsset = (c: AccountClass) => c === 'bank' || c === 'savings' || c === 'cash' || c === 'investment';
export const isLiability = (c: AccountClass) => c === 'credit' || c === 'loan';

/** The built-in equity account "Opening Balances" (fixed id). */
export const OPENING_BALANCES_ID = '00000000-0000-0000-0000-0000000000b0';

export interface Entry {
  readonly id: string;
  readonly seq: number;
  readonly kind: EntryKind;
  readonly date: Day;
  /** ISO 8601 UTC instant. */
  readonly recordedAt: string;
  readonly debitId: string;
  readonly creditId: string;
  readonly amountMinor: number;
  readonly note: string;
  readonly reverses?: string;
}

export type LedgerErrorCode =
  | 'invalidAmount' | 'sameAccount' | 'reversalNotPostable' | 'entryNotFound' | 'alreadyVoided'
  | 'cannotVoidReversal' | 'dateNotCalendarDay' | 'dateInFuture' | 'invalidOpeningClass';

export class LedgerError extends Error {
  constructor(readonly code: LedgerErrorCode) { super(code); this.name = 'LedgerError'; }
}

export interface PostInput {
  kind: EntryKind;
  date: Day;
  debit: string;
  credit: string;
  amountMinor: number;
  note?: string;
  now: Date;
  timeZone?: string;
}

export interface OpeningInput {
  account: string;
  accountClass: AccountClass;
  amountMinor: number;
  date: Day;
  now: Date;
  timeZone?: string;
}

/** Append-only double-entry ledger. `post`, `postOpening` and `void` are the only writes. */
export class Ledger {
  #entries: readonly Entry[];
  #newId: () => string;

  /** `entries` restores a saved ledger (already validated); `newId` is injectable for tests. */
  constructor(entries: readonly Entry[] = [], newId: () => string = () => crypto.randomUUID()) {
    this.#entries = Object.freeze(entries.map((e) => Object.freeze({ ...e })));
    this.#newId = newId;
  }

  get entries(): readonly Entry[] { return this.#entries; }

  post(i: PostInput): Entry {
    if (!isMinor(i.amountMinor) || i.amountMinor <= 0) throw new LedgerError('invalidAmount');
    if (i.debit === i.credit) throw new LedgerError('sameAccount');
    if (i.kind === 'reversal') throw new LedgerError('reversalNotPostable');
    if (!isDay(i.date)) throw new LedgerError('dateNotCalendarDay');
    if (i.date > today(i.now, i.timeZone)) throw new LedgerError('dateInFuture');
    return this.#append(i.kind, i.date, i.debit, i.credit, i.amountMinor, i.note ?? '', undefined, i.now);
  }

  /** Opening balance; direction follows the account class (asset: debit account, liability: credit it). */
  postOpening(i: OpeningInput): Entry {
    const c = i.accountClass;
    if (!isAsset(c) && !isLiability(c)) throw new LedgerError('invalidOpeningClass');
    const [debit, credit] = isAsset(c) ? [i.account, OPENING_BALANCES_ID] : [OPENING_BALANCES_ID, i.account];
    return this.post({ kind: 'opening', date: i.date, debit, credit, amountMinor: i.amountMinor, now: i.now, timeZone: i.timeZone });
  }

  /** Posts a reversal of `entryId` (same date and amount, debit/credit swapped). */
  void(entryId: string, now: Date): Entry {
    const e = this.#entries.find((x) => x.id === entryId);
    if (!e) throw new LedgerError('entryNotFound');
    if (e.kind === 'reversal') throw new LedgerError('cannotVoidReversal');
    if (this.isVoided(entryId)) throw new LedgerError('alreadyVoided');
    return this.#append('reversal', e.date, e.creditId, e.debitId, e.amountMinor, '', e.id, now);
  }

  #append(kind: EntryKind, date: Day, debitId: string, creditId: string, amountMinor: number,
    note: string, reverses: string | undefined, now: Date): Entry {
    const e: Entry = Object.freeze({
      id: this.#newId(), seq: (this.#entries.at(-1)?.seq ?? 0) + 1, kind, date, recordedAt: now.toISOString(),
      debitId, creditId, amountMinor, note, ...(reverses ? { reverses } : {}),
    });
    this.#entries = Object.freeze([...this.#entries, e]);
    return e;
  }

  isVoided(id: string): boolean { return this.#entries.some((e) => e.reverses === id); }

  /** Expense/income/transfer entries that are not voided (the Home list). */
  get visibleEntries(): Entry[] {
    const voided = new Set(this.#entries.flatMap((e) => (e.reverses ? [e.reverses] : [])));
    return this.#entries.filter((e) => (e.kind === 'expense' || e.kind === 'income' || e.kind === 'transfer') && !voided.has(e.id));
  }

  /** Σ debits − Σ credits on the account (all time). */
  #net(id: string): number {
    return this.#entries.reduce((s, e) => s + (e.debitId === id ? e.amountMinor : 0) - (e.creditId === id ? e.amountMinor : 0), 0);
  }
  assetBalance(id: string): number { return this.#net(id); }
  /** Amount owed: Σ credits − Σ debits. */
  liabilityBalance(id: string): number { return -this.#net(id) || 0; }
  balance(id: string, cls: AccountClass): number { return isLiability(cls) ? this.liabilityBalance(id) : this.assetBalance(id); }

  /** Σ debits − Σ credits over `ids` for entries dated in `month`. Reversals net out. */
  monthlyNet(ids: ReadonlySet<string>, month: YearMonth): number {
    return this.#entries.reduce((s, e) => monthOf(e.date) !== month ? s
      : s + (ids.has(e.debitId) ? e.amountMinor : 0) - (ids.has(e.creditId) ? e.amountMinor : 0), 0);
  }
}
