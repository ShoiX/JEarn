import { describe, expect, it } from 'vitest';
import { needsStarter, starterCategories } from './starter';
import { Ledger } from './ledger';
import { newExpenseCategory } from './accounts';

const now = new Date('2026-10-31T08:00:00Z');

describe('starter categories', () => {
  const s = starterCategories(now);

  it('has common expense categories with subcategories, and income categories', () => {
    expect(s.expenseCategories.map((c) => c.name)).toContain('Food');
    expect(s.expenseCategories.find((c) => c.name === 'Food')!.subs.map((x) => x.name)).toContain('Groceries');
    expect(s.expenseCategories.every((c) => c.subs.length > 0)).toBe(true);
    expect(s.incomeCategories.map((c) => c.name)).toContain('Salary');
  });

  it('has no budgets, rollover off, and unique ids', () => {
    expect(s.expenseCategories.every((c) => c.budgets.length === 0 && !c.rollover && c.subs.every((x) => x.budgets.length === 0))).toBe(true);
    const ids = [...s.expenseCategories.flatMap((c) => [c.id, ...c.subs.map((x) => x.id)]), ...s.incomeCategories.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps list order with increasing createdAt', () => {
    const t = s.expenseCategories.map((c) => c.createdAt);
    expect([...t].sort()).toEqual(t);
    expect(new Set(t).size).toBe(t.length);
  });

  it('is only needed on a fresh install (no categories at all, empty ledger)', () => {
    expect(needsStarter({ ledger: new Ledger(), expenseCategories: [], incomeCategories: [] })).toBe(true);
    expect(needsStarter({ ledger: new Ledger(), expenseCategories: [newExpenseCategory('X', { archivedAt: now.toISOString() })], incomeCategories: [] })).toBe(false);
  });
});
