import { describe, expect, it } from 'vitest';
import { bootLine } from './boot';

describe('bootLine', () => {
  it('sums page and data, rounded to whole ms', () => {
    expect(bootLine({ page: 340.4, data: 71.9 })).toBe('Opened in 412 ms · page 340 · data 72');
  });
});
