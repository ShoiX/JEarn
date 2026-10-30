import { describe, expect, it } from 'vitest';
import {
  addDays, isDay, isYearMonth, monthLabel, monthOf, nextMonth, previousMonth, today, weekdayIndex,
} from './calendar';
import { day, ym } from './testSupport';

const SYDNEY = 'Australia/Sydney'; // UTC+11 on 30 Oct
const KIRITIMATI = 'Pacific/Kiritimati'; // UTC+14

describe('calendar day', () => {
  it('today uses the local date', () => {
    const n = new Date('2026-10-30T14:00:00Z'); // 01:00 on 31 Oct in UTC+11
    expect(today(n, SYDNEY)).toBe(day(2026, 10, 31));
    expect(today(n, 'UTC')).toBe(day(2026, 10, 30));
    expect(today(new Date('2026-10-26T10:30:00Z'), KIRITIMATI)).toBe(day(2026, 10, 27));
  });
  it('today defaults to the device zone and returns YYYY-MM-DD', () => {
    expect(today(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('validates real dates only', () => {
    expect(isDay('2026-10-31')).toBe(true);
    expect(isDay('2024-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '26-10-01', '2026-10-31T00:00', '', 'abc']) {
      expect(isDay(bad), bad).toBe(false);
    }
  });
  it('addDays and weekdayIndex', () => {
    expect(addDays('2026-10-27', -1)).toBe('2026-10-26');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayIndex('2026-10-06')).toBe(2); // Tuesday
  });
});

describe('year month', () => {
  it('next, previous, order, of(day)', () => {
    expect(nextMonth(ym(2026, 12))).toBe(ym(2027, 1));
    expect(previousMonth(ym(2026, 1))).toBe(ym(2025, 12));
    expect(ym(2026, 9) < ym(2026, 10)).toBe(true);
    expect(monthOf(day(2026, 10, 31))).toBe(ym(2026, 10));
    expect(monthOf(day(2026, 11, 1))).toBe(ym(2026, 11));
  });
  it('validates', () => {
    expect(isYearMonth('2026-03')).toBe(true);
    expect(isYearMonth('2026-13')).toBe(false);
    expect(isYearMonth('2026-3')).toBe(false);
  });
  it('labels', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(monthLabel('2026-10', true)).toBe('Oct 2026');
  });
});
