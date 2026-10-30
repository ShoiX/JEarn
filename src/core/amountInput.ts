import { evaluate } from './expression';
import { plainAmount, type Currency } from './money';

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | '+' | '-' | '*' | '/' | '(' | ')' | 'clear' | 'backspace' | 'equals';

const OPERATORS = '+-*/';
const SEPARATORS = '+-*/()';
const isOp = (c: string | undefined) => c !== undefined && OPERATORS.includes(c);
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const count = (s: string, ch: string) => s.split(ch).length - 1;

/** Pure keypad handler. Returns `current` unchanged when the key is rejected. */
export function pressKey(current: string, key: Key, currency: Currency): string {
  let v = current;
  const last = v.at(-1);
  const seg = v.slice(Math.max(...[...SEPARATORS].map((c) => v.lastIndexOf(c))) + 1);
  switch (key) {
    case 'backspace': v = v.slice(0, -1); break;
    case 'clear': v = ''; break;
    case 'equals': {
      const r = evaluate(v, currency);
      if (r === null) return current;
      v = r > 0 ? plainAmount(currency, r) : '';
      break;
    }
    case '+': case '-': case '*': case '/':
      if (v === '' && key !== '-') return current;
      if (last === '(' && key !== '-') return current;
      if (isOp(last)) v = v.slice(0, -1);
      v += key;
      break;
    case '(':
      if (isDigit(last) || last === '.' || last === ')') v += '*';
      v += '(';
      break;
    case ')':
      if (count(v, '(') - count(v, ')') <= 0 || last === undefined || isOp(last) || last === '(') return current;
      v += ')';
      break;
    case '.':
      if (currency.minorDigits === 0 || seg.includes('.')) return current;
      if (last === ')') v += '*';
      v += seg === '' ? '0.' : '.';
      break;
    default: { // digit
      const dot = seg.indexOf('.');
      if (dot >= 0 && seg.length - dot - 1 >= currency.minorDigits) return current;
      if (seg.replace('.', '').length >= 7) return current;
      if (last === ')') v += '*';
      if (seg === '0') v = v.slice(0, -1);
      v += key;
    }
  }
  return v.length > 32 ? current : v;
}

/** Live amount in minor units: trailing operators and "(" are ignored; only values > 0 count, otherwise 0. */
export function liveAmount(expression: string, currency: Currency): number {
  const r = evaluate(expression.replace(/[+\-*/(]+$/, ''), currency);
  return r !== null && r > 0 ? r : 0;
}

/** Turning the calculator off evaluates any expression into a plain amount ("" if not > 0). */
export function calculatorOff(expression: string, currency: Currency): string {
  if (![...expression].some((c) => SEPARATORS.includes(c))) return expression;
  const r = liveAmount(expression, currency);
  return r > 0 ? plainAmount(currency, r) : '';
}

/** Display form of an expression: "(12+3)*2" -> "(12+3)×2". */
export const prettyExpression = (expression: string): string =>
  expression.replaceAll('*', '×').replaceAll('/', '÷').replaceAll('-', '−');

/** True when the expression contains any operator or parenthesis. */
export const hasOperators = (expression: string): boolean => [...expression].some((c) => SEPARATORS.includes(c));
