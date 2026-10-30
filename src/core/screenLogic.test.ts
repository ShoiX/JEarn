import { describe, expect, it } from 'vitest';
import {
  newAccount, newExpenseCategory, newIncomeCategory, newSubCategory, type ExpenseCategory,
} from './accounts';
import { setBudget } from './budgets';
import { AUD, JPY } from './money';
import { Ledger, OPENING_BALANCES_ID, type EntryKind } from './ledger';
import {
  active, canChangeCurrency, canImport, canLoadSampleData, dayLabel, homeSections, isValidDraft,
  makeDirectory, newDraft, pickable, postDraft, subBudgetOverflow, validateDraft, type TransactionDraft, type TxType,
} from './screenLogic';
import { day, expectCode, now, uid, UTC, ym } from './testSupport';

// ---- reference data helpers
describe('reference data', () => {
  it('pickers hide archived', () => {
    const t = now.toISOString();
    expect(active([newAccount('A'), newAccount('B', 'bank', { archivedAt: t })]).map((a) => a.name)).toEqual(['A']);
    expect(active([newIncomeCategory('Pay'), newIncomeCategory('Old', { archivedAt: t })]).map((a) => a.name)).toEqual(['Pay']);
    const cats = [
      newExpenseCategory('Food', { subs: [newSubCategory('Latte'), newSubCategory('Old', { archivedAt: t })] }),
      newExpenseCategory('Gone', { archivedAt: t }),
    ];
    const p = pickable(cats);
    expect(p.map((c) => c.name)).toEqual(['Food']);
    expect(p[0]?.subs.map((s) => s.name)).toEqual(['Latte']);
    expect(cats[0]?.subs.length).toBe(2); // input untouched
  });
  it('empty-ledger gates', () => {
    const l = new Ledger([], uid);
    expect([canChangeCurrency(l), canLoadSampleData(l), canImport(l)]).toEqual([true, true, true]);
    l.postOpening({ account: uid(), accountClass: 'bank', amountMinor: 1, date: day(2026, 10, 27), now, timeZone: UTC });
    expect([canChangeCurrency(l), canLoadSampleData(l), canImport(l)]).toEqual([false, false, false]);
  });
  it('subBudgetOverflow', () => {
    const m = ym(2026, 10);
    const cat = (budget: number, subs: number[]): ExpenseCategory => newExpenseCategory('C', {
      budgets: [{ from: ym(2026, 1), amountMinor: budget }],
      subs: subs.map((a) => newSubCategory('S', { budgets: [{ from: ym(2026, 1), amountMinor: a }] })),
    });
    expect(subBudgetOverflow(cat(1_000, [600, 500]), m)).toEqual({ subsTotalMinor: 1_100, categoryMinor: 1_000 });
    expect(subBudgetOverflow(cat(1_000, [600, 400]), m)).toBeNull(); // equal is fine
    expect(subBudgetOverflow(cat(1_000, []), m)).toBeNull();
    const c = cat(1_000, [600, 500]);
    c.subs[1]!.archivedAt = now.toISOString(); // archived subs are not counted
    expect(subBudgetOverflow(c, m)).toBeNull();
    delete c.subs[1]!.archivedAt;
    c.budgets = setBudget(c.budgets, ym(2026, 11), 2_000); // uses the budget at that month
    expect(subBudgetOverflow(c, m)).not.toBeNull();
    expect(subBudgetOverflow(c, ym(2026, 11))).toBeNull();
  });
});

// ---- home list
function shop() {
  const l = new Ledger([], uid);
  const bank = newAccount('Bank'), card = newAccount('Card', 'credit', { archivedAt: now.toISOString() });
  const latte = newSubCategory('Latte');
  const food = newExpenseCategory('Food', { subs: [latte] }), fun = newExpenseCategory('Fun');
  const salary = newIncomeCategory('Salary');
  const dir = makeDirectory([bank, card], [food, fun], [salary]);
  const post = (kind: EntryKind, date: string, debit: string, credit: string, amt = 100, note = '') =>
    l.post({ kind, date, debit, credit, amountMinor: amt, note, now, timeZone: UTC });
  return { l, bank, card, latte, food, fun, salary, dir, post };
}
const sections = (s: ReturnType<typeof shop>, today = day(2026, 10, 27)) =>
  homeSections(s.l, ym(2026, 10), s.dir, today, AUD);

