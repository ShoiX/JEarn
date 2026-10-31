import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ACCOUNT_TYPES, CURRENCIES, bootLine, SnapshotError, accountClass, active, canChangeCurrency, canImport, carryover,
  evaluate, formatMoney, importSnapshot, monthOf, openingEntry, plainAmount, rolloverNote, type AccountType,
} from '../../core';
import { boot } from '../boot';
import { useApp } from '../ctx';
import { accountIcon, Icon } from '../icons';
import { focusOnce, SectionHeader, SwipeRow, Switch } from '../ui';

const TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank', savings: 'Savings', credit: 'Credit card', cash: 'Cash', investment: 'Investment', loan: 'Loan',
};
const CURRENCY_NAME: Record<string, string> = {
  PHP: 'Philippine peso', AUD: 'Australian dollar', USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', NZD: 'New Zealand dollar',
  CAD: 'Canadian dollar', SGD: 'Singapore dollar', JPY: 'Japanese yen', INR: 'Indian rupee',
};
const IMPORT_ERRORS: Record<string, string> = {
  malformed: 'The file is not a valid JEarn export.',
  unsupportedSchemaVersion: 'This export was made by a different version of JEarn.',
  duplicateId: 'Two entries share the same id.',
  badSequence: 'The entry order (seq) has gaps or duplicates.',
  invalidAmount: 'An entry has an amount that is not above zero.',
  sameDebitCredit: 'An entry debits and credits the same account.',
  unknownAccount: 'An entry refers to an account or category that is not in the file.',
  badReversal: 'A reversal does not mirror the entry it voids.',
};
const fail = (e: unknown) => alert(e instanceof Error ? e.message : String(e));
const go = (p: Promise<unknown>) => { p.catch(fail); };

function TypeChips({ value, onPick, tone }: { value: AccountType; onPick: (t: AccountType) => void; tone: 'row' | 'form' }) {
  return (
    <div class={'chips ' + tone}>
      {ACCOUNT_TYPES.map((t) => (
        <button key={t} class={'chip' + (t === value ? ' on' : '')} onClick={() => onPick(t)}><Icon name={accountIcon(t)} size={15} />{TYPE_LABEL[t]}</button>
      ))}
    </div>
  );
}

/** Name field + Add button. */
function NameAdd({ placeholder, onAdd, onCancel }: { placeholder: string; onAdd: (name: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('');
  const submit = () => (v.trim() ? onAdd(v.trim()) : onCancel());
  return (
    <div class="addrow">
      <input class="field" placeholder={placeholder} value={v} ref={focusOnce} onInput={(e) => setV(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
      <button class="primary small" onClick={submit}>Add</button>
    </div>
  );
}

function AddAccount({ onDone }: { onDone: () => void }) {
  const { c, actions } = useApp();
  const [name, setName] = useState(''), [bal, setBal] = useState(''), [type, setType] = useState<AccountType>('bank');
  const submit = () => {
    if (!name.trim()) return onDone();
    const opening = bal.trim() ? evaluate(bal, c) : 0;
    if (opening === null || opening < 0) return alert('Enter a valid opening balance.');
    actions.addAccount(name.trim(), type, opening).then(onDone, fail);
  };
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A tap (not a scroll) outside closes the form; the tap itself is swallowed so nothing shifts under the finger.
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) { e.preventDefault(); e.stopPropagation(); onDone(); } };
    document.addEventListener('click', away, true);
    return () => document.removeEventListener('click', away, true);
  }, []);
  return (
    <div class="addrow wrap" ref={root} onKeyDown={(e) => { if (e.key === 'Escape') onDone(); }}>
      <input class="field grow2" placeholder="Account name" value={name} ref={focusOnce} onInput={(e) => setName(e.currentTarget.value)} />
      <input class="field bal" placeholder="Balance" inputMode="decimal" value={bal} onInput={(e) => setBal(e.currentTarget.value)} />
      <TypeChips value={type} onPick={setType} tone="form" />
      <button class="primary small" onClick={submit}>Add</button>
    </div>
  );
}

