import { describe, expect, it } from 'vitest';
import { newExpenseCategory, newIncomeCategory, newSubCategory, type BudgetEntry } from './accounts';
import {
  hasBudgets,
  available, budgetAt, carryover, income, leftToSpend, setBudget, spent, spentSub, totalSpent,
} from './budgets';
import { Ledger, OPENING_BALANCES_ID } from './ledger';
import { day, now, uid, UTC, ym } from './testSupport';

const be = (m: string, amountMinor: number): BudgetEntry => ({ from: m, amountMinor });

function fixture() {
  const ledger = new Ledger([], uid);
  const bank = uid(), cash = uid(), rent = uid(), food = uid(), coffee = uid(), salary = uid();
  const home = newExpenseCategory('Home', { id: rent, budgets: [be(ym(2026, 1), 50_000)] });
  const incomeCats = [newIncomeCategory('Salary', { id: salary })];
  const spend = (amt: number, to: string, date: string, from = bank, n = now) =>
    ledger.post({ kind: 'expense', date, debit: to, credit: from, amountMinor: amt, now: n, timeZone: UTC });
  const earn = (amt: number, date: string) =>
    ledger.post({ kind: 'income', date, debit: bank, credit: salary, amountMinor: amt, now, timeZone: UTC });
  return { ledger, bank, cash, rent, food, coffee, salary, home, incomeCats, spend, earn };
}

describe('budget history', () => {
  it('budgetAt and setBudget', () => {
    expect(budgetAt([], ym(2026, 1))).toBe(0);
    let b = [be(ym(2026, 3), 100)];
    expect(budgetAt(b, ym(2026, 1))).toBe(100); // before first entry -> earliest
    b = setBudget(b, ym(2026, 6), 200);
    expect(budgetAt(b, ym(2026, 5))).toBe(100);
    expect(budgetAt(b, ym(2026, 6))).toBe(200);
    expect(budgetAt(b, ym(2027, 1))).toBe(200);
    b = setBudget(b, ym(2026, 4), 300); // drops later entries
    expect(b.length).toBe(2);
    expect(budgetAt(b, ym(2026, 3))).toBe(100);
    expect(budgetAt(b, ym(2026, 4))).toBe(300);
    expect(budgetAt(b, ym(2026, 9))).toBe(300);
    b = setBudget(b, ym(2026, 3), 50); // replaces the same-month entry
    expect(b).toEqual([be(ym(2026, 3), 50)]);
  });
  it('setBudget does not mutate its input', () => {
    const b = [be(ym(2026, 3), 100)];
    setBudget(b, ym(2026, 3), 1);
    expect(b).toEqual([be(ym(2026, 3), 100)]);
  });
});

describe('aggregates', () => {
  it('spent, income and void', () => {
    const f = fixture();
    const coffee = newSubCategory('Coffee', { id: f.coffee });
    const food = newExpenseCategory('Food', { id: f.food, subs: [coffee] });
    f.spend(1_000, f.food, day(2026, 10));
    const c = f.spend(400, f.coffee, day(2026, 10));
    f.earn(9_000, day(2026, 10));
    expect(spent(f.ledger, food, ym(2026, 10))).toBe(1_400);
    expect(spentSub(f.ledger, coffee, ym(2026, 10))).toBe(400);
    expect(income(f.ledger, f.incomeCats, ym(2026, 10))).toBe(9_000);
    expect(spent(f.ledger, food, ym(2026, 9))).toBe(0);
    f.ledger.void(c.id, now);
    expect(spent(f.ledger, food, ym(2026, 10))).toBe(1_000);
    expect(spentSub(f.ledger, coffee, ym(2026, 10))).toBe(0);
  });
  it('backdated void nets the earlier month to zero', () => {
    const f = fixture();
    const e = f.spend(700, f.rent, day(2026, 8));
    f.ledger.void(e.id, new Date('2026-10-20T12:00:00Z')); // recorded in Oct, dated Aug
    expect(spent(f.ledger, f.home, ym(2026, 8))).toBe(0);
    expect(spent(f.ledger, f.home, ym(2026, 10))).toBe(0);
  });
  it('transfers and openings are excluded', () => {
    const f = fixture();
    f.ledger.post({ kind: 'opening', date: day(2026, 10, 27), debit: f.bank, credit: OPENING_BALANCES_ID, amountMinor: 5_000, now, timeZone: UTC });
    f.ledger.post({ kind: 'transfer', date: day(2026, 10, 27), debit: f.cash, credit: f.bank, amountMinor: 1_000, now, timeZone: UTC });
    expect(totalSpent(f.ledger, [f.home], ym(2026, 10))).toBe(0);
    expect(income(f.ledger, f.incomeCats, ym(2026, 10))).toBe(0);
  });
});

describe('rollover', () => {
  it('accumulates across months', () => {
    const f = fixture();
    const cat = newExpenseCategory('Home', { id: f.rent, budgets: [be(ym(2026, 1), 10_000)], rollover: true, rollStart: ym(2026, 7) });
    f.spend(7_000, f.rent, day(2026, 7)); // +3000
    f.spend(15_000, f.rent, day(2026, 8)); // -5000 -> carry -2000
    f.spend(2_000, f.rent, day(2026, 9)); // +8000 -> carry 6000
    f.spend(4_000, f.rent, day(2026, 10));
    const l = f.ledger;
    expect(carryover(l, cat, ym(2026, 7))).toBe(0);
    expect(carryover(l, cat, ym(2026, 8))).toBe(3_000);
    expect(carryover(l, cat, ym(2026, 9))).toBe(-2_000); // overspend goes negative
    expect(carryover(l, cat, ym(2026, 10))).toBe(6_000);
    expect(available(l, cat, ym(2026, 10))).toBe(16_000);
    expect(leftToSpend(l, [cat], ym(2026, 10))).toBe(12_000);
    expect(carryover(l, { ...cat, rollover: false }, ym(2026, 10))).toBe(0);
  });
  it('uses budget history and voids', () => {
    const f = fixture();
    const cat = newExpenseCategory('Home', { id: f.rent, budgets: [be(ym(2026, 1), 100)], rollover: true, rollStart: ym(2026, 1) });
    cat.budgets = setBudget(cat.budgets, ym(2026, 3), 200);
    const e = f.spend(100, f.rent, day(2026, 1));
    expect(carryover(f.ledger, cat, ym(2026, 4))).toBe(300); // Jan 0 + Feb 100 + Mar 200
    f.ledger.void(e.id, now);
    expect(carryover(f.ledger, cat, ym(2026, 4))).toBe(400); // Jan 100, Feb 100, Mar 200
  });
});

describe('hasBudgets (Home shows "Spent this month" until a budget is set)', () => {
  it('is false when no category has a budget for the month', () => {
    expect(hasBudgets([newExpenseCategory('Food'), newExpenseCategory('Bills')], ym(2026, 11))).toBe(false);
  });
  it('is true once any category has a non-zero budget', () => {
    const food = newExpenseCategory('Food', { budgets: [{ from: ym(2026, 11), amountMinor: 500000 }] });
    expect(hasBudgets([newExpenseCategory('Bills'), food], ym(2026, 11))).toBe(true);
  });
  it('ignores budgets set back to zero', () => {
    const food = newExpenseCategory('Food', { budgets: [{ from: ym(2026, 10), amountMinor: 500000 }, { from: ym(2026, 11), amountMinor: 0 }] });
    expect(hasBudgets([food], ym(2026, 11))).toBe(false);
  });
});
