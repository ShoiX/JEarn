import { describe, expect, it } from 'vitest';
import { newAccount, newExpenseCategory, newIncomeCategory, newSubCategory } from './accounts';
import { Ledger } from './ledger';
import { AUD, JPY, type Currency } from './money';
import { importSnapshot, makeSnapshot, snapshotToJson, SnapshotError, type Snapshot } from './snapshot';
import { day, expectCode, uid, UTC, ym } from './testSupport';

const NOW = new Date('2026-10-27T00:00:00Z'); // export instant and "now" for posting
const T = NOW.toISOString();

function world(currency: Currency = AUD) {
  const ledger = new Ledger([], uid);
  const stamps = { createdAt: T, updatedAt: T };
  const bank = newAccount('Bank', 'bank', { ...stamps });
  const card = newAccount('Card', 'credit', { ...stamps, archivedAt: T });
  const coffee = newSubCategory('Coffee', { ...stamps, budgets: [{ from: ym(2026, 1), amountMinor: 500 }] });
  const salary = newIncomeCategory('Salary', { ...stamps });
  const food = newExpenseCategory('Food', {
    ...stamps, budgets: [{ from: ym(2026, 1), amountMinor: 50_000 }], rollover: true, rollStart: ym(2026, 9), subs: [coffee],
  });
  const p = { now: NOW, timeZone: UTC };
  ledger.postOpening({ account: bank.id, accountClass: 'bank', amountMinor: 100_000, date: day(2026, 9, 1), ...p });
  ledger.postOpening({ account: card.id, accountClass: 'credit', amountMinor: 3_000, date: day(2026, 9, 1), ...p });
  const e = ledger.post({ kind: 'expense', date: day(2026, 10, 5), debit: coffee.id, credit: bank.id, amountMinor: 1250, note: 'flat white', ...p });
  ledger.post({ kind: 'income', date: day(2026, 10, 6), debit: bank.id, credit: salary.id, amountMinor: 9_000, ...p });
  ledger.post({ kind: 'transfer', date: day(2026, 10, 7), debit: card.id, credit: bank.id, amountMinor: 500, ...p });
  ledger.void(e.id, NOW);
  const snapshot = () => makeSnapshot({
    ledger, accounts: [bank, card], expenseCategories: [food], incomeCategories: [salary], currency, appVersion: '1.0', exportedAt: NOW,
  });
  return { ledger, bank, card, food, salary, snapshot };
}
const roundTrip = (s: Snapshot) => importSnapshot(snapshotToJson(s));

