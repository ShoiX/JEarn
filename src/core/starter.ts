import { newExpenseCategory, newIncomeCategory, newSubCategory, type ExpenseCategory, type IncomeCategory } from './accounts';
import type { Ledger } from './ledger';

// Common starter categories, created once on a fresh install. Reference data: archive or add to them freely.
const EXPENSE: [string, string[]][] = [
  ['Housing', ['Rent', 'Electricity', 'Water', 'Internet', 'Repairs']],
  ['Food', ['Groceries', 'Dining out', 'Coffee', 'Snacks', 'Delivery']],
  ['Transport', ['Fuel', 'Public transit', 'Ride-hailing', 'Parking', 'Tolls', 'Car maintenance']],
  ['Bills', ['Mobile', 'Subscriptions']],
  ['Health', ['Doctor', 'Medicine', 'Fitness']],
  ['Personal', ['Clothing', 'Haircut', 'Grooming', 'Toiletries']],
  ['Shopping', ['Household', 'Electronics']],
  ['Entertainment', ['Movies', 'Events', 'Hobbies', 'Travel']],
  ['Family', ['Support', 'Gifts']],
  ['Giving', ['Donations']],
  ['Education', ['Tuition', 'Books', 'Courses']],
  ['Insurance', ['Health', 'Life', 'Vehicle']],
  ['Fees', ['Bank fees', 'Transfer fees']],
  ['Taxes', ['Income tax', 'Property tax']],
];
const INCOME = ['Salary', 'Bonus', 'Side income', 'Interest', 'Gifts received', 'Refunds', 'Other income'];

export function starterCategories(now: Date): { expenseCategories: ExpenseCategory[]; incomeCategories: IncomeCategory[] } {
  let tick = 0; // distinct, increasing timestamps keep the list order after a reload
  const stamp = () => { const t = new Date(now.getTime() + tick++).toISOString(); return { createdAt: t, updatedAt: t }; };
  return {
    expenseCategories: EXPENSE.map(([name, subs]) => {
      const s = stamp();
      return newExpenseCategory(name, { ...s, subs: subs.map((n) => newSubCategory(n, stamp())) });
    }),
    incomeCategories: INCOME.map((n) => newIncomeCategory(n, stamp())),
  };
}

/** Fresh install: no categories at all (archived ones count) and an empty ledger. */
export const needsStarter = (d: { ledger: Ledger; expenseCategories: readonly unknown[]; incomeCategories: readonly unknown[] }) =>
  d.ledger.entries.length === 0 && d.expenseCategories.length === 0 && d.incomeCategories.length === 0;
