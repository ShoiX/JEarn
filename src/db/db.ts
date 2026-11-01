import {
  DEFAULT_CURRENCY, Ledger, currencyByCode,
  type Account, type Entry, type ExpenseCategory, type Imported, type IncomeCategory,
} from '../core';

// Thin IndexedDB layer. The entries store is add-only: nothing here updates or deletes an entry.
// Reference data (accounts, categories, settings) is written with put.
const VERSION = 1;
const ENTRIES = 'entries', ACCOUNTS = 'accounts', EXPENSE = 'expenseCats', INCOME = 'incomeCats', SETTINGS = 'settings';

export interface Settings { currency: string }

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error('transaction failed'));
    tx.onabort = () => rej(tx.error ?? new Error('transaction aborted'));
  });

export function openDb(name = 'jearn'): Promise<IDBDatabase> {
  const r = indexedDB.open(name, VERSION);
  r.onupgradeneeded = () => {
    const db = r.result;
    db.createObjectStore(ENTRIES, { keyPath: 'id' }).createIndex('seq', 'seq', { unique: true });
    for (const s of [ACCOUNTS, EXPENSE, INCOME]) db.createObjectStore(s, { keyPath: 'id' });
    db.createObjectStore(SETTINGS, { keyPath: 'key' });
  };
  return req(r);
}

/** Everything in the database, validated: entries must run seq 1, 2, 3... with unique ids. */
export async function loadAll(db: IDBDatabase): Promise<Imported> {
  const tx = db.transaction([ENTRIES, ACCOUNTS, EXPENSE, INCOME, SETTINGS], 'readonly');
  const [entries, accounts, expenseCategories, incomeCategories, setting] = await Promise.all([
    req(tx.objectStore(ENTRIES).index('seq').getAll() as IDBRequest<Entry[]>),
    req(tx.objectStore(ACCOUNTS).getAll() as IDBRequest<Account[]>),
    req(tx.objectStore(EXPENSE).getAll() as IDBRequest<ExpenseCategory[]>),
    req(tx.objectStore(INCOME).getAll() as IDBRequest<IncomeCategory[]>),
    req(tx.objectStore(SETTINGS).get('currency') as IDBRequest<{ value: string } | undefined>),
  ]);
  entries.forEach((e, i) => { if (e.seq !== i + 1) throw new Error(`Ledger is corrupt: bad seq at position ${i + 1}`); });
  const byCreated = <T extends { createdAt: string }>(xs: T[]) => xs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return {
    ledger: new Ledger(entries), accounts: byCreated(accounts), expenseCategories: byCreated(expenseCategories),
    incomeCategories: byCreated(incomeCategories), currency: (setting && currencyByCode(setting.value)) || DEFAULT_CURRENCY,
  };
}

const clone = <T extends object>(v: T): T => JSON.parse(JSON.stringify(v));

export interface Batch { entries?: readonly Entry[]; accounts?: readonly Account[]; expenseCats?: readonly ExpenseCategory[]; incomeCats?: readonly IncomeCategory[] }

/** One user action = one readwrite transaction over just the stores needed: everything is written or nothing. Entries are add-only. */
export async function writeBatch(db: IDBDatabase, b: Batch): Promise<void> {
  const parts: [string, readonly object[] | undefined][] = [[ENTRIES, b.entries], [ACCOUNTS, b.accounts], [EXPENSE, b.expenseCats], [INCOME, b.incomeCats]];
  const used = parts.filter(([, xs]) => xs?.length);
  if (!used.length) return;
  const tx = db.transaction(used.map(([s]) => s), 'readwrite');
  const d = done(tx);
  for (const [s, xs] of used) for (const x of xs!) { const o = tx.objectStore(s); if (s === ENTRIES) o.add({ ...x }); else o.put(clone(x)); }
  await d;
}

export const appendEntries = (db: IDBDatabase, entries: readonly Entry[]) => writeBatch(db, { entries });

export interface Connection { use<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> }

/** Lazily opened, cached connection. iOS may close it in the background: on InvalidStateError (nothing was written) reopen and retry once. */
export function connect(name = 'jearn'): Connection {
  let cached: Promise<IDBDatabase> | null = null;
  const get = () => cached ??= openDb(name).then((db) => {
    const drop = () => { cached = null; };
    db.onclose = drop;
    db.onversionchange = () => { db.close(); drop(); };
    return db;
  }, (e) => { cached = null; throw e; });
  const isClosed = (e: unknown) => e instanceof DOMException && e.name === 'InvalidStateError';
  return {
    async use(fn) {
      try { return await fn(await get()); } catch (e) {
        if (!isClosed(e)) throw e;
        cached = null;
        return fn(await get());
      }
    },
  };
}

async function put(db: IDBDatabase, store: string, value: object): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  const d = done(tx);
  tx.objectStore(store).put(JSON.parse(JSON.stringify(value)));
  await d;
}
export const putAccount = (db: IDBDatabase, a: Account) => put(db, ACCOUNTS, a);
export const putExpenseCat = (db: IDBDatabase, c: ExpenseCategory) => put(db, EXPENSE, c);
export const putIncomeCat = (db: IDBDatabase, c: IncomeCategory) => put(db, INCOME, c);
export const putSettings = (db: IDBDatabase, s: Settings) => put(db, SETTINGS, { key: 'currency', value: s.currency });

/** Import: only while the ledger is empty. Replaces reference data; one transaction. */
export async function importAll(db: IDBDatabase, data: Imported): Promise<void> {
  const tx = db.transaction([ENTRIES, ACCOUNTS, EXPENSE, INCOME, SETTINGS], 'readwrite');
  const d = done(tx);
  const count = await req(tx.objectStore(ENTRIES).count());
  if (count > 0) { tx.abort(); await d.catch(() => {}); throw new Error('Can only import while the ledger is empty'); }
  for (const s of [ACCOUNTS, EXPENSE, INCOME]) tx.objectStore(s).clear();
  for (const e of data.ledger.entries) tx.objectStore(ENTRIES).add({ ...e });
  for (const a of data.accounts) tx.objectStore(ACCOUNTS).put(JSON.parse(JSON.stringify(a)));
  for (const c of data.expenseCategories) tx.objectStore(EXPENSE).put(JSON.parse(JSON.stringify(c)));
  for (const c of data.incomeCategories) tx.objectStore(INCOME).put(JSON.parse(JSON.stringify(c)));
  tx.objectStore(SETTINGS).put({ key: 'currency', value: data.currency.code });
  await d;
}
