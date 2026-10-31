# 006 — Future-dated entries allowed

**Status:** Accepted (2026-10-31). Amends the "Two dates" rule in [../spec/ledger.md](../spec/ledger.md).

**Context:** The rule was that an entry's date is never after today. The owner wants to log bills ahead of time, e.g. tomorrow's bill.

**Decision:** An entry's `date` may be any calendar day, past or future, with no upper limit. Future-dated entries are normal ledger entries: balances include them at once, and budgets and reports count them in the month of their date. There is no "upcoming" state and no scheduling.

**Consequences:** Import no longer rejects entries dated after the export day. `recordedAt` is still the real time of entry. The month switcher can go forward to the latest month that holds an entry. A reversal still mirrors its target's date.
