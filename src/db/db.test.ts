import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  Ledger, PHP, AUD, newAccount, newExpenseCategory, newIncomeCategory, newSubCategory,
} from '../core';
import {
  appendEntries, connect, importAll, writeBatch, loadAll, openDb, putAccount, putExpenseCat, putIncomeCat, putSettings,
} from './db';

const now = new Date('2026-10-27T12:00:00Z');
let n = 0;
const fresh = () => openDb(`jearn-test-${++n}`);
const ledgerWith = (count: number) => {
  const l = new Ledger();
  const a = newAccount('A');
  for (let i = 0; i < count; i++) l.postOpening({ account: a.id, accountClass: 'bank', amountMinor: 100 + i, date: '2026-10-01', now, timeZone: 'UTC' });
  return { l, a };
};

const fixture = () => {
  const l = new Ledger();
  const bank = newAccount('Bank');
  const food = newExpenseCategory('Food', { subs: [newSubCategory('Groceries')] });
  const pay = newIncomeCategory('Salary');
  l.postOpening({ account: bank.id, accountClass: 'bank', amountMinor: 50000, date: '2026-10-01', now, timeZone: 'UTC' });
  l.post({ kind: 'expense', date: '2026-10-02', debit: food.id, credit: bank.id, amountMinor: 1250, now, timeZone: 'UTC' });
  l.post({ kind: 'income', date: '2026-10-03', debit: bank.id, credit: pay.id, amountMinor: 90000, now, timeZone: 'UTC' });
  return { ledger: l, accounts: [bank], expenseCategories: [food], incomeCategories: [pay], currency: PHP };
};

describe('db', () => {
  it('empty database loads defaults', async () => {
    const s = await loadAll(await fresh());
    expect(s.ledger.entries).toEqual([]);
    expect(s.accounts).toEqual([]);
    expect(s.currency).toEqual(PHP);
  });

  it('appends entries and loads them ordered by seq', async () => {
    const db = await fresh();
    const { l } = ledgerWith(3);
    for (const e of [...l.entries].reverse()) await appendEntries(db, [e]);
    const s = await loadAll(db);
    expect(s.ledger.entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(s.ledger.entries).toEqual(l.entries);
  });

  it('the entries store is add-only: a duplicate id or seq is rejected', async () => {
    const db = await fresh();
    const { l } = ledgerWith(2);
    await appendEntries(db, [l.entries[0]!]);
    await expect(appendEntries(db, [l.entries[0]!])).rejects.toThrow();
    await expect(appendEntries(db, [{ ...l.entries[1]!, seq: 1 }])).rejects.toThrow();
    expect((await loadAll(db)).ledger.entries).toEqual([l.entries[0]]);
  });

  it('rejects a corrupt ledger (seq gap)', async () => {
    const db = await fresh();
    const { l } = ledgerWith(3);
    await appendEntries(db, [l.entries[0]!]);
    await appendEntries(db, [l.entries[2]!]);
    await expect(loadAll(db)).rejects.toThrow(/seq/);
  });

  it('reference data and settings are stored with put', async () => {
    const db = await fresh();
    const a = newAccount('Bank');
    await putAccount(db, a);
    await putAccount(db, { ...a, name: 'Renamed' });
    const cat = newExpenseCategory('Food', { subs: [newSubCategory('Coffee')] });
    await putExpenseCat(db, cat);
    const inc = newIncomeCategory('Pay');
    await putIncomeCat(db, inc);
    await putSettings(db, { currency: 'AUD' });
    const s = await loadAll(db);
    expect(s.accounts).toEqual([{ ...a, name: 'Renamed' }]);
    expect(s.expenseCategories).toEqual([cat]);
    expect(s.incomeCategories).toEqual([inc]);
    expect(s.currency).toEqual(AUD);
  });

  it('importAll writes everything when the ledger is empty, replacing reference data', async () => {
    const db = await fresh();
    await putAccount(db, newAccount('Stale'));
    const sample = fixture();
    await importAll(db, sample);
    const s = await loadAll(db);
    expect(s.ledger.entries).toEqual(sample.ledger.entries);
    expect(s.accounts.map((a) => a.name).sort()).toEqual(sample.accounts.map((a) => a.name).sort());
    expect(s.expenseCategories).toHaveLength(sample.expenseCategories.length);
    expect(s.incomeCategories).toHaveLength(sample.incomeCategories.length);
  });

  it('importAll refuses when entries exist and changes nothing', async () => {
    const db = await fresh();
    const { l } = ledgerWith(1);
    await appendEntries(db, [l.entries[0]!]);
    await expect(importAll(db, fixture())).rejects.toThrow(/empty/);
    const s = await loadAll(db);
    expect(s.ledger.entries).toEqual(l.entries);
    expect(s.accounts).toEqual([]);
  });
});

describe('appendEntries', () => {
  it('adds several entries in one transaction', async () => {
    const db = await fresh();
    const { l } = ledgerWith(3);
    await appendEntries(db, l.entries);
    expect((await loadAll(db)).ledger.entries).toEqual(l.entries);
  });
  it('writes none when one fails', async () => {
    const db = await fresh();
    const { l } = ledgerWith(3);
    await appendEntries(db, [l.entries[0]!]);
    const dup = { ...l.entries[2]!, seq: 1 }; // seq 1 already used
    await expect(appendEntries(db, [l.entries[1]!, dup])).rejects.toThrow();
    expect((await loadAll(db)).ledger.entries).toEqual([l.entries[0]]);
  });
});

describe('writeBatch', () => {
  it('writes an account and its entries together', async () => {
    const db = await fresh();
    const { l, a } = ledgerWith(2);
    await writeBatch(db, { accounts: [a], entries: l.entries });
    const s = await loadAll(db);
    expect(s.accounts).toEqual([a]);
    expect(s.ledger.entries).toEqual(l.entries);
  });

  it('stores nothing if one entry fails (account too)', async () => {
    const db = await fresh();
    const { l, a } = ledgerWith(2);
    await appendEntries(db, [l.entries[0]!]);
    const food = newExpenseCategory('Food');
    await expect(writeBatch(db, { accounts: [a], expenseCats: [food], entries: [l.entries[1]!, l.entries[0]!] })).rejects.toThrow();
    const s = await loadAll(db);
    expect(s.accounts).toEqual([]);
    expect(s.expenseCategories).toEqual([]);
    expect(s.ledger.entries).toEqual([l.entries[0]]);
  });
});

describe('connect', () => {
  it('reopens after the connection is closed and the write persists', async () => {
    const h = connect(`jearn-conn-${++n}`);
    let first!: IDBDatabase;
    await h.use(async (db) => { first = db; });
    first.close();
    const { l, a } = ledgerWith(1);
    await h.use((db) => writeBatch(db, { accounts: [a], entries: l.entries }));
    const s = await h.use((db) => loadAll(db));
    expect(s.accounts).toEqual([a]);
    expect(s.ledger.entries).toEqual(l.entries);
  });

  it('does not retry other errors', async () => {
    const h = connect(`jearn-conn-${++n}`);
    let calls = 0;
    await expect(h.use(async () => { calls++; throw new Error('boom'); })).rejects.toThrow('boom');
    expect(calls).toBe(1);
  });

  it('retries once on InvalidStateError, then gives up', async () => {
    const h = connect(`jearn-conn-${++n}`);
    let calls = 0;
    await expect(h.use(async () => { calls++; throw new DOMException('closing', 'InvalidStateError'); })).rejects.toThrow('closing');
    expect(calls).toBe(2);
  });
});
