import { nextMonth, type YearMonth } from './calendar';
import type { BudgetEntry, ExpenseCategory, IncomeCategory, SubCategory } from './accounts';
import type { Ledger } from './ledger';

/** Latest entry with from <= month; if none, the earliest entry; no entries -> 0. */
export function budgetAt(budgets: readonly BudgetEntry[], month: YearMonth): number {
  const sorted = [...budgets].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  let v = sorted[0]?.amountMinor ?? 0;
  for (const e of sorted) if (e.from <= month) v = e.amountMinor;
  return v;
}

/** Removes entries with from >= month and adds {month, amount}: applies to `month` onward only. */
export const setBudget = (budgets: readonly BudgetEntry[], month: YearMonth, amountMinor: number): BudgetEntry[] =>
  [...budgets.filter((b) => b.from < month), { from: month, amountMinor }];

/** The category's own id plus its subcategories' ids (entries may debit either). */
const accountIds = (c: ExpenseCategory) => new Set([c.id, ...c.subs.map((s) => s.id)]);

/** Spent in an expense category (including subcategories) for the month. */
export const spent = (l: Ledger, c: ExpenseCategory, month: YearMonth) => l.monthlyNet(accountIds(c), month);
export const spentSub = (l: Ledger, s: SubCategory, month: YearMonth) => l.monthlyNet(new Set([s.id]), month);

/** Income for the month: credits − debits on income accounts. */
export const income = (l: Ledger, cats: readonly IncomeCategory[], month: YearMonth) =>
  -l.monthlyNet(new Set(cats.map((c) => c.id)), month) || 0;

export const totalSpent = (l: Ledger, cats: readonly ExpenseCategory[], month: YearMonth) =>
  cats.reduce((s, c) => s + spent(l, c, month), 0);

/** Accumulated (budget − spent) from rollStart up to month−1; 0 if rollover is off. */
export function carryover(l: Ledger, cat: ExpenseCategory, month: YearMonth): number {
  if (!cat.rollover || !cat.rollStart) return 0;
  let carry = 0;
  let m = cat.rollStart;
  for (let n = 0; m < month && n < 600; n++, m = nextMonth(m)) carry += budgetAt(cat.budgets, m) - spent(l, cat, m);
  return carry;
}

/** Available = budget + carryover. */
export const available = (l: Ledger, c: ExpenseCategory, month: YearMonth) =>
  budgetAt(c.budgets, month) + carryover(l, c, month);

/** Left to spend = total available − month expenses. */
export const leftToSpend = (l: Ledger, cats: readonly ExpenseCategory[], month: YearMonth) =>
  cats.reduce((s, c) => s + available(l, c, month), 0) - totalSpent(l, cats, month);

/** True once any category has a non-zero budget for the month (Home shows plain spending until then). */
export const hasBudgets = (cats: readonly ExpenseCategory[], month: YearMonth) =>
  cats.some((c) => budgetAt(c.budgets, month) > 0);
