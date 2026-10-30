import { monthOf, previousMonth, today, type Day, type YearMonth } from './calendar';
import {
  accountClass, newAccount, newExpenseCategory, newIncomeCategory, newSubCategory,
  type Account, type AccountType, type ExpenseCategory, type IncomeCategory,
} from './accounts';
import { Ledger, type EntryKind } from './ledger';
import { PHP, type Currency } from './money';

export interface SampleOptions {
  now: Date;
  timeZone?: string;
  seed?: number;
  /** Id generator (default crypto.randomUUID); inject for fully reproducible output. */
  newId?: () => string;
}
export interface Sample {
  ledger: Ledger; accounts: Account[]; expenseCategories: ExpenseCategory[]; incomeCategories: IncomeCategory[]; currency: Currency;
}

const SCALE = 15; // prototype amounts were dollar-sized; scale to plausible pesos
const pesos = (n: number) => Math.round(n * SCALE) * 100;

// [category, budget, [sub, budget, typical amount, entries per month]]
type SubSpec = [string, number, number, number];
const CATEGORIES: [string, number, SubSpec[]][] = [
  ['Home', 2300, [['Rent', 1900, 1900, 1], ['Utilities', 250, 210, 1], ['Internet', 80, 79, 1]]],
  ['Food', 900, [['Groceries', 600, 140, 4], ['Eating out', 220, 45, 4], ['Coffee', 80, 5.5, 12]]],
  ['Transport', 300, [['Fuel', 180, 70, 2], ['Public transport', 80, 20, 3], ['Parking', 40, 12, 2]]],
  ['Lifestyle', 350, [['Subscriptions', 60, 18, 3], ['Shopping', 200, 65, 2], ['Gym', 70, 70, 1]]],
  ['Health', 150, [['Medical', 100, 80, 0.5], ['Pharmacy', 50, 22, 1]]],
];
const FIXED = new Set(['Rent', 'Internet', 'Gym']);

/** Six months of plausible data ending today, posted through the ledger API. Deterministic for a given seed and day. */
export function generateSample(o: SampleOptions): Sample {
  const newId = o.newId ?? (() => crypto.randomUUID());
  let s = o.seed ?? 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  const t = today(o.now, o.timeZone);
  const months: YearMonth[] = [monthOf(t)];
  for (let i = 0; i < 5; i++) months.unshift(previousMonth(months[0]!));
  const first = months[0]!;
  const stamp = { createdAt: o.now.toISOString(), updatedAt: o.now.toISOString() };
  const budgets = (amount: number) => [{ from: first, amountMinor: pesos(amount) }];

  const acct = (name: string, type: AccountType) => newAccount(name, type, { id: newId(), ...stamp });
  const [everyday, savings, card, wallet] = [acct('Everyday', 'bank'), acct('Savings', 'savings'), acct('Credit card', 'credit'), acct('Wallet', 'cash')] as [Account, Account, Account, Account];
  const accounts = [everyday, savings, card, wallet];

  const specs = new Map<string, { sub: string; fixed: boolean; avg: number; n: number; account: Account }[]>();
  const expenseCategories = CATEGORIES.map(([name, budget, subs], ci) => {
    const cat = newExpenseCategory(name, {
      id: newId(), ...stamp, budgets: budgets(budget),
      subs: subs.map(([n, b]) => newSubCategory(n, { id: newId(), ...stamp, budgets: budgets(b) })),
      ...(name === 'Food' ? { rollover: true, rollStart: months[3]! } : name === 'Lifestyle' ? { rollover: true, rollStart: months[4]! } : {}),
    });
    specs.set(cat.id, subs.map(([n, , avg, cnt], i) => ({
      sub: cat.subs[i]!.id, fixed: FIXED.has(n), avg, n: cnt, account: ci === 1 || ci === 3 ? card : everyday,
    })));
    return cat;
  });
  const [salary, side, interest] = ['Salary', 'Side income', 'Interest'].map((n) => newIncomeCategory(n, { id: newId(), ...stamp })) as [IncomeCategory, IncomeCategory, IncomeCategory];

  interface Item { date: Day; kind: EntryKind; debit: string; credit: string; amountMinor: number; void?: boolean }
  const items: Item[] = [];
  months.forEach((m, mi) => {
    const add = (day: number, i: Omit<Item, 'date'>) => {
      const date = `${m}-${String(day).padStart(2, '0')}`;
      if (date <= t) items.push({ date, ...i });
    };
    add(1, { kind: 'income', debit: everyday.id, credit: salary.id, amountMinor: pesos(2650) });
    add(15, { kind: 'income', debit: everyday.id, credit: salary.id, amountMinor: pesos(2650) });
    add(28, { kind: 'income', debit: savings.id, credit: interest.id, amountMinor: pesos(25 + rnd() * 15) });
    add(2, { kind: 'transfer', debit: savings.id, credit: everyday.id, amountMinor: pesos(500) });
    add(20, { kind: 'transfer', debit: card.id, credit: everyday.id, amountMinor: pesos(650) }); // pay the card
    if (rnd() < 0.4) add(1 + Math.floor(rnd() * 27), { kind: 'income', debit: everyday.id, credit: side.id, amountMinor: pesos(300) });
    for (const cat of expenseCategories) {
      for (const sp of specs.get(cat.id)!) {
        const count = Math.floor(sp.n) + (rnd() < sp.n % 1 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          const day = sp.sub === cat.subs[0]!.id && cat.name === 'Home' ? 1 : 1 + Math.floor(rnd() * 28);
          const amountMinor = sp.fixed ? pesos(sp.avg) : pesos(sp.avg * (0.7 + 0.6 * rnd()));
          add(day, { kind: 'expense', debit: sp.sub, credit: sp.account.id, amountMinor });
        }
      }
    }
    // One mistaken entry that gets voided, to exercise reversals.
    if (mi === 3) add(10, { kind: 'expense', debit: specs.get(expenseCategories[3]!.id)![1]!.sub, credit: card.id, amountMinor: pesos(99), void: true });
  });

  const ledger = new Ledger([], newId);
  const p = { now: o.now, timeZone: o.timeZone };
  const openings: [Account, number][] = [[everyday, 2400], [savings, 8000], [wallet, 120]];
  for (const [a, amt] of openings) {
    ledger.postOpening({ account: a.id, accountClass: accountClass(a.type), amountMinor: pesos(amt), date: `${first}-01`, ...p });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable
  for (const it of items) {
    const e = ledger.post({ kind: it.kind, date: it.date, debit: it.debit, credit: it.credit, amountMinor: it.amountMinor, ...p });
    if (it.void) ledger.void(e.id, o.now);
  }
  return { ledger, accounts, expenseCategories, incomeCategories: [salary, side, interest], currency: PHP };
}
