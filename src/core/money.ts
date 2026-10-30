// Money is a JS safe integer of minor units in the single ledger currency. Never floats.
export interface Currency { readonly code: string; readonly minorDigits: number }
export type MoneySign = 'none' | 'plus' | 'minus';

const cur = (code: string, minorDigits = 2): Currency => Object.freeze({ code, minorDigits });

export const PHP = cur('PHP');
export const AUD = cur('AUD');
export const JPY = cur('JPY', 0);
export const DEFAULT_CURRENCY = PHP;
export const CURRENCIES: readonly Currency[] = [
  PHP, AUD, cur('USD'), cur('EUR'), cur('GBP'), cur('NZD'), cur('CAD'), cur('SGD'), JPY, cur('INR'),
];
export const currencyByCode = (code: string) => CURRENCIES.find((c) => c.code === code);

export const isMinor = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

const SYMBOLS: Record<string, string> = { EUR: '€', GBP: '£', JPY: '¥', INR: '₹', PHP: '₱' };
export const currencySymbol = (c: Currency) => SYMBOLS[c.code] ?? '$';
const symbol = currencySymbol;
const MINUS = '−';

/** Whole and fractional parts of a non-negative minor amount. */
function parts(c: Currency, mag: number): [string, string] {
  const scale = 10 ** c.minorDigits;
  return [String(Math.floor(mag / scale)), c.minorDigits ? String(mag % scale).padStart(c.minorDigits, '0') : ''];
}

/** "$1,234.50". plus/minus show the magnitude with "+" / "−" (U+2212); none shows "−" only if negative. */
export function formatMoney(c: Currency, minor: number, sign: MoneySign = 'none'): string {
  const [whole, frac] = parts(c, Math.abs(minor));
  const prefix = sign === 'plus' ? '+' : sign === 'minus' || minor < 0 ? MINUS : '';
  return prefix + symbol(c) + whole.replace(/\B(?=(\d{3})+$)/g, ',') + (frac && '.' + frac);
}

/** Plain editable amount ("2.5", "30") from a non-negative minor amount. */
export function plainAmount(c: Currency, minor: number): string {
  const [whole, frac] = parts(c, minor);
  const f = frac.replace(/0+$/, '');
  return f ? `${whole}.${f}` : whole;
}
