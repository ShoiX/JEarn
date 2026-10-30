import { expect } from 'vitest';

// Shared helpers for tests only.
export const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const day = (y: number, m: number, d = 10) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export const ym = (y: number, m: number) => `${pad(y, 4)}-${pad(m)}`;
/** 2026-10-27 12:00 UTC */
export const now = new Date('2026-10-27T12:00:00Z');
export const UTC = 'UTC';
let n = 0;
/** Deterministic ids for tests. */
export const uid = () => `00000000-0000-4000-8000-${pad(++n, 12)}`;

/** Asserts `fn` throws an Error whose `code` equals `code`. */
export function expectCode(fn: () => unknown, code: string) {
  let err: unknown;
  try { fn(); } catch (e) { err = e; }
  expect(err, `expected throw ${code}`).toBeInstanceOf(Error);
  expect((err as { code?: string }).code).toBe(code);
}
