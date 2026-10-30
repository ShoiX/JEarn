import { describe, expect, it } from 'vitest';
import { newExpenseCategory, newIncomeCategory } from './accounts';
import { Ledger, OPENING_BALANCES_ID } from './ledger';
import { monthReport, sixMonthReport } from './reports';
import { day, now, uid, UTC, ym } from './testSupport';

function setup() {
  const l = new Ledger([], uid);
  const bank = uid(), cash = uid(), rent = uid(), food = uid(), salary = uid();
  const spend = (amt: number, to: string, date: string) =>
    l.post({ kind: 'expense', date, debit: to, credit: bank, amountMinor: amt, now, timeZone: UTC });
  const earn = (amt: number, date: string) =>
    l.post({ kind: 'income', date, debit: bank, credit: salary, amountMinor: amt, now, timeZone: UTC });
  return { l, bank, cash, rent, food, salary, spend, earn, inc: [newIncomeCategory('Salary', { id: salary })] };
}

describe('reports', () => {
  it('empty month for transfers/openings', () => {
    const f = setup();
    f.l.post({ kind: 'opening', date: day(2026, 10, 27), debit: f.bank, credit: OPENING_BALANCES_ID, amountMinor: 5_000, now, timeZone: UTC });
    f.l.post({ kind: 'transfer', date: day(2026, 10, 27), debit: f.cash, credit: f.bank, amountMinor: 1_000, now, timeZone: UTC });
    const home = newExpenseCategory('Home', { id: f.rent });
    const r = monthReport(f.l, ym(2026, 10), [home], f.inc);
    expect(r).toMatchObject({ incomeMinor: 0, spentMinor: 0, categories: [] });
  });
  it('six months: window, averages over completed months, budget flag', () => {
    const f = setup();
    const cat = newExpenseCategory('Home', { id: f.rent, budgets: [{ from: ym(2026, 1), amountMinor: 1_000 }] });
    [5, 6, 7, 8, 9].forEach((m, i) => {
      f.spend(1_000 + i * 100, f.rent, day(2026, m)); // 1000..1400, avg 1200
      f.earn(5_000, day(2026, m));
    });
    f.spend(9_999, f.rent, day(2026, 10)); // current month excluded from averages
    f.earn(77_777, day(2026, 4)); // outside window
    const r = sixMonthReport(f.l, ym(2026, 10), [cat], f.inc);
    expect(r.months.map((m) => m.month)).toEqual([5, 6, 7, 8, 9, 10].map((m) => ym(2026, m)));
    expect(r.months.at(-1)?.spentMinor).toBe(9_999);
    expect(r.averageSpentMinor).toBe(1_200);
    expect(r.averageIncomeMinor).toBe(5_000);
    expect(r.categories[0]?.averageMinor).toBe(1_200);
    expect(r.categories[0]?.isOverBudget).toBe(true);
  });
  it('averages round half away from zero', () => {
    const f = setup();
    f.earn(7, day(2026, 9)); // 7/5 = 1.4 -> 1
    f.earn(3, day(2026, 8)); // total 10/5 = 2
    f.earn(5, day(2026, 7)); // 15/5 = 3
    f.earn(4, day(2026, 6)); // 19/5 = 3.8 -> 4
    f.earn(1, day(2026, 5)); // 20/5 = 4
    expect(sixMonthReport(f.l, ym(2026, 10), [], f.inc).averageIncomeMinor).toBe(4);
    f.earn(3, day(2026, 5)); // 23/5 = 4.6 -> 5
    expect(sixMonthReport(f.l, ym(2026, 10), [], f.inc).averageIncomeMinor).toBe(5);
    f.earn(1, day(2026, 5)); // 24/5 = 4.8; then 25/5 = 5
    f.earn(1, day(2026, 5));
    expect(sixMonthReport(f.l, ym(2026, 10), [], f.inc).averageIncomeMinor).toBe(5);
  });
  it('month report sorted with percent', () => {
    const f = setup();
    const a = newExpenseCategory('Home', { id: f.rent }), b = newExpenseCategory('Food', { id: f.food });
    f.spend(7_500, f.food, day(2026, 10));
    f.spend(2_500, f.rent, day(2026, 10));
    f.earn(20_000, day(2026, 10));
    const r = monthReport(f.l, ym(2026, 10), [a, b], f.inc);
    expect(r.categories.map((c) => c.name)).toEqual(['Food', 'Home']);
    expect(r.categories.map((c) => c.percent)).toEqual([75, 25]);
    expect(r.savedMinor).toBe(10_000);
  });
});
