import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Currency, Day, Directory } from '../core';
import type { Actions, Data } from './actions';

export interface Ctx {
  data: Data;
  actions: Actions;
  c: Currency;
  today: Day;
  dir: Directory;
  /** Category / subcategory id -> dot colour. */
  colors: Map<string, string>;
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

const HUES = [289, 215, 160, 85, 25, 330, 250, 120];
export const catColor = (i: number) => `oklch(0.74 0.09 ${HUES[i % HUES.length]})`;

/** Stable colour per expense category (by creation order, archived included); subcategories share their parent's. */
export function colorMap(cats: readonly { id: string; subs: readonly { id: string }[] }[]): Map<string, string> {
  const m = new Map<string, string>();
  cats.forEach((c, i) => { m.set(c.id, catColor(i)); for (const s of c.subs) m.set(s.id, catColor(i)); });
  return m;
}
