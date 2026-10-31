import { useRef, useState } from 'preact/hooks';
import {
  available, barPercent, budgetAt, carryover, categoriesInView, evaluate, formatMoney, lastNavMonth, monthLabel, nextMonth, plainAmount,
  previousMonth, rolloverLine, spent, spentSub, subBudgetOverflow, subsInView, totalSpent, type YearMonth,
} from '../../core';
import { useApp } from '../ctx';
import { Icon } from '../icons';
import { MonthNav } from '../ui';

export function Budgets({ month, setMonth }: { month: YearMonth; setMonth: (m: YearMonth) => void }) {
  const { data, c, today, actions, colors } = useApp();
  const { ledger, expenseCategories } = data;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null);
  const cancelled = useRef(false);

  const cats = categoriesInView(ledger, expenseCategories, month);
  const fmt = (n: number) => formatMoney(c, n);

  const commit = (catId: string, subId: string | undefined, current: number) => {
    if (cancelled.current) { cancelled.current = false; return; }
    const v = edit ? evaluate(edit.value, c) : null;
    setEdit(null);
    if (v === null || v < 0 || v === current) return;
    actions.setBudget(catId, subId, month, v).catch((e) => alert(String(e.message ?? e)));
  };
  const budgetField = ({ k, catId, subId, current, small }: { k: string; catId: string; subId?: string; current: number; small?: boolean }) =>
    edit?.key === k ? (
      <input class={'budget-input' + (small ? ' small' : '')} type="text" inputMode="decimal" value={edit.value}
        ref={(el) => { if (el && !el.dataset.f) { el.dataset.f = '1'; el.focus(); el.select(); } }}
        onInput={(e) => setEdit({ key: k, value: e.currentTarget.value })}
        onBlur={() => commit(catId, subId, current)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { cancelled.current = true; setEdit(null); }
        }} />
    ) : (
      <button class={'budget-btn' + (small ? ' small' : '')} onClick={() => { cancelled.current = false; setEdit({ key: k, value: plainAmount(c, current) }); }}>{fmt(current)}</button>
    );

  const totalAvail = cats.reduce((s, x) => s + available(ledger, x, month), 0);
  return (
    <>
      <div class="large-title">
        <h1>Budgets</h1>
        <MonthNav variant="plain" title={monthLabel(month, true)} onPrev={() => setMonth(previousMonth(month))} onNext={() => setMonth(nextMonth(month))} nextDisabled={month >= lastNavMonth(ledger, today.slice(0, 7))} />
      </div>
      <div class="row between sub13 pad-h mb12"><span>Spent {fmt(totalSpent(ledger, cats, month))}</span><span>Available {fmt(totalAvail)}</span></div>
      <div class="cards">
        {cats.map((cat) => {
          const color = colors.get(cat.id)!;
          const sp = spent(ledger, cat, month), base = budgetAt(cat.budgets, month);
          const carry = carryover(ledger, cat, month), avail = base + carry, over = sp > avail;
          const expanded = open.has(cat.id), subs = subsInView(ledger, cat, month), ov = subBudgetOverflow(cat, month);
          const line = cat.rollover ? rolloverLine(cat, carry, avail, month, c) : null;
          return (
            <div class="card" key={cat.id}>
              <div class="row gap8">
                <i class="dot" style={{ background: color }} />
                <span class="cname">{cat.name}</span>
                <span class="sub14">{fmt(sp)} /</span>
                {budgetField({ k: cat.id, catId: cat.id, current: base })}
              </div>
              <div class="bar"><i style={{ width: barPercent(sp, avail) + '%', background: over ? 'var(--warn)' : color }} /></div>
              {line && <div class={'rollline' + (line.negative ? ' warn' : '')}><Icon name="bend" size={13} />{line.text}</div>}
              <button class="cardfoot" onClick={() => setOpen((s) => { const n = new Set(s); if (!n.delete(cat.id)) n.add(cat.id); return n; })}>
                <span class={over ? 'warn' : ''}>{over ? `${fmt(sp - avail)} over` : `${fmt(avail - sp)} left`}</span>
                <span class="row gap4">{subs.length} {subs.length === 1 ? 'subcategory' : 'subcategories'}<Icon name={expanded ? 'up' : 'down'} size={13} /></span>
              </button>
              {expanded && (
                <div class="subs">
                  {subs.map((s) => {
                    const ssp = spentSub(ledger, s, month), sb = budgetAt(s.budgets, month);
                    return (
                      <div class="subrow" key={s.id}>
                        <div class="row gap8">
                          <span class="subname">{s.name}</span>
                          <span class="muted13">{fmt(ssp)} /</span>
                          {budgetField({ k: s.id, catId: cat.id, subId: s.id, current: sb, small: true })}
                        </div>
                        <div class="bar thin"><i style={{ width: barPercent(ssp, sb) + '%', background: ssp > sb ? 'var(--warn)' : color }} /></div>
                      </div>
                    );
                  })}
                  {ov && <div class="warn12">Subcategory budgets add up to {fmt(ov.subsTotalMinor)}, more than {fmt(ov.categoryMinor)}.</div>}
                  {subs.length === 0 && <div class="muted13">No subcategories.</div>}
                </div>
              )}
            </div>
          );
        })}
        {cats.length === 0 && <div class="empty">No expense categories yet. Add some in Setup.</div>}
        <div class="footnote">Tap an amount to change the budget from this month onward. Earlier months keep their budget. Turn on rollover per category in Setup.</div>
      </div>
    </>
  );
}
