import { describe, expect, it } from 'vitest';
import { evaluate } from './expression';
import { AUD, JPY } from './money';

// evaluate returns minor units (AUD: cents) or null.
const ev = (s: string, c = AUD) => evaluate(s, c);

describe('evaluate', () => {
  it('basics', () => {
    expect(ev('(12+3)×2')).toBe(3000);
    expect(ev('2+3*4')).toBe(1400);
    expect(ev('10/4')).toBe(250);
    expect(ev('10÷4−1')).toBe(150);
    expect(ev('-5+2')).toBe(-300);
    expect(ev('2*-3')).toBe(-600);
  });
  it('implicit multiplication', () => {
    expect(ev('2(3+1)')).toBe(800);
    expect(ev('(2)(3)')).toBe(600);
  });
  it('unclosed and trailing', () => {
    expect(ev('(2+3')).toBe(500);
    expect(ev('2*(3+4')).toBe(1400);
    expect(ev('5+')).toBe(500);
    expect(ev('5+*/-')).toBe(500);
    expect(ev('(5+')).toBe(500);
  });
  it('invalid', () => {
    for (const s of ['', '+', '1/0', '5÷(3−3)', '1.2.3', '.', '2)', 'abc']) expect(ev(s), s).toBeNull();
  });
  it('rounding is exact, half away from zero', () => {
    expect(ev('1/3')).toBe(33);
    expect(ev('0.125')).toBe(13);
    expect(ev('-0.125')).toBe(-13);
    expect(ev('0.1+0.2')).toBe(30);
    expect(ev('10/4', JPY)).toBe(3);
    expect(ev('2.5', JPY)).toBe(3);
  });
  it('minor units (money tests)', () => {
    expect(ev('12.345')).toBe(1235);
    expect(ev('-12.345')).toBe(-1235);
    expect(ev('1234.5', JPY)).toBe(1235);
    expect(ev('1000', JPY)).toBe(1000);
    expect(ev('1000')).toBe(100_000);
  });
  it('is exact beyond float precision', () => {
    expect(ev('99999.99*99999.99')).toBe(999_999_800_000); // 9999998000.0001 -> cents
    expect(ev('9999999*9999999*9999999')).toBeNull(); // not a safe integer
  });
});
