import { previousMonth, type YearMonth } from './calendar';
import type { ExpenseCategory, IncomeCategory } from './accounts';
import { budgetAt, income, spent, totalSpent } from './budgets';
import type { Ledger } from './ledger';

export interface CategorySpend { id: string; name: string; spentMinor: number; percent: number } // percent 0..100
export interface MonthReport {
  incomeMinor: number;
  spentMinor: number;
  /** income − spent; negative means shortfall. */
  savedMinor: number;
  categories: CategorySpend[]; // descending by amount
}
export interface MonthTotals { month: YearMonth; incomeMinor: number; spentMinor: number }
export interface CategoryAverage { id: string; name: string; averageMinor: number; budgetMinor: number; isOverBudget: boolean }
export interface SixMonthReport {
  months: MonthTotals[]; // oldest first, last = current month
  averageIncomeMinor: number; // over the 5 completed months
  averageSpentMinor: number;
  categories: CategoryAverage[];
}

export function monthReport(l: Ledger, month: YearMonth, expense: readonly ExpenseCategory[], inc: readonly IncomeCategory[]): MonthReport {
  const rows = expense.map((c) => ({ c, s: spent(l, c, month) })).filter((r) => r.s > 0);
  const total = rows.reduce((t, r) => t + r.s, 0);
  const categories = rows
    .sort((a, b) => b.s - a.s || (a.c.name < b.c.name ? -1 : a.c.name > b.c.name ? 1 : 0))
    .map(({ c, s }) => ({ id: c.id, name: c.name, spentMinor: s, percent: (s / total) * 100 }));
  const incomeMinor = income(l, inc, month), spentMinor = totalSpent(l, expense, month);
  return { incomeMinor, spentMinor, savedMinor: incomeMinor - spentMinor, categories };
}

/** sum / 5 rounded half away from zero, in integers. */
const avg5 = (sum: number) => Math.sign(sum) * Math.floor((Math.abs(sum) * 2 + 5) / 10);

/** Current month plus the 5 before it; averages cover only the 5 completed months. */
export function sixMonthReport(l: Ledger, current: YearMonth, expense: readonly ExpenseCategory[], inc: readonly IncomeCategory[]): SixMonthReport {
  const months = [current];
  for (let i = 0; i < 5; i++) months.unshift(previousMonth(months[0]!));
  const totals = months.map((month) => ({ month, incomeMinor: income(l, inc, month), spentMinor: totalSpent(l, expense, month) }));
  const done = months.slice(0, -1), doneTotals = totals.slice(0, -1);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    months: totals,
    averageIncomeMinor: avg5(sum(doneTotals.map((t) => t.incomeMinor))),
    averageSpentMinor: avg5(sum(doneTotals.map((t) => t.spentMinor))),
    categories: expense.map((c) => {
      const averageMinor = avg5(sum(done.map((m) => spent(l, c, m))));
      const budgetMinor = budgetAt(c.budgets, current);
      return { id: c.id, name: c.name, averageMinor, budgetMinor, isOverBudget: averageMinor > budgetMinor };
    }),
  };
}
