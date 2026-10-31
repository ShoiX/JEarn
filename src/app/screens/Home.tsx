import { useState } from 'preact/hooks';
import {
  accountClass, accountTotals, active, barPercent, categoriesInView, formatMoney, hasBudgets, homeSections, income, leftToSpend, monthLabel, nextMonth,
  lastNavMonth, previousMonth, available, totalSpent, type YearMonth,
} from '../../core';
import { useApp } from '../ctx';
import { accountIcon, Icon } from '../icons';
import { MonthNav, SectionHeader } from '../ui';

export function Home({ month, setMonth, openTx }: { month: YearMonth; setMonth: (m: YearMonth) => void; openTx: (id: string) => void }) {
  const { data, c, today, dir, colors } = useApp();
  const { ledger, expenseCategories, incomeCategories, accounts } = data;
  const cats = categoriesInView(ledger, expenseCategories, month);
  const spent = totalSpent(ledger, cats, month);
  const left = leftToSpend(ledger, cats, month);
  const total = cats.reduce((s, x) => s + available(ledger, x, month), 0);
  const budgeted = hasBudgets(cats, month);
  const over = budgeted && left < 0;
  const [acct, setAcct] = useState<string | null>(null);
  const shown = active(accounts);
  const totals = accountTotals(ledger, accounts);
  const sel = shown.find((a) => a.id === acct);
  const sections = homeSections(ledger, month, dir, today, c, sel?.id);
  const byId = new Map(ledger.entries.map((e) => [e.id, e]));
  const thisMonth = today.slice(0, 7);

  return (
    <>
      <div class="large-title">
        <h1>{monthLabel(month)}</h1>
        <MonthNav variant="round" title="" onPrev={() => setMonth(previousMonth(month))} onNext={() => setMonth(nextMonth(month))} nextDisabled={month >= lastNavMonth(ledger, thisMonth)} />
      </div>
      <div class="summary">
        <div class="muted13">{!budgeted ? 'Spent this month' : over ? 'Over budget' : 'Left to spend'}</div>
        <div class={'big' + (over ? ' warn' : '')}>{formatMoney(c, budgeted ? Math.abs(left) : spent)}</div>
        {budgeted && <div class="bar"><i style={{ width: barPercent(spent, total) + '%' }} class={over ? 'warnbg' : ''} /></div>}
        <div class="row between sub13">
          <span>{budgeted ? <>Spent {formatMoney(c, spent)} of {formatMoney(c, total)}</> : 'No budgets set yet'}</span>
          <span>Income {formatMoney(c, income(ledger, incomeCategories, month))}</span>
        </div>
      </div>

      <SectionHeader right={shown.length > 0 && <>Assets {formatMoney(c, totals.assets)}{totals.hasLiability && <> · Owed {formatMoney(c, totals.owed)}</>}</>}>Accounts</SectionHeader>
      <div class="strip">
        {shown.map((a) => (
          <button class={'acard' + (sel ? (sel === a ? ' sel' : ' dim') : '')} key={a.id} aria-pressed={sel === a} onClick={() => setAcct(sel === a ? null : a.id)}>
            <span class="aname"><Icon name={accountIcon(a.type)} size={14} />{a.name}</span>
            <span class="abal">{formatMoney(c, ledger.balance(a.id, accountClass(a.type)))}</span>
          </button>
        ))}
        {shown.length === 0 && <div class="muted14 pad-h">Add an account in Setup.</div>}
      </div>

      <SectionHeader>Transactions</SectionHeader>
      {sel && <div class="chips fchip"><button class="chip" aria-label={`Clear ${sel.name} filter`} onClick={() => setAcct(null)}>{sel.name} ×</button></div>}
      {sections.length === 0 && <div class="empty">{sel ? `No ${sel.name} transactions this month.` : 'No transactions this month. Tap + to add one.'}</div>}
      {sections.map((s) => (
        <div key={s.date}>
          <div class="section-h day">{s.label}</div>
          <div class="group">
            {s.rows.map((r) => {
              const e = byId.get(r.id)!;
              const dot = r.kind === 'income' ? 'var(--accent)' : r.kind === 'transfer' ? 'var(--n700)' : colors.get(e.debitId) ?? 'var(--n600)';
              return (
                <button class="txrow" key={r.id} onClick={() => openTx(r.id)}>
                  <i class="dot" style={{ background: dot }} />
                  <span class="txmain"><span class="txtitle">{r.title}</span><span class="txmeta">{r.meta}</span></span>
                  <span class={'txamt ' + r.kind}>{r.amountText}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div class="spacer" />
    </>
  );
}
