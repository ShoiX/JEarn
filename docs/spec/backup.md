# JEarn — Server Backup

## Future: Server Backup (design for it now, build later)
Planned approach: **one-way backup** from the app to the owner's private cloud server over HTTPS. Not two-way sync. No iCloud/CloudKit (it would require a paid Apple Developer account) and no third-party SDK (use `URLSession`).

**Scope: data only.** Back up accounts, expense/income categories, subcategories, budgets, the full ledger (including voided entries and their reversals) and the currency setting. Nothing else leaves the device — no UI state (selected tab, viewed month, open sheets, drafts), no analytics, no logs, no device info.

**How it will work**
- **When:** on app launch and when the app moves to the background (`scenePhase`), only if data changed since the last backup. No background tasks. Never blocks the UI; failures retry silently on the next trigger.
- **What:** a full JSON snapshot (not incremental), sent via `POST /backup`. The ledger is append-only, so each snapshot is a superset of the last; the server can reject a snapshot that alters or drops existing entries.
- **Auth:** HTTPS only; a per-device bearer token entered once in Setup and stored in the Keychain.
- **Restore:** Setup → “Restore from server”, only available when the local ledger is empty (fresh install).
- The same JSON format is used by the manual **Export / Import** in Setup (v1, see Setup in [product.md](product.md)).

**Snapshot format (readable, for later analysis)**
- Top level: `schemaVersion`, `exportedAt`, `appVersion`, `currency`, then arrays of accounts, expense categories (with subcategories and budget history), income categories and ledger entries (ordered by `seq`).
- Records carry their UUID **and** human-readable names (e.g. an entry includes `debitName`, `creditName`), so the data is understandable without joining ids.
- Amounts as integer minor units (`amountMinor: 1250` = $12.50 in the ledger currency), dates as ISO 8601, budget months as `YYYY-MM`.
- Bump `schemaVersion` on any format change and document it.

**v1 model rules (so adding backup later is a small change)**
- Use **UUID** ids generated on device (not incrementing integers).
- Follow the [ledger rules](ledger.md): append-only entries, integer minor units, archive instead of delete.
- Reference data (accounts, categories, budgets, settings) keeps a `createdAt` and `updatedAt`.
- Give model properties defaults or make them optional, to keep SwiftData migrations painless.
- Keep snapshot encode/decode in one place, separate from the UI.

**Server side (out of scope for the app)**
- The server stores each snapshot and loads it into a database. The owner may later analyse it with an AI agent (e.g. a Hermes agent), so data is not end-to-end encrypted — the server itself must be secured (HTTPS, firewall, database not publicly exposed).
- Multi-user-ready from the start: every stored row tagged with a `user_id`; one token per user/device. The app itself stays single-user.

**Setup UI later (not v1):** a “Server backup” group — server URL, token, status (On / Off / Last backed up), “Back up now”, “Restore from server”.

**If other users are supported later:** requires a login in the app, App Store/TestFlight distribution (paid Apple Developer account), and user consent and privacy handling for their financial data.

