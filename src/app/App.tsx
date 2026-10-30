import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { makeDirectory, monthOf, needsStarter, starterCategories, today as todayOf, type Entry, type YearMonth } from '../core';
import { loadAll, openDb, putExpenseCat, putIncomeCat } from '../db/db';
import { makeActions, type Actions, type Data } from './actions';
import { AppCtx, colorMap, type Ctx } from './ctx';
import { Icon, type IconName } from './icons';
import { AddSheet } from './screens/AddSheet';
import { Budgets } from './screens/Budgets';
import { DetailSheet } from './screens/DetailSheet';
import { Home } from './screens/Home';
import { Reports } from './screens/Reports';
import { Setup } from './screens/Setup';

type Tab = 'home' | 'budgets' | 'reports' | 'setup';
type Sheet = null | { kind: 'add' } | { kind: 'edit'; id: string } | { kind: 'tx'; id: string };
const TABS: Record<Tab, [string, IconName]> = { home: ['Home', 'house'], budgets: ['Budgets', 'target'], reports: ['Reports', 'chart'], setup: ['Setup', 'gear'] };

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [actions, setActions] = useState<Actions | null>(null);
  const [error, setError] = useState('');
  const [today, setToday] = useState(() => todayOf(new Date()));
  const [tab, setTab] = useState<Tab>('home');
  const [month, setMonth] = useState<YearMonth>(() => monthOf(todayOf(new Date())));
  const [sheet, setSheet] = useState<Sheet>(null);
  const latest = useRef<Data | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openDb().then(async (db) => {
      let d = await loadAll(db);
      if (needsStarter(d)) {
        // Fresh install: add the starter categories once (reference data; archive or edit freely).
        const s = starterCategories(new Date());
        for (const c of s.expenseCategories) await putExpenseCat(db, c);
        for (const c of s.incomeCategories) await putIncomeCat(db, c);
        d = { ...d, ...s };
      }
      latest.current = d;
      setActions(makeActions(db, () => latest.current!, (n) => { latest.current = n; setData(n); }));
      setData(d);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // "Today" follows the device clock when the app comes back to the foreground.
  useEffect(() => {
    const f = () => { if (!document.hidden) setToday(todayOf(new Date())); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  const ctx: Ctx | null = useMemo(() => data && actions && {
    data, actions, c: data.currency, today,
    dir: makeDirectory(data.accounts, data.expenseCategories, data.incomeCategories),
    colors: colorMap(data.expenseCategories),
  }, [data, actions, today]);

  if (error) return <div class="boot">Could not open the database: {error}</div>;
  if (!ctx) return <div class="boot" />;

  const goTab = (t: Tab) => { setTab(t); scroller.current?.scrollTo(0, 0); };
  const saved = (e: Entry | null) => { setSheet(null); if (e) setMonth(monthOf(e.date)); if (tab === 'setup') setTab('home'); };
  const close = () => setSheet(null);
  const tabButton = (t: Tab) => (
    <button class={'tab' + (tab === t ? ' on' : '')} onClick={() => goTab(t)} aria-current={tab === t ? 'page' : undefined}>
      <Icon name={TABS[t][1]} size={24} filled={tab === t} />{TABS[t][0]}
    </button>
  );

  return (
    <AppCtx.Provider value={ctx}>
      <div class="scroll" ref={scroller}>
        {tab === 'home' && <Home month={month} setMonth={setMonth} openTx={(id) => setSheet({ kind: 'tx', id })} />}
        {tab === 'budgets' && <Budgets month={month} setMonth={setMonth} />}
        {tab === 'reports' && <Reports month={month} setMonth={setMonth} />}
        {tab === 'setup' && <Setup />}
      </div>
      <nav class="tabbar">
        {tabButton('home')}{tabButton('budgets')}
        <div class="plus-slot"><button class="plus" aria-label="Add transaction" onClick={() => setSheet({ kind: 'add' })}><Icon name="plus" size={24} /></button></div>
        {tabButton('reports')}{tabButton('setup')}
      </nav>
      {sheet?.kind === 'add' && <AddSheet onClose={close} onSaved={saved} />}
      {sheet?.kind === 'edit' && <AddSheet edit={ctx.data.ledger.entries.find((x) => x.id === sheet.id)} onClose={close} onSaved={saved} />}
      {sheet?.kind === 'tx' && <DetailSheet id={sheet.id} onClose={close} onEdit={(id) => setSheet({ kind: 'edit', id })} />}
    </AppCtx.Provider>
  );
}