describe('snapshot format', () => {
  it('round trip gives equal data', () => {
    const w = world();
    const got = roundTrip(w.snapshot());
    expect(got.ledger.entries).toEqual(w.ledger.entries);
    expect(got.accounts).toEqual([w.bank, w.card]);
    expect(got.expenseCategories).toEqual([w.food]);
    expect(got.incomeCategories).toEqual([w.salary]);
    expect(got.currency).toEqual(AUD);
  });
  it('round trip JPY', () => {
    expect(roundTrip(world(JPY).snapshot()).currency).toEqual(JPY);
  });
  it('imported ledger is a working ledger', () => {
    const got = roundTrip(world().snapshot());
    expect(got.ledger.post({ kind: 'expense', date: day(2026, 10, 8), debit: uid(), credit: got.accounts[0]!.id, amountMinor: 1, now: NOW, timeZone: UTC }).seq).toBe(7);
  });
  it('json shape', () => {
    const w = world();
    const s = w.snapshot();
    const json = snapshotToJson(s);
    expect(s).toMatchObject({ schemaVersion: 1, appVersion: '1.0', currency: 'AUD' });
    expect(s.entries.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.entries[0]).toMatchObject({ debitName: 'Bank', creditName: 'Opening Balances' });
    expect(s.entries[1]).toMatchObject({ debitName: 'Opening Balances', creditName: 'Card' });
    expect(s.entries[2]).toMatchObject({ debitName: 'Coffee', creditName: 'Bank' });
    expect(json).toContain('"amountMinor": 1250');
    expect(json).toContain('"date": "2026-10-05"');
    expect(json).toContain('"from": "2026-01"');
    expect(json).toContain('"rollStart": "2026-09"');
    expect(json).toContain('"recordedAt": "2026-10-27T00:00:00.000Z"');
    expect(json).toContain('"exportedAt": "2026-10-27T00:00:00.000Z"');
    const keys = ['accounts', 'appVersion', 'currency', 'entries', 'expenseCategories', 'exportedAt', 'incomeCategories', 'schemaVersion'];
    const pos = keys.map((k) => json.indexOf(`\n  "${k}"`));
    expect(pos.every((p) => p > 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });
  it('unknown id at export throws', () => {
    const w = world();
    w.ledger.post({ kind: 'expense', date: day(2026, 10, 8), debit: uid(), credit: w.bank.id, amountMinor: 1, now: NOW, timeZone: UTC });
    expectCode(() => w.snapshot(), 'unknownAccount');
  });
});

describe('snapshot import validation', () => {
  const reject = (code: string, edit: (s: Snapshot) => void) => {
    const s = world().snapshot();
    edit(s);
    expectCode(() => roundTrip(s), code);
  };
  it('schema version', () => {
    const s = world().snapshot();
    s.schemaVersion = 2;
    let err: unknown;
    try { roundTrip(s); } catch (e) { err = e; }
    expect(err).toMatchObject({ code: 'unsupportedSchemaVersion', version: 2 });
  });
  it('seq gap', () => reject('badSequence', (s) => { s.entries[3]!.seq = 9; }));
  it('seq duplicate', () => reject('badSequence', (s) => { s.entries[1]!.seq = 1; }));
  it('seq must start at one', () => reject('badSequence', (s) => { s.entries.shift(); }));
  it('zero amount', () => reject('invalidAmount', (s) => { s.entries[2]!.amountMinor = 0; }));
  it('negative amount', () => reject('invalidAmount', (s) => { s.entries[2]!.amountMinor = -1; }));
  it('fractional amount', () => reject('malformed', (s) => { s.entries[2]!.amountMinor = 1.5; }));
  it('debit equals credit', () => reject('sameDebitCredit', (s) => { s.entries[2]!.creditId = s.entries[2]!.debitId; }));
  it('unknown debit', () => reject('unknownAccount', (s) => { s.entries[2]!.debitId = uid(); }));
  it('unknown credit', () => reject('unknownAccount', (s) => { s.entries[2]!.creditId = uid(); }));
  it('reversal of later entry', () => reject('badReversal', (s) => { s.entries[5]!.reverses = s.entries[5]!.id; }));
  it('reversal references unknown', () => reject('badReversal', (s) => { s.entries[5]!.reverses = uid(); }));
  it('reversal of reversal', () => reject('badReversal', (s) => {
    s.entries[4]!.kind = 'reversal';
    s.entries[4]!.reverses = s.entries[2]!.id;
    s.entries[5]!.reverses = s.entries[4]!.id;
  }));
  it('reversed twice', () => reject('badReversal', (s) => {
    s.entries[4]!.kind = 'reversal';
    s.entries[4]!.reverses = s.entries[2]!.id;
  }));
  it('reversal different amount', () => reject('badReversal', (s) => { s.entries[5]!.amountMinor = 1; }));
  it('reversal wrong direction', () => reject('badReversal', (s) => {
    const e = s.entries[5]!;
    [e.debitId, e.creditId] = [e.creditId, e.debitId];
  }));
  it('reversal different accounts', () => reject('badReversal', (s) => { s.entries[5]!.debitId = s.entries[1]!.creditId; }));
  it('reversal different date', () => reject('badReversal', (s) => { s.entries[5]!.date = '2026-10-06'; }));
  it('duplicate id', () => reject('duplicateId', (s) => { s.entries[3]!.id = s.entries[2]!.id; }));
  it('reversal without target', () => reject('badReversal', (s) => { delete s.entries[5]!.reverses; }));
  it('non-reversal with target', () => reject('badReversal', (s) => { s.entries[3]!.reverses = s.entries[2]!.id; }));
  it('date after export day', () => reject('dateAfterExport', (s) => { s.entries[2]!.date = '2026-10-28'; }));
  it('local today ahead of UTC allowed', () => {
    const s = world().snapshot();
    s.exportedAt = '2026-10-27T12:00:00.000Z'; // 28 Oct 02:00 in UTC+14
    s.entries[2]!.date = '2026-10-28';
    s.entries[5]!.date = '2026-10-28'; // keep the reversal mirroring its target
    expect(() => roundTrip(s)).not.toThrow();
  });
  it('bad date string', () => reject('malformed', (s) => { s.entries[2]!.date = '2026-02-30'; }));
  it('unknown currency', () => reject('malformed', (s) => { s.currency = 'XXX'; }));
  it('missing or mistyped fields', () => {
    reject('malformed', (s) => { delete (s as Partial<Snapshot>).entries; });
    reject('malformed', (s) => { (s.entries[0] as unknown as Record<string, unknown>).amountMinor = '5'; });
    reject('malformed', (s) => { s.entries[0]!.kind = 'bogus' as never; });
    reject('malformed', (s) => { s.accounts[0]!.type = 'bogus' as never; });
    reject('malformed', (s) => { s.exportedAt = 'yesterday'; });
    reject('malformed', (s) => { s.expenseCategories[0]!.budgets[0]!.from = '2026-1'; });
  });
  it('not JSON / not an object', () => {
    expectCode(() => importSnapshot('nope'), 'malformed');
    expectCode(() => importSnapshot('[]'), 'malformed');
    expect(new SnapshotError('malformed')).toBeInstanceOf(Error);
  });
});
