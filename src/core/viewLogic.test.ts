import { describe, expect, it } from 'vitest';
import { newAccount, newExpenseCategory, newSubCategory } from './accounts';
import { hasOperators, prettyExpression } from './amountInput';
import { Ledger } from './ledger';
import { AUD, JPY, PHP, currencySymbol } from './money';
import { makeDirectory } from './screenLogic';
import {
  accountTotals, barPercent, categoriesInView, detailRows, openingEntry, rolloverLine, rolloverNote, subsInView,
} from './viewLogic';
import { day, now, uid, UTC, ym } from './testSupport';

describe('currencySymbol / expression display', () => {
  it('symbols', () => {
    expect(currencySymbol(PHP)).toBe('₱');
    expect(currencySymbol(AUD)).toBe('$');
    expect(currencySymbol(JPY)).toBe('¥');
  });
  it('prettyExpression and hasOperators', () => {
    expect(prettyExpression('(12+3)*2/4-1')).toBe('(12+3)×2÷4−1');
    expect(hasOperators('12.5')).toBe(false);
    expect(hasOperators('12+')).toBe(true);
    expect(hasOperators('(1')).toBe(true);
  });
});

describe('barPercent', () => {
  it('clamps to 0..100 and handles no budget', () => {
    expect(barPercent(50, 200)).toBe(25);
    expect(barPercent(300, 200)).toBe(100);
    expect(barPercent(0, 200)).toBe(0);
    expect(barPercent(10, 0)).toBe(100);
    expect(barPercent(10, -5)).toBe(100);
    expect(barPercent(0, 0)).toBe(0);
  });
});

describe('what a month shows', () => {
  const m = ym(2026, 10);
  const setup = () => {
    const l = new Ledger([], uid);
    const bank = uid();
    const live = newExpenseCategory('Live');
    const old = newExpenseCategory('Old', { archivedAt: '2026-09-15T00:00:00.000Z' });
    const spentOld = newExpenseCategory('SpentOld', { archivedAt: '2026-09-15T00:00:00.000Z' });
    const late = newExpenseCategory('Late', { archivedAt: '2026-11-15T00:00:00.000Z' });
    l.post({ kind: 'expense', date: day(2026, 10, 3), debit: spentOld.id, credit: bank, amountMinor: 100, now, timeZone: UTC });
    return { l, cats: [live, old, spentOld, late] };
  };
  it('categories: active, archived later than the month, or with spending', () => {
    const { l, cats } = setup();
    expect(categoriesInView(l, cats, m).map((c) => c.name)).toEqual(['Live', 'SpentOld', 'Late']);
    expect(categoriesInView(l, cats, ym(2026, 8)).map((c) => c.name)).toEqual(['Live', 'Old', 'SpentOld', 'Late']);
  });
  it('subcategories: active or with spending', () => {
    const l = new Ledger([], uid);
    const a = newSubCategory('A'), b = newSubCategory('B', { archivedAt: now.toISOString() });
    const c = newSubCategory('C', { archivedAt: now.toISOString() });
    l.post({ kind: 'expense', date: day(2026, 10, 3), debit: c.id, credit: uid(), amountMinor: 5, now, timeZone: UTC });
    const cat = newExpenseCategory('X', { subs: [a, b, c] });
    expect(subsInView(l, cat, m).map((s) => s.name)).toEqual(['A', 'C']);
  });
});

describe('openingEntry', () => {
  it('finds the live opening entry; none after void', () => {
    const l = new Ledger([], uid);
    const a = newAccount('A', 'bank');
    const credit = newAccount('Card', 'credit');
    const o = l.postOpening({ account: a.id, accountClass: 'bank', amountMinor: 500, date: day(2026, 10, 1), now, timeZone: UTC });
    const oc = l.postOpening({ account: credit.id, accountClass: 'credit', amountMinor: 70, date: day(2026, 10, 1), now, timeZone: UTC });
    expect(openingEntry(l, a.id)?.id).toBe(o.id);
    expect(openingEntry(l, credit.id)?.id).toBe(oc.id);
    expect(openingEntry(l, uid())).toBeUndefined();
    l.void(o.id, now);
    expect(openingEntry(l, a.id)).toBeUndefined();
  });
});

