import { describe, expect, it } from 'vitest';
import { lockAxis, settleOffset, swipeOffset } from './swipe';

describe('swipe gesture math', () => {
  it('stays undecided until ~8px of movement', () => {
    expect(lockAxis(3, 2)).toBeNull();
    expect(lockAxis(-7, 0)).toBeNull();
  });
  it('locks to the dominant axis once past 8px', () => {
    expect(lockAxis(-9, 3)).toBe('h');
    expect(lockAxis(2, 12)).toBe('v');
    expect(lockAxis(-10, 10)).toBe('v');
  });
  it('offset follows the finger 1:1, clamped to -80..0', () => {
    expect(swipeOffset(0, -30)).toBe(-30);
    expect(swipeOffset(0, -200)).toBe(-80);
    expect(swipeOffset(0, 50)).toBe(0);
    expect(swipeOffset(-80, 30)).toBe(-50);
    expect(swipeOffset(-80, -30)).toBe(-80);
  });
  it('snaps open past 40px, otherwise closed', () => {
    expect(settleOffset(-41)).toBe(-80);
    expect(settleOffset(-80)).toBe(-80);
    expect(settleOffset(-40)).toBe(-80);
    expect(settleOffset(-39)).toBe(0);
    expect(settleOffset(0)).toBe(0);
  });
});
