import { describe, expect, it } from 'vitest';
import { calculatorOff, liveAmount, pressKey, type Key } from './amountInput';
import { AUD, JPY, type Currency } from './money';

const toKey = (ch: string): Key =>
  ch === 'C' ? 'clear' : ch === '<' ? 'backspace' : ch === '=' ? 'equals' : (ch as Key);
const press = (s: string, start = '', c: Currency = AUD) =>
  [...s].reduce((cur, ch) => pressKey(cur, toKey(ch), c), start);

describe('pressKey', () => {
  it('digits and leading zero', () => {
    expect(press('123')).toBe('123');
    expect(press('007')).toBe('7');
    expect(press('0.05')).toBe('0.05');
  });
  it('max decimals follow currency', () => {
    expect(press('1.234')).toBe('1.23');
    expect(press('1.5', '', JPY)).toBe('15'); // "." ignored: no minor digits
    expect(press('12', '', JPY)).toBe('12');
  });
  it('seven digits per number', () => {
    expect(press('12345678')).toBe('1234567');
    expect(press('1234567+89')).toBe('1234567+89');
    expect(press('12345.678')).toBe('12345.67');
  });
  it('length cap', () => {
    const s = '1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1'; // 31 chars
    expect(s.length).toBe(31);
    expect(press('1', s)).toBe(s + '1');
    expect(press('+', s + '1')).toBe(s + '1'); // would be 33
    expect(press('+', s)).toBe(s + '+'); // 32 is allowed
  });
  it('dot on empty segment', () => {
    expect(press('.')).toBe('0.');
    expect(press('5+.')).toBe('5+0.');
    expect(press('(.')).toBe('(0.');
    expect(press('1.5.')).toBe('1.5');
    expect(press('(2).')).toBe('(2)*0.');
  });
  it('operators', () => {
    expect(press('+')).toBe(''); // not on empty
    expect(press('-')).toBe('-'); // minus allowed first
    expect(press('5+')).toBe('5+');
    expect(press('5+*')).toBe('5*'); // replacement
    expect(press('5*-')).toBe('5-');
    expect(press('(+')).toBe('('); // not right after "("
    expect(press('(-')).toBe('(-');
  });
  it('parentheses', () => {
    expect(press('2(')).toBe('2*(');
    expect(press('(2)(')).toBe('(2)*(');
    expect(press('2+(')).toBe('2+(');
    expect(press('(')).toBe('(');
    expect(press('2.(')).toBe('2.*(');
    expect(press(')')).toBe('');
    expect(press('(2+3)')).toBe('(2+3)');
    expect(press('(2+3))')).toBe('(2+3)');
    expect(press('(2+)')).toBe('(2+');
    expect(press('()')).toBe('(');
    expect(press('(2)3')).toBe('(2)*3');
  });
  it('clear and backspace', () => {
    expect(press('12+3C')).toBe('');
    expect(press('12+<')).toBe('12');
    expect(press('<')).toBe('');
  });
  it('equals', () => {
    expect(press('(12+3)*2=')).toBe('30');
    expect(press('10/4=')).toBe('2.5');
    expect(press('1/3=')).toBe('0.33');
    expect(press('5-9=')).toBe(''); // keeps only results > 0
    expect(press('5-5=')).toBe('');
    expect(press('5/0=')).toBe('5/0'); // invalid: unchanged
    expect(press('(2+3=')).toBe('5'); // unclosed parenthesis auto-closes
  });
});

describe('liveAmount / calculatorOff', () => {
  it('liveAmount ignores trailing operators (minor units)', () => {
    expect(liveAmount('5+', AUD)).toBe(500);
    expect(liveAmount('5+(', AUD)).toBe(500);
    expect(liveAmount('2*(3+', AUD)).toBe(600);
    expect(liveAmount('5-9', AUD)).toBe(0);
    expect(liveAmount('', AUD)).toBe(0);
    expect(liveAmount('+', AUD)).toBe(0);
    expect(liveAmount('1.005', AUD)).toBe(101);
  });
  it('calculatorOff evaluates', () => {
    expect(calculatorOff('(12+3)*2', AUD)).toBe('30');
    expect(calculatorOff('5+', AUD)).toBe('5');
    expect(calculatorOff('5-9', AUD)).toBe('');
    expect(calculatorOff('12.5', AUD)).toBe('12.5');
    expect(calculatorOff('', AUD)).toBe('');
  });
});
