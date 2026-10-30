import { describe, expect, it } from 'vitest';
import { monthOf, previousMonth, today } from './calendar';
import { PHP } from './money';
import { generateSample } from './sample';
import { importSnapshot, makeSnapshot, snapshotToJson } from './snapshot';
import { pad, UTC } from './testSupport';

const mkIds = () => { let n = 0; return () => `00000000-0000-4000-8000-${pad(++n, 12)}`; };
const NOW = new Date('2026-10-27T12:00:00Z');
const gen = (now = NOW, seed?: number) => generateSample({ now, timeZone: UTC, seed, newId: mkIds() });

const snap = (s: ReturnType<typeof gen>) => makeSnapshot({ ...s, appVersion: 'test', exportedAt: NOW });

describe('generateSample', () => {
  it('builds reference data in PHP', () => {
    const s = gen();
    expect(s.currency).toBe(PHP);
    expect(s.accounts.map((a) => a.type)).toEqual(['bank', 'savings', 'credit', 'cash']);
    expect(s.expenseCategories.length).toBe(5);
    expect(s.expenseCategories.every((c) => c.subs.length > 0 && c.budgets.length === 1)).toBe(true);
    expect(s.expenseCategories.filter((c) => c.rollover).every((c) => c.rollStart)).toBe(true);
    expect(s.incomeCategories.map((c) => c.name)).toEqual(['Salary', 'Side income', 'Interest']);
  });
  it('produces a valid ledger that round-trips through snapshot validation', () => {
    const s = gen();
    const got = importSnapshot(snapshotToJson(snap(s)));
    expect(got.ledger.entries).toEqual(s.ledger.entries);
    expect(s.ledger.entries.length).toBeGreaterThan(50);
  });
  it('spans six months ending at today with no future dates', () => {
    const s = gen();
    const t = today(NOW, UTC);
    const months = new Set(s.ledger.entries.map((e) => monthOf(e.date)));
    let m = monthOf(t);
    for (let i = 0; i < 6; i++) { expect(months.has(m), m).toBe(true); m = previousMonth(m); }
    expect(months.size).toBe(6);
    expect(s.ledger.entries.every((e) => e.date <= t)).toBe(true);
    expect(s.ledger.entries.some((e) => monthOf(e.date) === monthOf(t))).toBe(true);
  });
  it('includes a voided entry and keeps balances plausible', () => {
    const s = gen();
    expect(s.ledger.entries.some((e) => e.kind === 'reversal')).toBe(true);
    for (const a of s.accounts) expect(s.ledger.balance(a.id, a.type), a.name).toBeGreaterThanOrEqual(0);
  });
  it('is deterministic for a seed and varies with it', () => {
    const j = (s: ReturnType<typeof gen>) => JSON.stringify(s.ledger.entries);
    expect(j(gen())).toBe(j(gen()));
    expect(j(gen(NOW, 5))).not.toBe(j(gen()));
  });
  it('handles the 1st of a month and year boundaries', () => {
    for (const iso of ['2026-11-01T12:00:00Z', '2027-01-31T12:00:00Z', '2026-03-01T00:30:00Z']) {
      const now = new Date(iso);
      const s = gen(now);
      expect(s.ledger.entries.every((e) => e.date <= today(now, UTC)), iso).toBe(true);
      expect(() => importSnapshot(snapshotToJson(makeSnapshot({ ...s, appVersion: 't', exportedAt: now })))).not.toThrow();
    }
  });
});
