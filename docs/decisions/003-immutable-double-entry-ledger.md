# 003 — Immutable, lean double-entry ledger

**Status:** Accepted (2026-10-27)

**Context:** The owner wants financial data kept as an immutable ledger that follows standard bookkeeping practice, with the system as lean as possible. The prototype edits and deletes transactions freely.

**Decision:** An append-only ledger with one `Entry` table. Each entry has one debit, one credit and one positive amount in `Int64` minor units. Corrections are reversal entries (void); nothing is updated or deleted. Accounts and categories are archived, never deleted. There are no split transactions, no postings table and no hash chain. See [../spec/ledger.md](../spec/ledger.md).

**Consequences:** "Delete" becomes "Void". "Clear transactions" is removed. Import, restore and sample data only work on an empty ledger. The ledger currency is locked once entries exist. Balances and budgets are always derived from entries. Credit cards and loans are proper liabilities.
