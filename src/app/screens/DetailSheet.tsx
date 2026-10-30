import { detailRows } from '../../core';
import { useApp } from '../ctx';
import { Sheet } from '../ui';

export function DetailSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, c, today, dir, actions } = useApp();
  const e = data.ledger.entries.find((x) => x.id === id);
  if (!e) return null;
  const d = detailRows(e, dir, c, today);
  const voidIt = () => {
    if (!confirm('Void this transaction? A reversing entry is posted and it disappears from your lists. The original stays in the ledger.')) return;
    actions.voidEntry(id).then(onClose, (err) => alert(err instanceof Error ? err.message : String(err)));
  };
  return (
    <Sheet onClose={onClose} tall={false}>
      <div class="addhead"><span /><span /><button class="textbtn right bold" onClick={onClose}>Done</button></div>
      <div class="detailtop">
        <div class="muted13">{d.kind}</div>
        <div class={'dbig ' + d.tone}>{d.amountText}</div>
      </div>
      <div class="detailrows">
        {d.rows.map(([k, v]) => <div class="drow" key={k}><span class="muted14">{k}</span><span class="dval">{v}</span></div>)}
      </div>
      <div class="pad-h mt16"><button class="destructive" onClick={voidIt}>Void transaction</button></div>
    </Sheet>
  );
}