describe('home list', () => {
  it('groups by day, newest first, with labels', () => {
    const s = shop();
    s.post('expense', day(2026, 10, 6), s.latte.id, s.bank.id);
    const b = s.post('expense', day(2026, 10, 27), s.latte.id, s.bank.id);
    const c = s.post('income', day(2026, 10, 27), s.bank.id, s.salary.id);
    s.post('expense', day(2026, 10, 26), s.fun.id, s.bank.id);
    s.post('expense', day(2026, 9, 30), s.fun.id, s.bank.id); // other month
    const sec = sections(s);
    expect(sec.map((x) => x.label)).toEqual(['Today', 'Yesterday', 'Tue 6 Oct']);
    expect(sec[0]?.rows.map((r) => r.id)).toEqual([c.id, b.id]); // seq desc within a day
    expect(sec.map((x) => x.rows.length)).toEqual([2, 1, 1]);
  });
  it('dayLabel format', () => {
    expect(dayLabel(day(2026, 10, 5), day(2026, 10, 27))).toBe('Mon 5 Oct');
    expect(dayLabel(day(2025, 1, 1), day(2026, 10, 27))).toBe('Wed 1 Jan');
    expect(dayLabel(day(2026, 10, 27), day(2026, 10, 27))).toBe('Today');
    expect(dayLabel(day(2026, 11, 1), day(2026, 11, 2))).toBe('Yesterday');
    expect(dayLabel(day(2026, 10, 31), day(2026, 11, 1))).toBe('Yesterday');
  });
  it('hides voided, reversals and openings', () => {
    const s = shop();
    s.post('opening', day(2026, 10, 27), s.bank.id, OPENING_BALANCES_ID);
    const e = s.post('expense', day(2026, 10, 27), s.latte.id, s.bank.id);
    s.l.void(e.id, now);
    expect(sections(s)).toEqual([]);
  });
  it('expense row with sub', () => {
    const s = shop();
    s.post('expense', day(2026, 10, 27), s.latte.id, s.bank.id, 450, 'morning');
    const r = sections(s)[0]!.rows[0]!;
    expect(r).toMatchObject({ title: 'Latte', meta: 'Food · Bank · morning', kind: 'expense', amountText: '−$4.50' });
  });
  it('expense row without sub or note omits parts', () => {
    const s = shop();
    s.post('expense', day(2026, 10, 27), s.fun.id, s.bank.id);
    expect(sections(s)[0]!.rows[0]).toMatchObject({ title: 'Fun', meta: 'Fun · Bank' });
  });
  it('income row', () => {
    const s = shop();
    s.post('income', day(2026, 10, 27), s.bank.id, s.salary.id, 9_000);
    expect(sections(s)[0]!.rows[0]).toMatchObject({ title: 'Salary', meta: 'Bank', kind: 'income', amountText: '+$90.00' });
  });
  it('transfer row and archived names', () => {
    const s = shop();
    s.post('transfer', day(2026, 10, 27), s.card.id, s.bank.id, 500); // to archived card
    expect(sections(s)[0]!.rows[0]).toMatchObject({ title: 'Transfer', meta: 'Bank → Card', kind: 'transfer', amountText: '$5.00' });
  });
});

// ---- draft
const bank = uid(), cash = uid(), cat = uid(), sub = uid(), inc = uid();
function draft(type: TxType, expression = '12.5'): TransactionDraft {
  const d = newDraft(type, day(2026, 10, 27), bank);
  d.expression = expression;
  if (type === 'expense') d.categoryId = cat;
  if (type === 'income') d.categoryId = inc;
  if (type === 'transfer') d.toAccountId = cash;
  return d;
}
const check = (d: TransactionDraft) => validateDraft(d, AUD, now, UTC);

describe('transaction draft', () => {
  it('valid drafts pass', () => {
    for (const t of ['expense', 'income', 'transfer'] as TxType[]) {
      expect(() => check(draft(t))).not.toThrow();
      expect(isValidDraft(draft(t), AUD, now, UTC)).toBe(true);
    }
  });
  it('amount must be positive', () => {
    for (const e of ['', '0', '5-9', '+']) expectCode(() => check(draft('expense', e)), 'invalidAmount');
    expect(isValidDraft(draft('expense', ''), AUD, now, UTC)).toBe(false);
  });
  it('transfer needs different accounts', () => {
    const d = draft('transfer');
    d.toAccountId = bank;
    expectCode(() => check(d), 'sameAccount');
    delete d.toAccountId;
    expectCode(() => check(d), 'missingAccount');
    const e = draft('expense');
    delete e.accountId;
    expectCode(() => check(e), 'missingAccount');
  });
  it('date not after today', () => {
    const d = draft('expense');
    d.date = day(2026, 10, 28);
    expectCode(() => check(d), 'dateInFuture');
  });
  it('category rules', () => {
    const d = draft('expense');
    delete d.categoryId;
    expectCode(() => check(d), 'missingCategory');
    d.subcategoryId = sub; // a subcategory alone is enough
    expect(() => check(d)).not.toThrow();
    const i = draft('income');
    delete i.categoryId;
    expectCode(() => check(i), 'missingCategory');
  });
  it('post maps debit/credit', () => {
    const l = new Ledger([], uid);
    const d = draft('expense', '(10+2.5)');
    d.subcategoryId = sub;
    d.note = '  lunch \n';
    const post = (x: TransactionDraft, c = AUD) => postDraft(l, x, c, now, UTC);
    expect(post(d)).toMatchObject({ kind: 'expense', debitId: sub, creditId: bank, amountMinor: 1250, note: 'lunch' });
    expect(post(draft('expense'))).toMatchObject({ debitId: cat, creditId: bank });
    expect(post(draft('income'))).toMatchObject({ kind: 'income', debitId: bank, creditId: inc });
    expect(post(draft('transfer'))).toMatchObject({ kind: 'transfer', debitId: cash, creditId: bank });
    expect(l.entries.length).toBe(4);
  });
  it('invalid post leaves ledger untouched', () => {
    const l = new Ledger([], uid);
    expectCode(() => postDraft(l, draft('expense', ''), AUD, now, UTC), 'invalidAmount');
    expect(l.entries).toEqual([]);
  });
  it('JPY amount', () => {
    const l = new Ledger([], uid);
    expect(postDraft(l, draft('expense', '1500'), JPY, now, UTC).amountMinor).toBe(1500);
  });
});
