// Renaming reference data (accounts, categories, subcategories): why a new name can't be saved.
export type RenameError = 'empty' | 'unchanged' | 'duplicate';

/** `items` is the whole list the item lives in (archived included). Null means the name can be saved. */
export function renameError(name: string, items: readonly { id: string; name: string }[], selfId: string): RenameError | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (items.some((x) => x.id === selfId && x.name === n)) return 'unchanged';
  const key = n.toLowerCase();
  return items.some((x) => x.id !== selfId && x.name.trim().toLowerCase() === key) ? 'duplicate' : null;
}