describe('rollover text', () => {
  const cat = (over = {}) => newExpenseCategory('Food', { rollover: true, rollStart: ym(2026, 9), ...over });
  it('budget-screen line', () => {
    expect(rolloverLine(cat(), 4500, 94500, ym(2026, 10), PHP)).toEqual({ text: '+₱45.00 from Sep · ₱945.00 available', negative: false });
    expect(rolloverLine(cat(), -4500, 1000, ym(2026, 10), PHP)).toEqual({ text: '−₱45.00 from Sep · ₱10.00 available', negative: true });
    expect(rolloverLine(cat({ rollStart: ym(2026, 10) }), 0, 1000, ym(2026, 10), PHP)).toEqual({ text: 'Rollover starts this month', negative: false });
  });
  it('setup note', () => {
    expect(rolloverNote(cat({ rollover: false }), 0, ym(2026, 10), PHP)).toEqual({ text: 'Unspent budget resets each month', negative: false });
    expect(rolloverNote(cat({ rollStart: ym(2026, 10) }), 0, ym(2026, 10), PHP)).toEqual({ text: 'Starts fresh this month', negative: false });
    expect(rolloverNote(cat(), 4500, ym(2026, 10), PHP)).toEqual({ text: 'Carrying +₱45.00 into Oct', negative: false });
    expect(rolloverNote(cat(), -4500, ym(2026, 10), PHP)).toEqual({ text: 'Carrying −₱45.00 into Oct', negative: true });
  });
});

describe('detailRows', () => {
  const bank = newAccount('Everyday'), cash = newAccount('Wallet');
  const sub = newSubCategory('Coffee');
  const cat = newExpenseCategory('Food', { subs: [sub] });
  const bare = newExpenseCategory('Misc');
  const inc = { id: uid(), name: 'Salary', createdAt: '', updatedAt: '' };
  const dir = makeDirectory([bank, cash], [cat, bare], [inc]);
  const l = new Ledger([], uid);
  const post = (kind: 'expense' | 'income' | 'transfer', debit: string, credit: string, note = '') =>
    l.post({ kind, date: day(2026, 10, 6), debit, credit, amountMinor: 1250, note, now, timeZone: UTC });
  const t = day(2026, 10, 27);
  it('expense with subcategory', () => {
    expect(detailRows(post('expense', sub.id, bank.id, 'flat white'), dir, PHP, t)).toEqual({
      kind: 'Expense', amountText: '−₱12.50', tone: 'expense',
      rows: [['Category', 'Food'], ['Subcategory', 'Coffee'], ['Account', 'Everyday'], ['Date', 'Tue 6 Oct'], ['Note', 'flat white']],
    });
  });
  it('expense without subcategory, income, transfer', () => {
    expect(detailRows(post('expense', bare.id, bank.id), dir, PHP, t).rows).toEqual([['Category', 'Misc'], ['Account', 'Everyday'], ['Date', 'Tue 6 Oct']]);
    expect(detailRows(post('income', bank.id, inc.id), dir, PHP, t)).toMatchObject({
      kind: 'Income', amountText: '+₱12.50', tone: 'income', rows: [['Category', 'Salary'], ['Account', 'Everyday'], ['Date', 'Tue 6 Oct']],
    });
    expect(detailRows(post('transfer', cash.id, bank.id), dir, PHP, t)).toMatchObject({
      kind: 'Transfer', amountText: '₱12.50', tone: 'transfer', rows: [['From', 'Everyday'], ['To', 'Wallet'], ['Date', 'Tue 6 Oct']],
    });
  });
});

describe('accountTotals', () => {
  const setup = () => {
    const l = new Ledger([], uid);
    const bank = newAccount('Bank', 'bank'), cash = newAccount('Cash', 'cash'), card = newAccount('Card', 'credit'), old = newAccount('Old', 'savings', { archivedAt: now.toISOString() });
    const open = (a: typeof bank, amountMinor: number, date = day(2026, 10, 1)) => l.postOpening({ account: a.id, accountClass: a.type, amountMinor, date, now, timeZone: UTC });
    return { l, bank, cash, card, old, open };
  };
  it('sums active asset and liability balances', () => {
    const { l, bank, cash, card, open } = setup();
    open(bank, 500); open(cash, 70); open(card, 120);
    expect(accountTotals(l, [bank, cash, card])).toEqual({ assets: 570, owed: 120, hasLiability: true });
  });
  it('excludes archived accounts', () => {
    const { l, bank, old, open } = setup();
    open(bank, 500); open(old, 900);
    expect(accountTotals(l, [bank, old])).toEqual({ assets: 500, owed: 0, hasLiability: false });
  });
  it('no liability account: hasLiability false', () => {
    const { l, bank, open } = setup();
    open(bank, 5);
    expect(accountTotals(l, [bank]).hasLiability).toBe(false);
  });
  it('includes future-dated entries', () => {
    const { l, bank, open } = setup();
    open(bank, 500, day(2099, 1, 1));
    expect(accountTotals(l, [bank]).assets).toBe(500);
  });
});
