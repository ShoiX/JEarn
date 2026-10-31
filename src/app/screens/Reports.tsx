import { useState } from 'preact/hooks';
import {
  formatMoney, lastNavMonth, monthLabel, monthReport, nextMonth, previousMonth, sixMonthReport, type YearMonth,
} from '../../core';
import { useApp } from '../ctx';
import { Icon } from '../icons';
import { MonthNav, SectionHeader, Segmented } from '../ui';

type Range = 'month' | '6m';

export function Reports({ month, setMonth }: { month: YearMonth; setMonth: (m: YearMonth) => void }) {
  const { data, c, today, colors } = useApp();
  const { ledger, expenseCategories: cats, incomeCategories: inc } = data;
  const [range, setRange] = useState<Range>('month');
  const fmt = (n: number) => formatMoney(c, n);
  const thisMonth = today.slice(0, 7);
  const tile = (label: string, value: string, cls = '') => (
    <div class="tile" key={label}><div class="muted12">{label}</div><div class={'tval ' + cls}>{value}</div></div>
  );

  const body = range === 'month' ? (() => {
    const r = monthReport(ledger, month, cats, inc);
    const max = r.categories[0]?.spentMinor ?? 1;
    return (
      <>
        <div class="row between pad-h8">
          <button class="navbtn" aria-label="Previous month" onClick={() => setMonth(previousMonth(month))}><Icon name="left" size={16} /></button>
          <span class="sub14">{monthLabel(month)}</span>
          <button class="navbtn" aria-label="Next month" disabled={month >= lastNavMonth(ledger, thisMonth)} onClick={() => setMonth(nextMonth(month))}><Icon name="right" size={16} /></button>
        </div>
        <div class="tiles">
          {tile('Income', fmt(r.incomeMinor), 'inc')}
          {tile('Spent', fmt(r.spentMinor))}
          {tile(r.savedMinor >= 0 ? 'Saved' : 'Shortfall', fmt(Math.abs(r.savedMinor)), r.savedMinor < 0 ? 'warn' : '')}
        </div>
        <SectionHeader>Spending by category</SectionHeader>
        <div class="card flat gap12">
          {r.categories.length === 0 && <div class="muted14">Nothing spent this month.</div>}
          {r.categories.map((b) => (
            <div key={b.id} class="catbar">
              <div class="row between sub14"><span>{b.name}</span><span class="row gap8"><span class="muted14">{Math.round(b.percent)}%</span><span>{fmt(b.spentMinor)}</span></span></div>
              <div class="bar thick"><i style={{ width: (b.spentMinor / max) * 100 + '%', background: colors.get(b.id) }} /></div>
            </div>
          ))}
        </div>
      </>
    );
  })() : (() => {
    const r = sixMonthReport(ledger, thisMonth, cats, inc);
    const archived = new Set(cats.filter((x) => x.archivedAt).map((x) => x.id));
    const rows = r.categories.filter((x) => !archived.has(x.id) || x.averageMinor > 0);
    const max = Math.max(1, ...r.months.flatMap((m) => [m.incomeMinor, m.spentMinor]));
    const W = 330, H = 128, gw = W / 6;
    const saved = r.averageIncomeMinor - r.averageSpentMinor;
    return (
      <>
        <div class="card flat chartcard">
          <div class="legend"><span><i style={{ background: 'var(--accent)' }} />Income</span><span><i style={{ background: 'var(--n400)' }} />Spending</span></div>
          <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Income and spending, last 6 months">
            <line x1="0" x2={W} y1={H} y2={H} stroke="var(--n800)" stroke-width="1" />
            {r.months.map((m, i) => {
              const x = i * gw + gw / 2, hi = (m.incomeMinor / max) * (H - 4), he = (m.spentMinor / max) * (H - 4);
              return (
                <g key={m.month}>
                  <rect x={x - 14} y={H - hi} width="13" height={hi} rx="3" fill="var(--accent)" />
                  <rect x={x + 1} y={H - he} width="13" height={he} rx="3" fill="var(--n400)" />
                  <text x={x} y={H + 16} text-anchor="middle" font-size="11" fill={i === 5 ? 'var(--accent-300)' : 'var(--n500)'}>{monthLabel(m.month, true).slice(0, 3)}</text>
                </g>
              );
            })}
          </svg>
        </div>
        <SectionHeader>Monthly average</SectionHeader>
        <div class="tiles">
          {tile('Income', fmt(r.averageIncomeMinor), 'inc')}
          {tile('Spent', fmt(r.averageSpentMinor))}
          {tile(saved >= 0 ? 'Saved' : 'Shortfall', fmt(Math.abs(saved)), saved < 0 ? 'warn' : '')}
        </div>
        <SectionHeader>Average per category vs budget</SectionHeader>
        <div class="group">
          {rows.map((b) => (
            <div class="avgrow" key={b.id}>
              <i class="dot" style={{ background: colors.get(b.id) }} />
              <span class="grow">{b.name}</span>
              <span class={b.isOverBudget ? 'warn' : ''}>{fmt(b.averageMinor)}</span>
              <span class="muted13 budcol">of {fmt(b.budgetMinor)}</span>
            </div>
          ))}
          {rows.length === 0 && <div class="avgrow muted14">No categories.</div>}
        </div>
        <div class="footnote pad-h">Averages cover the 5 completed months before this one.</div>
      </>
    );
  })();

  return (
    <>
      <div class="large-title"><h1>Reports</h1></div>
      <div class="pad-h mb12">
        <Segmented label="Range" value={range} onChange={setRange} options={[['month', 'This month'], ['6m', 'Last 6 months']]} />
      </div>
      {body}
      <div class="spacer" />
    </>
  );
}
