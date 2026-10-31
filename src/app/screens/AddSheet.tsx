import { useState } from 'preact/hooks';
import {
  addDays, active, draftFromEntry, calculatorOff, currencySymbol, dayLabel, formatMoney, hasOperators, isValidDraft, liveAmount, newDraft,
  pickable, pressKey, prettyExpression, type Entry, type Key, type TransactionDraft, type TxType,
} from '../../core';
import { useApp } from '../ctx';
import { Icon } from '../icons';
import { Segmented, Sheet } from '../ui';

const SIMPLE: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];
const CALC: Key[] = ['clear', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '.', '0', 'backspace', 'equals'];
const LABEL: Partial<Record<Key, string>> = { '*': '×', '/': '÷', '-': '−', clear: 'C', equals: '=' };
type DayMode = 'today' | 'yesterday' | 'custom';

/** New transaction, or (with `edit`) the same sheet pre-filled from a live entry; saving voids and reposts it. */
export function AddSheet({ edit, onClose, onSaved }: { edit?: Entry; onClose: () => void; onSaved: (e: Entry | null) => void }) {
  const { data, c, today, actions, dir, colors } = useApp();
  const accts = active(data.accounts);
  const [d, setD] = useState<TransactionDraft>(() => (edit && draftFromEntry(edit, data.expenseCategories, c)) || newDraft('expense', today, accts[0]?.id, (accts[1] ?? accts[0])?.id));
  const [step, setStep] = useState<'amount' | 'cat'>('amount');
  const [picker, setPicker] = useState<null | 'acct' | 'date'>(null);
  const [calc, setCalc] = useState(false);
  const [mode, setMode] = useState<DayMode>(() => (edit && edit.date !== today ? (edit.date === addDays(today, -1) ? 'yesterday' : 'custom') : 'today'));
  const [busy, setBusy] = useState(false);

  const transfer = d.type === 'transfer';
  const ops = hasOperators(d.expression);
  const amount = liveAmount(d.expression, c);
  const sameAcct = transfer && d.accountId === d.toAccountId;
  const ready = amount > 0 && !!d.accountId && (!transfer || (!!d.toAccountId && !sameAcct));
  const dateText = dayLabel(d.date, today);
  const patch = (p: Partial<TransactionDraft>) => setD((x) => ({ ...x, ...p }));

  const save = async (over: Partial<TransactionDraft> = {}) => {
    const draft = { ...d, ...over };
    if (busy || !isValidDraft(draft, c, new Date())) return;
    setBusy(true);
    try { onSaved(await (edit ? actions.editEntry(edit.id, draft) : actions.post(draft))); } catch (e) { setBusy(false); alert(e instanceof Error ? e.message : String(e)); }
  };

  const amountText = ops ? formatMoney(c, amount) : currencySymbol(c) + (d.expression || '0');
  const keyCol = calc ? 'k4' : 'k3';

  if (step === 'cat') {
    const groups = d.type === 'expense'
      ? pickable(data.expenseCategories).map((cat) => ({ id: cat.id, name: cat.name, color: colors.get(cat.id), items: cat.subs.length ? cat.subs.map((s) => ({ key: s.id, name: s.name, over: { categoryId: cat.id, subcategoryId: s.id } })) : [{ key: cat.id, name: cat.name, over: { categoryId: cat.id } }] }))
      : [{ id: 'income', name: 'Income', color: 'var(--accent)', items: active(data.incomeCategories).map((x) => ({ key: x.id, name: x.name, over: { categoryId: x.id } })) }];
    return (
      <Sheet onClose={onClose} tall>
        <div class="stephead">
          <button class="backbtn" onClick={() => setStep('amount')}><Icon name="left" size={16} />{amountText}</button>
          <span class="muted13 grow right">{dir.name(d.accountId ?? '')} · {dateText}</span>
        </div>
        <div class="pad-h mb10"><input class="field" placeholder="Note (optional)" value={d.note} onInput={(e) => patch({ note: e.currentTarget.value })} /></div>
        <div class="catlist">
          {groups.map((g) => (
            <div key={g.id} class="catgroup">
              <div class="cghead"><i class="dot" style={{ background: g.color }} />{g.name}</div>
              <div class="chips">
                {g.items.map((it) => <button key={it.key} class={'catchip' + ((('subcategoryId' in it.over ? it.over.subcategoryId : undefined) ?? it.over.categoryId) === (d.subcategoryId ?? d.categoryId) ? ' on' : '')} disabled={busy} onClick={() => save(it.over)}>{it.name}</button>)}
                {g.items.length === 0 && <span class="muted13">Nothing here yet. Add one in Setup.</span>}
              </div>
            </div>
          ))}
          {groups.length === 0 && <div class="muted14">No categories yet. Add one in Setup.</div>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} tall>
      <div class="addhead">
        <button class="textbtn" onClick={onClose}>Cancel</button>
        <span class="sheettitle">{edit ? 'Edit Transaction' : 'New Transaction'}</span>
        <span />
      </div>
      <div class="pad-h mt8">
        <Segmented<TxType> label="Type" value={d.type} disabled={!!edit} onChange={(t) => patch({ type: t, categoryId: undefined, subcategoryId: undefined })}
          options={[['expense', 'Expense'], ['income', 'Income'], ['transfer', 'Transfer']]} />
      </div>
      <div class="amountbox">
        <div class="exprline">{ops ? prettyExpression(d.expression) : ''}</div>
        <div class={'amount' + (d.expression ? (d.type === 'income' ? ' inc' : '') : ' placeholder')}>{amountText}</div>
      </div>
      <div class="pills">
        <button class={'pill' + (picker === 'acct' ? ' open' : '') + (sameAcct ? ' bad' : '')} onClick={() => setPicker(picker === 'acct' ? null : 'acct')}>
          <Icon name="wallet" size={15} />
          <span class="ellip">{accts.length === 0 ? 'No account' : transfer ? `${dir.name(d.accountId ?? '')} → ${dir.name(d.toAccountId ?? '')}` : dir.name(d.accountId ?? '')}</span>
          <Icon name="down" size={11} />
        </button>
        <button class={'pill' + (picker === 'date' ? ' open' : '')} onClick={() => setPicker(picker === 'date' ? null : 'date')}>
          <Icon name="calendar" size={15} />{dateText}<Icon name="down" size={11} />
        </button>
        <span class="grow" />
        <button class={'calcbtn' + (calc ? ' on' : '')} aria-label="Calculator" aria-pressed={calc}
          onClick={() => { if (calc) patch({ expression: calculatorOff(d.expression, c) }); setCalc(!calc); }}><Icon name="calculator" size={18} /></button>
      </div>
      {picker === 'acct' && (
        <div class="inpanel">
          {accts.length === 0 && <div class="muted13">Add an account in Setup first.</div>}
          <div class="muted12">{transfer ? 'From' : 'Account'}</div>
          <div class="chips">
            {accts.map((a) => (
              <button key={a.id} class={'chip' + (d.accountId === a.id ? ' on' : '')}
                onClick={() => { patch({ accountId: a.id }); if (!transfer) setPicker(null); }}>{a.name}</button>
            ))}
          </div>
          {transfer && (
            <>
              <div class="muted12">To</div>
              <div class="chips">
                {accts.map((a) => (
                  <button key={a.id} class={'chip' + (d.toAccountId === a.id ? ' on' : '')} onClick={() => { patch({ toAccountId: a.id }); setPicker(null); }}>{a.name}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {picker === 'date' && (
        <div class="inpanel row gap6">
          <button class={'chip' + (mode === 'today' ? ' on' : '')} onClick={() => { patch({ date: today }); setMode('today'); setPicker(null); }}>Today</button>
          <button class={'chip' + (mode === 'yesterday' ? ' on' : '')} onClick={() => { patch({ date: addDays(today, -1) }); setMode('yesterday'); setPicker(null); }}>Yesterday</button>
          <input type="date" class={'dateinput' + (mode === 'custom' ? ' on' : '')} value={mode === 'custom' ? d.date : ''} aria-label="Pick a date"
            onChange={(e) => { const v = e.currentTarget.value; if (v) { patch({ date: v }); setMode('custom'); } }}
            onBlur={() => { if (mode === 'custom') setPicker(null); }} />
        </div>
      )}
      {picker !== 'acct' && <div class={'keypad ' + keyCol}>
        {(calc ? CALC : SIMPLE).map((k) => {
          const op = k === '+' || k === '-' || k === '*' || k === '/';
          const cls = k === 'equals' ? 'eq' : op ? 'op' : k === 'clear' || k === '(' || k === ')' ? 'fn' : '';
          return (
            <button key={k} class={'key ' + cls} aria-label={k === 'backspace' ? 'Delete' : undefined} disabled={k === '.' && c.minorDigits === 0}
              onClick={() => patch({ expression: pressKey(d.expression, k, c) })}>
              {k === 'backspace' ? <Icon name="backspace" size={22} /> : LABEL[k] ?? k}
            </button>
          );
        })}
      </div>}
      <div class="primary-wrap">
        <button class="primary" disabled={!ready || busy} onClick={() => (transfer ? save() : (setPicker(null), setStep('cat')))}>{transfer ? 'Save transfer' : 'Choose category'}</button>
      </div>
    </Sheet>
  );
}
