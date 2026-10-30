import { describe, expect, it } from 'vitest';
import { AUD, CURRENCIES, DEFAULT_CURRENCY, JPY, PHP, formatMoney, isMinor, plainAmount } from './money';

const M = '−';

describe('formatMoney', () => {
  it('variants', () => {
    expect(formatMoney(AUD, 1250)).toBe('$12.50');
    expect(formatMoney(AUD, 1250, 'plus')).toBe('+$12.50');
    expect(formatMoney(AUD, 1250, 'minus')).toBe(`${M}$12.50`);
    expect(formatMoney(AUD, -1250, 'minus')).toBe(`${M}$12.50`); // sign style uses the magnitude
    expect(formatMoney(AUD, -1250)).toBe(`${M}$12.50`);
  });
  it('digits and separators', () => {
    expect(formatMoney(AUD, 0)).toBe('$0.00');
    expect(formatMoney(AUD, 5)).toBe('$0.05');
    expect(formatMoney(AUD, 100_000)).toBe('$1,000.00');
    expect(formatMoney(AUD, 123_456_789)).toBe('$1,234,567.89');
    expect(formatMoney(JPY, 1_500)).toBe('¥1,500');
    expect(formatMoney(JPY, 7, 'plus')).toBe('+¥7');
    expect(formatMoney(AUD, -Number.MAX_SAFE_INTEGER)).toBe(`${M}$90,071,992,547,409.91`);
  });
  it('symbols', () => {
    const expected: Record<string, string> = {
      AUD: '$', USD: '$', NZD: '$', CAD: '$', SGD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', PHP: '₱',
    };
    for (const c of CURRENCIES) expect(formatMoney(c, 100).startsWith(expected[c.code]!), c.code).toBe(true);
  });
  it('PHP default and order', () => {
    expect(PHP.code).toBe('PHP');
    expect(PHP.minorDigits).toBe(2);
    expect(DEFAULT_CURRENCY).toBe(PHP);
    expect(CURRENCIES.map((c) => c.code)).toEqual(['PHP', 'AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD', 'SGD', 'JPY', 'INR']);
    expect(CURRENCIES.length).toBe(10);
    expect(formatMoney(PHP, 123_456, 'none')).toBe('₱1,234.56');
  });
});

describe('minor units', () => {
  it('isMinor accepts safe integers only', () => {
    expect(isMinor(5)).toBe(true);
    expect(isMinor(1.5)).toBe(false);
    expect(isMinor(2 ** 53)).toBe(false);
    expect(isMinor(NaN)).toBe(false);
  });
  it('plainAmount trims trailing zeros', () => {
    expect(plainAmount(AUD, 3000)).toBe('30');
    expect(plainAmount(AUD, 250)).toBe('2.5');
    expect(plainAmount(AUD, 33)).toBe('0.33');
    expect(plainAmount(AUD, 5)).toBe('0.05');
    expect(plainAmount(JPY, 1500)).toBe('1500');
  });
});
