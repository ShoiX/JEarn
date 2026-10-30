import type { Currency } from './money';

// Exact rational arithmetic with BigInt (no floats), then rounded to the currency's minor units.
interface Frac { n: bigint; d: bigint } // d > 0

const gcd = (a: bigint, b: bigint): bigint => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
const frac = (n: bigint, d: bigint): Frac => {
  const g = gcd(n, d) || 1n;
  return d < 0n ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
};
const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);

/** Round n/d (times 10^digits) half away from zero to an integer. */
function toMinor(v: Frac, digits: number): number | null {
  const n = v.n * 10n ** BigInt(digits);
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / v.d;
  if (2n * (a % v.d) >= v.d) q += 1n;
  const r = Number(neg ? -q : q);
  return Number.isSafeInteger(r) ? r : null;
}

/** Parses digits and "." into an exact fraction; null if malformed. */
function parseNumber(s: string): Frac | null {
  const [whole = '', fracPart = '', ...extra] = s.split('.');
  if (extra.length || !/\d/.test(s)) return null;
  return frac(BigInt((whole + fracPart) || '0'), 10n ** BigInt(fracPart.length));
}

/**
 * Calculator evaluator (+ - * / × ÷ −, parentheses, unary minus, implicit × before "(").
 * Unclosed "(" auto-close, trailing operators are ignored. Returns minor units, or null if invalid / ÷ 0.
 */
export function evaluate(input: string, currency: Currency): number | null {
  let s = input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replace(/\s/g, '');
  s = s.replace(/[+\-*/]+$/, '');
  let i = 0;

  const number = (): Frac | null => {
    const start = i;
    while (i < s.length && /[0-9.]/.test(s[i]!)) i++;
    return parseNumber(s.slice(start, i));
  };
  const factor = (): Frac | null => {
    if (s[i] === '-') { i++; const f = factor(); return f && { n: -f.n, d: f.d }; }
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (v && s[i] === ')') i++;
      return v;
    }
    return number();
  };
  const term = (): Frac | null => {
    let v = factor();
    while (v && (s[i] === '*' || s[i] === '/' || s[i] === '(')) {
      const c = s[i];
      if (c !== '(') i++; // "(" directly after a value is an implicit ×
      const r = factor();
      if (!r) return null;
      if (c === '/') { if (r.n === 0n) return null; v = frac(v.n * r.d, v.d * r.n); } else v = mul(v, r);
    }
    return v;
  };
  const expr = (): Frac | null => {
    let v = term();
    while (v && (s[i] === '+' || s[i] === '-')) {
      const c = s[i++];
      const r = term();
      if (!r) return null;
      v = add(v, c === '+' ? r : { n: -r.n, d: r.d });
    }
    return v;
  };

  if (!s) return null;
  const v = expr();
  return v && i === s.length ? toMinor(v, currency.minorDigits) : null;
}
