import type { YearMonth } from './calendar';
import type { AccountClass } from './ledger';

// Reference data: editable (rename, budgets, archive), never deleted. Timestamps are ISO 8601 UTC strings.
export type AccountType = 'bank' | 'savings' | 'credit' | 'cash' | 'investment' | 'loan';
export const ACCOUNT_TYPES: readonly AccountType[] = ['bank', 'savings', 'credit', 'cash', 'investment', 'loan'];

/** The ledger class of an account type (they share names). */
export const accountClass = (t: AccountType): AccountClass => t;

export interface BudgetEntry { from: YearMonth; amountMinor: number }

interface Stamped { archivedAt?: string; createdAt: string; updatedAt: string }
export interface Account extends Stamped { id: string; name: string; type: AccountType }
export interface SubCategory extends Stamped { id: string; name: string; budgets: BudgetEntry[] }
export interface ExpenseCategory extends Stamped {
  id: string; name: string; budgets: BudgetEntry[]; rollover: boolean; rollStart?: YearMonth; subs: SubCategory[];
}
export interface IncomeCategory extends Stamped { id: string; name: string }

const stamps = () => { const t = new Date().toISOString(); return { createdAt: t, updatedAt: t }; };
const id = () => crypto.randomUUID();

// Factories with defaults; pass `over` to set anything (ids and timestamps included).
export const newAccount = (name: string, type: AccountType = 'bank', over: Partial<Account> = {}): Account =>
  ({ id: id(), name, type, ...stamps(), ...over });
export const newSubCategory = (name: string, over: Partial<SubCategory> = {}): SubCategory =>
  ({ id: id(), name, budgets: [], ...stamps(), ...over });
export const newExpenseCategory = (name: string, over: Partial<ExpenseCategory> = {}): ExpenseCategory =>
  ({ id: id(), name, budgets: [], rollover: false, subs: [], ...stamps(), ...over });
export const newIncomeCategory = (name: string, over: Partial<IncomeCategory> = {}): IncomeCategory =>
  ({ id: id(), name, ...stamps(), ...over });
