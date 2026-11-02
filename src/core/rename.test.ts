import { describe, expect, it } from 'vitest';
import { renameError } from './rename';

const list = [{ id: 'a', name: 'Cash' }, { id: 'b', name: 'BDO' }, { id: 'c', name: 'Old', archivedAt: '2026-01-01' }];

describe('renameError', () => {
  it('accepts a new name', () => expect(renameError('Wallet', list, 'a')).toBeNull());
  it('rejects empty and whitespace-only names', () => {
    expect(renameError('', list, 'a')).toBe('empty');
    expect(renameError('   ', list, 'a')).toBe('empty');
  });
  it('rejects the unchanged name (after trimming)', () => {
    expect(renameError('Cash', list, 'a')).toBe('unchanged');
    expect(renameError('  Cash ', list, 'a')).toBe('unchanged');
  });
  it('allows changing only the case of its own name', () => expect(renameError('CASH', list, 'a')).toBeNull());
  it('rejects a duplicate of another item, case-insensitive and trimmed', () => {
    expect(renameError('bdo', list, 'a')).toBe('duplicate');
    expect(renameError(' BDO ', list, 'a')).toBe('duplicate');
  });
  it('counts archived items as duplicates', () => expect(renameError('old', list, 'a')).toBe('duplicate'));
  it('only compares within the list it is given (same name elsewhere is fine)', () => {
    const subs = [{ id: 's1', name: 'Rent' }, { id: 's2', name: 'Power' }];
    expect(renameError('BDO', subs, 's1')).toBeNull();
    expect(renameError('power', subs, 's1')).toBe('duplicate');
  });
});
