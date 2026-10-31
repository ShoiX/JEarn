import { describe, expect, it } from 'vitest';
import { Ledger, OPENING_BALANCES_ID, type AccountClass } from './ledger';
import { day, expectCode, now, uid, UTC, ym } from './testSupport';

const SYDNEY = 'Australia/Sydney';
const KIRITIMATI = 'Pacific/Kiritimati';
const base = { date: day(2026, 10, 27), now, timeZone: UTC };
const mk = () => new Ledger([], uid);

describe('post validation', () => {
  it('rejects bad input and leaves ledger empty', () => {
    const l = mk(), a = uid(), b = uid();
    expectCode(() => l.post({ ...base, kind: 'expense', debit: a, credit: b, amountMinor: 0 }), 'invalidAmount');
    expectCode(() => l.post({ ...base, kind: 'expense', debit: a, credit: b, amountMinor: -5 }), 'invalidAmount');
    expectCode(() => l.post({ ...base, kind: 'expense', debit: a, credit: b, amountMinor: 1.5 }), 'invalidAmount');
    expectCode(() => l.post({ ...base, kind: 'transfer', debit: a, credit: a, amountMinor: 5 }), 'sameAccount');
    expectCode(() => l.post({ ...base, kind: 'reversal', debit: a, credit: b, amountMinor: 5 }), 'reversalNotPostable');
    expect(l.entries).toEqual([]);
  });
  it('seq and recordedAt', () => {
    const l = mk(), a = uid(), b = uid();
    const e1 = l.post({ ...base, kind: 'expense', date: day(2026, 1), debit: a, credit: b, amountMinor: 5 });
    const e2 = l.void(e1.id, now);
    expect([e1.seq, e2.seq]).toEqual([1, 2]);
    expect(e1.recordedAt).toBe('2026-10-27T12:00:00.000Z');
    expect(e2).toMatchObject({ debitId: b, creditId: a, date: e1.date, reverses: e1.id, kind: 'reversal' });
  });
  it('entries are frozen and the ledger exposes no mutators besides post/postOpening/void', () => {
    const l = mk();
    const e = l.post({ ...base, kind: 'expense', debit: uid(), credit: uid(), amountMinor: 5 });
    expect(Object.isFrozen(e)).toBe(true);
    expect(() => { (e as { amountMinor: number }).amountMinor = 9; }).toThrow(TypeError);
    expect(() => { (l.entries as unknown[]).push(1); }).toThrow(TypeError);
    expect(Object.getOwnPropertyNames(Ledger.prototype).sort())
      .toEqual(['assetBalance', 'balance', 'constructor', 'entries', 'isVoided', 'liabilityBalance',
        'monthlyNet', 'post', 'postOpening', 'visibleEntries', 'void'].sort());
  });
  it('uses crypto.randomUUID by default', () => {
    const e = new Ledger().post({ ...base, kind: 'expense', debit: uid(), credit: uid(), amountMinor: 5 });
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('void', () => {
  it('errors', () => {
    const l = mk();
    const e = l.post({ ...base, kind: 'expense', debit: uid(), credit: uid(), amountMinor: 5 });
    const r = l.void(e.id, now);
    expect(l.isVoided(e.id)).toBe(true);
    expectCode(() => l.void(e.id, now), 'alreadyVoided');
    expectCode(() => l.void(r.id, now), 'cannotVoidReversal');
    expectCode(() => l.void(uid(), now), 'entryNotFound');
    expect(l.entries.length).toBe(2);
  });
  it('visibleEntries hides voided, reversals and openings', () => {
    const l = mk(), a = uid(), b = uid();
    l.post({ ...base, kind: 'opening', debit: a, credit: OPENING_BALANCES_ID, amountMinor: 100 });
    const e1 = l.post({ ...base, kind: 'expense', debit: b, credit: a, amountMinor: 5 });
    const e2 = l.post({ ...base, kind: 'income', debit: a, credit: b, amountMinor: 7 });
    l.void(e1.id, now);
    expect(l.visibleEntries.map((e) => e.id)).toEqual([e2.id]);
  });
});

describe('balances', () => {
  it('asset and liability', () => {
    const l = mk(), bank = uid(), card = uid(), food = uid();
    l.post({ ...base, kind: 'opening', debit: bank, credit: OPENING_BALANCES_ID, amountMinor: 100_000 });
    l.post({ ...base, kind: 'opening', debit: OPENING_BALANCES_ID, credit: card, amountMinor: 30_000 });
    expect(l.assetBalance(bank)).toBe(100_000);
    expect(l.liabilityBalance(card)).toBe(30_000);
    l.post({ ...base, kind: 'expense', debit: food, credit: card, amountMinor: 2_500 });
    l.post({ ...base, kind: 'expense', debit: food, credit: bank, amountMinor: 1_000 });
    l.post({ ...base, kind: 'transfer', debit: card, credit: bank, amountMinor: 5_000 });
    expect(l.balance(bank, 'bank')).toBe(100_000 - 1_000 - 5_000);
    expect(l.balance(card, 'credit')).toBe(30_000 + 2_500 - 5_000);
  });
});

describe('post dates', () => {
  it('rejects non-calendar-day strings', () => {
    const l = mk();
    for (const date of ['2026-10-20T12:00:00Z', '2026-02-30', '']) {
      expectCode(() => l.post({ ...base, kind: 'expense', date, debit: uid(), credit: uid(), amountMinor: 5 }), 'dateNotCalendarDay');
    }
    expect(l.entries).toEqual([]);
  });
  it('accepts a future date; it counts in balances and in its own month', () => {
    const l = mk(), cat = uid(), bank = uid();
    l.post({ ...base, kind: 'expense', date: day(2026, 12, 28), debit: cat, credit: bank, amountMinor: 5 });
    expect(l.entries.length).toBe(1);
    expect(l.balance(bank, 'bank')).toBe(-5);
    expect(l.monthlyNet(new Set([cat]), ym(2026, 12))).toBe(5);
    expect(l.monthlyNet(new Set([cat]), ym(2026, 10))).toBe(0);
  });
  it('31 Oct stays in October in UTC+11', () => {
    const l = mk(), cat = uid();
    const n = new Date('2026-10-30T14:00:00Z'); // 31 Oct 01:00 local
    l.post({ kind: 'expense', date: day(2026, 10, 31), debit: cat, credit: uid(), amountMinor: 5, now: n, timeZone: SYDNEY });
    expect(l.monthlyNet(new Set([cat]), ym(2026, 10))).toBe(5);
    expect(l.monthlyNet(new Set([cat]), ym(2026, 11))).toBe(0);
  });
  it('local today in UTC+14 accepted, same date also accepted in UTC', () => {
    const l = mk();
    const n = new Date('2026-10-26T10:30:00Z'); // 27 Oct 00:30 local, still 26 Oct in UTC
    const p = { kind: 'expense' as const, date: day(2026, 10, 27), debit: uid(), credit: uid(), amountMinor: 5, now: n };
    l.post({ ...p, timeZone: KIRITIMATI });
    expect(l.entries.length).toBe(1);
    l.post({ ...p, timeZone: UTC });
    expect(l.entries.length).toBe(2);
  });
});

describe('postOpening', () => {
  it('direction follows class', () => {
    const l = mk(), bank = uid(), card = uid();
    const a = l.postOpening({ account: bank, accountClass: 'bank', amountMinor: 100_000, ...base });
    const b = l.postOpening({ account: card, accountClass: 'credit', amountMinor: 30_000, ...base });
    expect(a).toMatchObject({ kind: 'opening', debitId: bank, creditId: OPENING_BALANCES_ID });
    expect(b).toMatchObject({ kind: 'opening', debitId: OPENING_BALANCES_ID, creditId: card });
    expect(l.balance(bank, 'bank')).toBe(100_000);
    expect(l.balance(card, 'credit')).toBe(30_000);
  });
  it('rejects non-account classes', () => {
    for (const c of ['expense', 'income', 'equity'] as AccountClass[]) {
      expectCode(() => mk().postOpening({ account: uid(), accountClass: c, amountMinor: 5, ...base }), 'invalidOpeningClass');
    }
  });
  it('validates like post', () => {
    expectCode(() => mk().postOpening({ account: uid(), accountClass: 'cash', amountMinor: 0, ...base }), 'invalidAmount');
  });
  it('fixed Opening Balances id', () => {
    expect(OPENING_BALANCES_ID).toBe('00000000-0000-0000-0000-0000000000b0');
  });
});
