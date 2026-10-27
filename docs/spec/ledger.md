# JEarn — Ledger & Data Model

Strictest part of the spec. Change only with a decision record in [../decisions/](../decisions/).

## Ledger rules (immutable, double-entry)
The prototype edits and deletes records freely; **these rules override it.**
- **Append-only.** Entries are only ever inserted, never updated or deleted. Enforce in code: one ledger module exposes `post()` and `void()` only. Never erase the ledger in-app.
- **Double-entry, kept lean:** every entry has exactly one debit account, one credit account and one positive amount, so it balances by construction (no split transactions, no separate postings table).
  | Kind | Debit | Credit |
  |---|---|---|
  | expense | expense category (subcategory if set) | asset/liability account |
  | income | asset/liability account | income category |
  | transfer | to-account | from-account |
  | opening | the account (asset) / Opening Balances (liability) | Opening Balances (asset) / the account (liability) |
  | reversal | original credit | original debit |
- Account classes: bank, savings, cash, investment = **asset**; credit card, loan = **liability**; expense/income categories = **expense/income**; one built-in **equity** account "Opening Balances" (fixed id).
- **Voiding** posts a `reversal` entry with `reverses = original.id`, the same `date` and amount as the original (so past months net to zero). An entry can be voided once; reversals cannot be voided.
- **Two dates:** `date` = when it happened (user-chosen, may be backdated, max today); `recordedAt` = when it was entered (system clock, never changes). `seq` = local monotonic counter giving the posting order.
- **Money:** integer minor units (`Int64`, cents) in the single ledger currency (ISO 4217). Use `Decimal` only for calculator input and display formatting, then round to the nearest minor unit (half away from zero). Amount entry allows as many decimals as the currency has minor digits (0 for JPY).
- Correcting an opening balance: void the opening entry and post a new one (Setup → account → "Correct opening balance").

## Data Model
```
// Reference data — editable (rename, budgets, archive), never deleted
Account      { id, name, type: bank|savings|credit|cash|investment|loan, archivedAt?, createdAt, updatedAt }
ExpenseCat   { id, name, budgets: [BudgetEntry], rollover: Bool = false, rollStart: YYYY-MM?, subs: [SubCat], archivedAt?, createdAt, updatedAt }
SubCat       { id, name, budgets: [BudgetEntry], archivedAt?, createdAt, updatedAt }
BudgetEntry  { from: YYYY-MM, amountMinor: Int64 }
IncomeCat    { id, name, archivedAt?, createdAt, updatedAt }
Settings     { currency: ISO 4217 code (default AUD; locked once the ledger has entries) }

// Ledger — append-only, never updated or deleted
Entry        { id, seq: Int64, kind: expense|income|transfer|opening|reversal,
               date: Date, recordedAt: Date,
               debitId, creditId,          // ids of Account / ExpenseCat / SubCat / IncomeCat / Opening Balances
               amountMinor: Int64 (> 0),
               note, reverses: id? }
```
Money is integer minor units (`Int64`). An entry is voided if a reversal entry references it. The Home list shows expense/income/transfer entries that are not voided.

