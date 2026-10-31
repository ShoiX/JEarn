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
- **Two dates:** `date` = the calendar day it happened (user-chosen; any day, past or future, see [006](../decisions/006-future-dated-entries.md). Balances include all live entries regardless of date; budgets and reports use the entry's date); `recordedAt` = the instant it was entered (system clock, never changes). `seq` = local monotonic counter giving the posting order, starting at 1.
- **Calendar days are time-zone independent:** `date` is stored as a plain calendar day string `YYYY-MM-DD` (no time, no zone), and all month/day bucketing works on that string. An entry made on 31 Oct stays in October even if the phone later changes time zone. Only "what is today" uses the device time zone.
- **Opening entries** are posted through a helper that picks the direction from the account class (see table), so callers never choose debit/credit by hand.
- **Money:** integer minor units (cents; a JS safe integer) in the single ledger currency (ISO 4217). Never use floating point for money: calculator input is evaluated with exact fractions, then rounded to the nearest minor unit (half away from zero). Amount entry allows as many decimals as the currency has minor digits (0 for JPY).
- Correcting an opening balance: void the opening entry and post a new one (Setup → account → "Correct opening balance").
- **Editing** a transaction is the same pattern: void + post the corrected entry, written atomically (one IndexedDB transaction). No link field between them; the entries keep their own `seq` order.

## Data Model
```
// Reference data — editable (rename, budgets, archive), never deleted
Account      { id, name, type: bank|savings|credit|cash|investment|loan, archivedAt?, createdAt, updatedAt }
ExpenseCat   { id, name, budgets: [BudgetEntry], rollover: Bool = false, rollStart: YYYY-MM?, subs: [SubCat], archivedAt?, createdAt, updatedAt }
SubCat       { id, name, budgets: [BudgetEntry], archivedAt?, createdAt, updatedAt }
BudgetEntry  { from: YYYY-MM, amountMinor: integer }
IncomeCat    { id, name, archivedAt?, createdAt, updatedAt }
Settings     { currency: ISO 4217 code (default PHP; locked once the ledger has entries) }

// Ledger — append-only, never updated or deleted
Entry        { id, seq: integer, kind: expense|income|transfer|opening|reversal,
               date: YYYY-MM-DD, recordedAt: ISO 8601 UTC timestamp,
               debitId, creditId,          // ids of Account / ExpenseCat / SubCat / IncomeCat / Opening Balances
               amountMinor: integer (> 0),
               note, reverses: id? }
```
Money is integer minor units. Ids are UUIDs (`crypto.randomUUID()`). An entry is voided if a reversal entry references it. The Home list shows expense/income/transfer entries that are not voided.