export function Setup() {
  const { data, c, today, actions, colors } = useApp();
  const { ledger, accounts, expenseCategories, incomeCategories } = data;
  const thisMonth = monthOf(today);
  const [panel, setPanel] = useState<{ id: string; mode: 'type' | 'opening'; value: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const file = useRef<HTMLInputElement>(null);
  const fmt = (n: number) => formatMoney(c, n);
  const toggleCat = (id: string) => setOpenCats((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });

  const exportData = async () => {
    const { name, text } = actions.exportJson();
    const f = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const importFile = async (f: File) => {
    try {
      const imported = importSnapshot(await f.text());
      const n = imported.ledger.entries.length;
      if (!confirm(`Import ${n} entries, ${imported.accounts.length} accounts and ${imported.expenseCategories.length} expense categories? This replaces your current accounts and categories.`)) return;
      await actions.importData(imported);
    } catch (e) {
      alert(e instanceof SnapshotError ? `Import failed: ${IMPORT_ERRORS[e.code] ?? e.code}` : e instanceof Error ? e.message : String(e));
    }
  };

  const archivedAccounts = accounts.filter((a) => a.archivedAt);
  const archivedCats = expenseCategories.filter((x) => x.archivedAt);
  const archivedSubs = expenseCategories.flatMap((x) => x.subs.filter((s) => s.archivedAt).map((s) => ({ cat: x, sub: s })));
  const archivedIncome = incomeCategories.filter((x) => x.archivedAt);
  const archivedCount = archivedAccounts.length + archivedCats.length + archivedSubs.length + archivedIncome.length;
  const [showArchived, setShowArchived] = useState(false);
  const locked = !canChangeCurrency(ledger);

  return (
    <>
      <div class="large-title"><h1>Setup</h1></div>

      <SectionHeader>Accounts</SectionHeader>
      <div class="group">
        {active(accounts).map((a) => {
          const p = panel?.id === a.id ? panel : null;
          const op = openingEntry(ledger, a.id);
          return (
            <div class="srow-wrap" key={a.id}>
              <SwipeRow id={a.id} name={a.name} openId={openRow} setOpenId={setOpenRow} onArchive={() => { setOpenRow(null); go(actions.archiveAccount(a.id, true)); }}>
              <div class="srow acct">
                <span class="muted"><Icon name={accountIcon(a.type)} size={20} /></span>
                <div class="grow">
                  <div>{a.name}</div>
                  <button class="typebtn" onClick={() => setPanel(p ? null : { id: a.id, mode: 'type', value: '' })}>
                    {TYPE_LABEL[a.type]}<Icon name={p ? 'up' : 'down'} size={10} />
                  </button>
                </div>
                <span class="muted14">{fmt(ledger.balance(a.id, accountClass(a.type)))}</span>
              </div>
              </SwipeRow>
              {p?.mode === 'type' && (
                <div class="panel">
                  <TypeChips value={a.type} tone="row" onPick={(t) => { go(actions.setAccountType(a.id, t)); setPanel(null); }} />
                  <button class="link" onClick={() => setPanel({ id: a.id, mode: 'opening', value: op ? plainAmount(c, op.amountMinor) : '' })}>Correct opening balance</button>
                </div>
              )}
              {p?.mode === 'opening' && (
                <div class="panel">
                  <div class="muted12">Opening balance. The old one is voided and a new one posted.</div>
                  <div class="addrow">
                    <input class="field" inputMode="decimal" placeholder="0" value={p.value} ref={focusOnce} onInput={(e) => setPanel({ ...p, value: e.currentTarget.value })} />
                    <button class="primary small" onClick={() => {
                      const v = p.value.trim() ? evaluate(p.value, c) : 0;
                      if (v === null || v < 0) return alert('Enter a valid amount.');
                      actions.correctOpening(a.id, v).then(() => setPanel(null), fail);
                    }}>Save</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {adding === 'account' ? <AddAccount onDone={() => setAdding(null)} /> : <button class="addbtn" onClick={() => setAdding('account')}><Icon name="plus" size={16} />Add account</button>}
      </div>
      <div class="footnote pad-h">Swipe left on a row to archive it. Archived items can be restored at the bottom.</div>

      <SectionHeader>Expense categories</SectionHeader>
      <div class="group">
        {active(expenseCategories).map((cat) => {
          const open = openCats.has(cat.id), subs = active(cat.subs);
          const note = rolloverNote(cat, carryover(ledger, cat, thisMonth), thisMonth, c);
          return (
            <div class="srow-wrap" key={cat.id}>
              <SwipeRow id={cat.id} name={cat.name} openId={openRow} setOpenId={setOpenRow} onArchive={() => { setOpenRow(null); go(actions.archiveExpenseCategory(cat.id, true)); }}>
              <div class="srow">
                <button class="catbtn" onClick={() => toggleCat(cat.id)}>
                  <i class="dot" style={{ background: colors.get(cat.id) }} /><span class="grow left">{cat.name}</span>
                  <span class="muted13">{subs.length}</span><span class="muted"><Icon name={open ? 'up' : 'down'} size={14} /></span>
                </button>
              </div>
              </SwipeRow>
              {open && (
                <div class="catbody">
                  <div class="rollrow">
                    <div class="grow"><div class="t14">Roll over to next month</div><div class={'muted12' + (note.negative ? ' warn' : '')}>{note.text}</div></div>
                    {cat.rollover && <button class="ghost small" onClick={() => go(actions.resetRollover(cat.id, thisMonth))}>Reset</button>}
                    <Switch on={cat.rollover} label="Roll over to next month" onChange={(v) => go(actions.setRollover(cat.id, v, thisMonth))} />
                  </div>
                  {subs.map((s) => (
                    <SwipeRow key={s.id} id={s.id} name={s.name} openId={openRow} setOpenId={setOpenRow} onArchive={() => { setOpenRow(null); go(actions.archiveSubcategory(cat.id, s.id, true)); }}>
                      <div class="subline"><span class="grow">{s.name}</span></div>
                    </SwipeRow>
                  ))}
                  {adding === 'sub:' + cat.id
                    ? <NameAdd placeholder="Subcategory name" onCancel={() => setAdding(null)} onAdd={(n) => { go(actions.addSubcategory(cat.id, n)); setAdding(null); }} />
                    : <button class="addbtn flush" onClick={() => setAdding('sub:' + cat.id)}><Icon name="plus" size={16} />Add subcategory</button>}
                </div>
              )}
            </div>
          );
        })}
        {adding === 'cat'
          ? <NameAdd placeholder="Category name" onCancel={() => setAdding(null)} onAdd={(n) => { go(actions.addExpenseCategory(n)); setAdding(null); }} />
          : <button class="addbtn" onClick={() => setAdding('cat')}><Icon name="plus" size={16} />Add category</button>}
      </div>

      <SectionHeader>Income categories</SectionHeader>
      <div class="group">
        {active(incomeCategories).map((x) => (
          <SwipeRow key={x.id} id={x.id} name={x.name} openId={openRow} setOpenId={setOpenRow} onArchive={() => { setOpenRow(null); go(actions.archiveIncomeCategory(x.id, true)); }}>
            <div class="srow"><span class="grow">{x.name}</span></div>
          </SwipeRow>
        ))}
        {adding === 'income'
          ? <NameAdd placeholder="Income category" onCancel={() => setAdding(null)} onAdd={(n) => { go(actions.addIncomeCategory(n)); setAdding(null); }} />
          : <button class="addbtn" onClick={() => setAdding('income')}><Icon name="plus" size={16} />Add income category</button>}
      </div>

      {archivedCount > 0 && (
        <>
          <SectionHeader>Archived</SectionHeader>
          <div class="group">
            <div class="srow">
              <button class="catbtn archtoggle" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
                <span class="grow left">{archivedCount} {archivedCount === 1 ? 'item' : 'items'}</span>
                <span class="muted"><Icon name={showArchived ? 'up' : 'down'} size={14} /></span>
              </button>
            </div>
            {showArchived && <>
            {archivedAccounts.map((a) => <ArchivedRow key={a.id} name={a.name} onRestore={() => go(actions.archiveAccount(a.id, false))} />)}
            {archivedCats.map((x) => <ArchivedRow key={x.id} name={x.name} onRestore={() => go(actions.archiveExpenseCategory(x.id, false))} />)}
            {archivedSubs.map(({ cat, sub }) => <ArchivedRow key={sub.id} name={`${cat.name} › ${sub.name}`} onRestore={() => go(actions.archiveSubcategory(cat.id, sub.id, false))} />)}
            {archivedIncome.map((x) => <ArchivedRow key={x.id} name={x.name} onRestore={() => go(actions.archiveIncomeCategory(x.id, false))} />)}
            </>}
          </div>
        </>
      )}

      <SectionHeader>Currency</SectionHeader>
      <div class="group">
        <div class="srow">
          <span class="grow">Ledger currency</span>
          <select class="select" aria-label="Currency" disabled={locked} value={c.code} onChange={(e) => go(actions.setCurrency(e.currentTarget.value))}>
            {CURRENCIES.map((x) => <option key={x.code} value={x.code}>{x.code} · {CURRENCY_NAME[x.code]}</option>)}
          </select>
        </div>
      </div>
      {locked && <div class="footnote pad-h">Locked once the first transaction exists.</div>}

      <SectionHeader>Data</SectionHeader>
      <div class="group">
        <button class="addbtn" onClick={() => go(exportData())}>Export data</button>
        {canImport(ledger) && <button class="addbtn" onClick={() => file.current?.click()}>Import data</button>}
      </div>
      {boot.data > 0 && <div class="footnote pad-h">{bootLine(boot)}</div>}
      <input ref={file} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void importFile(f); }} />
      <div class="spacer" />
    </>
  );
}

function ArchivedRow({ name, onRestore }: { name: string; onRestore: () => void }) {
  return (
    <div class="srow">
      <span class="grow muted">{name}</span>
      <button class="link" onClick={onRestore}>Restore</button>
    </div>
  );
}
