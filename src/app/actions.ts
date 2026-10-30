import {
  Ledger, accountClass, makeSnapshot, newAccount, newExpenseCategory, newIncomeCategory,
  newSubCategory, openingEntry, postDraft, previousMonth, setBudget, snapshotToJson, today, canChangeCurrency, currencyByCode,
  type Account, type AccountType, type Entry, type ExpenseCategory, type Imported, type IncomeCategory, type SubCategory,
  type TransactionDraft, type YearMonth,
} from '../core';
import {
  appendEntry, importAll, loadAll, putAccount, putExpenseCat, putIncomeCat, putSettings,
} from '../db/db';

export type Data = Imported;
export const APP_VERSION = '1.0.0';
export type Actions = ReturnType<typeof makeActions>;

const nowIso = () => new Date().toISOString();
const touch = <T extends { updatedAt: string }>(x: T): T => ({ ...x, updatedAt: nowIso() });
const swap = <T extends { id: string }>(xs: T[], x: T) => xs.map((y) => (y.id === x.id ? x : y));

/** Every user action: write to IndexedDB first (awaited), then update the in-memory state. Actions run one at a time. */
export function makeActions(db: IDBDatabase, getData: () => Data, commit: (d: Data) => void) {
  let chain: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };
  // After a failed multi-step write, trust the database over memory.
  const resync = async () => commit(await loadAll(db));

  const editAccount = (id: string, f: (a: Account) => Account) => run(async () => {
    const d = getData(); const a = d.accounts.find((x) => x.id === id); if (!a) return;
    const n = touch(f(a)); await putAccount(db, n); commit({ ...d, accounts: swap(d.accounts, n) });
  });
  const editCat = (id: string, f: (c: ExpenseCategory) => ExpenseCategory) => run(async () => {
    const d = getData(); const c = d.expenseCategories.find((x) => x.id === id); if (!c) return;
    const n = touch(f(c)); await putExpenseCat(db, n); commit({ ...d, expenseCategories: swap(d.expenseCategories, n) });
  });
  const editSub = (catId: string, subId: string, f: (s: SubCategory) => SubCategory) =>
    editCat(catId, (c) => ({ ...c, subs: c.subs.map((s) => (s.id === subId ? touch(f(s)) : s)) }));
  const editIncome = (id: string, f: (c: IncomeCategory) => IncomeCategory) => run(async () => {
    const d = getData(); const c = d.incomeCategories.find((x) => x.id === id); if (!c) return;
    const n = touch(f(c)); await putIncomeCat(db, n); commit({ ...d, incomeCategories: swap(d.incomeCategories, n) });
  });

  /** Runs ledger writes on a copy, appends the new entries to the database, then swaps the ledger in. */
  const withLedger = <T>(fn: (l: Ledger) => T, collect: (r: T) => Entry[]) => run(async () => {
    const d = getData(); const l = new Ledger(d.ledger.entries);
    const result = fn(l);
    try {
      for (const e of collect(result)) await appendEntry(db, e);
    } catch (err) { await resync(); throw err; }
    commit({ ...d, ledger: l });
    return result;
  });
  const fresh = (l: Ledger, before: number) => l.entries.slice(before);

  return {
    addAccount(name: string, type: AccountType, openingMinor: number) {
      return run(async () => {
        const d = getData(); const a = newAccount(name, type);
        await putAccount(db, a);
        const l = new Ledger(d.ledger.entries);
        const before = l.entries.length;
        if (openingMinor > 0) l.postOpening({ account: a.id, accountClass: accountClass(type), amountMinor: openingMinor, date: today(new Date()), now: new Date() });
        try { for (const e of fresh(l, before)) await appendEntry(db, e); } catch (err) { await resync(); throw err; }
        commit({ ...d, accounts: [...d.accounts, a], ledger: l });
      });
    },
    setAccountType: (id: string, type: AccountType) => editAccount(id, (a) => ({ ...a, type })),
    archiveAccount: (id: string, archived: boolean) => editAccount(id, ({ archivedAt: _x, ...a }) => (archived ? { ...a, archivedAt: nowIso() } : a)),
    /** Void the live opening entry (same date), then post the new one; 0 only voids. */
    correctOpening(id: string, amountMinor: number) {
      return run(async () => {
        const d = getData(); const a = d.accounts.find((x) => x.id === id); if (!a) return;
        const l = new Ledger(d.ledger.entries); const before = l.entries.length;
        const old = openingEntry(l, id); const now = new Date();
        if (old) l.void(old.id, now);
        if (amountMinor > 0) l.postOpening({ account: id, accountClass: accountClass(a.type), amountMinor, date: old?.date ?? today(now), now });
        try { for (const e of fresh(l, before)) await appendEntry(db, e); } catch (err) { await resync(); throw err; }
        commit({ ...d, ledger: l });
      });
    },

    addExpenseCategory: (name: string) => run(async () => {
      const d = getData(); const c = newExpenseCategory(name);
      await putExpenseCat(db, c); commit({ ...d, expenseCategories: [...d.expenseCategories, c] });
    }),
    addSubcategory: (catId: string, name: string) => editCat(catId, (c) => ({ ...c, subs: [...c.subs, newSubCategory(name)] })),
    archiveExpenseCategory: (id: string, archived: boolean) =>
      editCat(id, ({ archivedAt: _x, ...c }) => (archived ? { ...c, archivedAt: nowIso() } : c)),
    archiveSubcategory: (catId: string, subId: string, archived: boolean) =>
      editSub(catId, subId, ({ archivedAt: _x, ...s }) => (archived ? { ...s, archivedAt: nowIso() } : s)),
    setRollover: (id: string, on: boolean, thisMonth: YearMonth) =>
      editCat(id, ({ rollStart: _x, ...c }) => (on ? { ...c, rollover: true, rollStart: previousMonth(thisMonth) } : { ...c, rollover: false })),
    resetRollover: (id: string, thisMonth: YearMonth) => editCat(id, (c) => ({ ...c, rollStart: thisMonth })),
    /** Budget for `month` onward (earlier months keep theirs). */
    setBudget: (catId: string, subId: string | undefined, month: YearMonth, amountMinor: number) =>
      subId
        ? editSub(catId, subId, (s) => ({ ...s, budgets: setBudget(s.budgets, month, amountMinor) }))
        : editCat(catId, (c) => ({ ...c, budgets: setBudget(c.budgets, month, amountMinor) })),

    addIncomeCategory: (name: string) => run(async () => {
      const d = getData(); const c = newIncomeCategory(name);
      await putIncomeCat(db, c); commit({ ...d, incomeCategories: [...d.incomeCategories, c] });
    }),
    archiveIncomeCategory: (id: string, archived: boolean) =>
      editIncome(id, ({ archivedAt: _x, ...c }) => (archived ? { ...c, archivedAt: nowIso() } : c)),

    setCurrency: (code: string) => run(async () => {
      const d = getData(); const cur = currencyByCode(code);
      if (!cur || !canChangeCurrency(d.ledger)) return;
      await putSettings(db, { currency: cur.code }); commit({ ...d, currency: cur });
    }),

    /** Posts the draft; resolves to the new entry. */
    post: (draft: TransactionDraft) => withLedger(
      (l) => { const b = l.entries.length; postDraft(l, draft, getData().currency, new Date()); return l.entries.slice(b); },
      (es) => es,
    ).then((es) => es[0]!),
    voidEntry: (id: string) => withLedger((l) => { const b = l.entries.length; l.void(id, new Date()); return l.entries.slice(b); }, (es) => es),

    importData: (data: Data) => run(async () => { await importAll(db, data); commit(data); }),

    exportJson(): { name: string; text: string } {
      const d = getData(); const now = new Date();
      const text = snapshotToJson(makeSnapshot({
        ledger: d.ledger, accounts: d.accounts, expenseCategories: d.expenseCategories, incomeCategories: d.incomeCategories,
        currency: d.currency, appVersion: APP_VERSION, exportedAt: now,
      }));
      return { name: `jearn-${today(now)}.json`, text };
    },
  };
}

