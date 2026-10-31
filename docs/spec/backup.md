# JEarn — Server Backup

One-way, automatic backup from the app to the owner's server over HTTPS. Not two-way sync. Why it's built this way: [decision 005](../decisions/005-backup-server-design.md).

## Scope
- **Data only:** accounts, expense/income categories, subcategories, budgets, the full ledger (including voided entries and their reversals) and the currency.
- Nothing else leaves the device: no UI state, drafts, analytics, logs or device info.
- The same record format is used by the manual **Export / Import** in Setup ([product.md](product.md)), which stays as the offline fallback.

## Access keys
- The owner has one **Ed25519 key pair**. The private key is kept in the owner's password manager; the server only has the public key.
- An **access key** is a JWT signed with the private key (`alg: EdDSA`). Payload:
  - `jti`: key ID (random, short; used for revoking)
  - `sub`: backup ID (random UUID; every stored row is tagged with it)
  - `aud`: the server's HTTPS URL (so the app needs only the key, no separate URL)
  - `iat`: when it was made. **No expiry.**
- `jearn-key` (in `apps/backup-server`, run on the owner's machine):
  - `pair`: makes a key pair; prints the private key (for the password manager) and the public key (for the server's `.env`).
  - `new --url <server URL>`: asks for the private key with hidden input (never as an argument, never written to disk) and prints the access key, its key ID and backup ID.
- **Revoke:** add the key ID to the server's block-list file, then restart the API. To revoke all keys: new key pair, new public key on the server, reissue keys.
- One key = one backup = one phone at a time. A new phone uses the same key and restores.

## API
All requests: HTTPS, `Authorization: Bearer <access key>`, JSON. The server accepts requests only from the app's origin (CORS; `https://shoix.github.io`, plus `http://localhost:5173` in dev).

| Endpoint | Does | Reply |
|---|---|---|
| `GET /status` | Where the server is | `{ lastSeq, chainHash }` (`0` and the empty hash for a new backup) |
| `POST /backup` | Saves one batch | `{ lastSeq, chainHash }` |
| `GET /restore` | Rebuilds the whole backup | a snapshot (format below), with names filled in |

**Auth on every request:** valid signature against the public key; `aud` equals the server's own URL; key ID not on the block list. Otherwise `401 { error: "keyRejected" }`. A backup is created on its first `POST /backup`.

**Limits:** body ≤ 1 MB (`413`); 30 requests per minute per key (`429`).

### `POST /backup`
Body: `{ schemaVersion, appVersion, currency, accounts, expenseCategories, incomeCategories, entries }`.
- Reference data (accounts, categories with subcategories and budgets, income categories, currency) is sent **whole** in every batch; the server replaces its copy (records are never removed: the app only archives).
- `entries`: up to **500**, consecutive by `seq`, in snapshot form without `debitName`/`creditName`.

The server, in one database transaction:
1. Entries with `seq ≤ lastSeq` must match the stored ones exactly (a resend after a lost reply) and are skipped. Any difference → `409 { error: "conflict" }`.
2. If the first new entry isn't `lastSeq + 1` → `409 { error: "gap", lastSeq }`; the app resends from there.
3. Validates the batch with the same rules as Import (shared code in `packages/core`), against the stored entries and the sent reference data, so anything stored can always be restored. Failure → `422 { error: "invalid", detail }`.
4. Saves reference data, inserts the new entries, updates `lastSeq` and `chainHash`.

### Chain hash
Both sides compute it the same way (shared code):
- Start: 64 zeros. For each entry in `seq` order: `hash = SHA-256(hash + "\n" + canonical JSON of the entry)`, as lowercase hex.
- Canonical JSON: the entry's stored fields only (`id, seq, kind, date, recordedAt, debitId, creditId, amountMinor, note`, and `reverses` if present), keys sorted, no spaces. Names are left out (they change with renames).

## Phone side
**Remembered on the phone** (settings store; no database upgrade): the access key, `ackedSeq`, `ackedHash`, `ackedRefHash` (SHA-256 of the canonical reference data) and the time of the last successful backup.

**When:** on opening the app and when it's left (`visibilitychange` → hidden). Only if there's something to send: local entries past `ackedSeq`, or reference data whose hash differs from `ackedRefHash`. Otherwise no network call. No background sync (iPhone web apps can't).

**How:** send batches of 500 entries from `ackedSeq + 1`, with the reference data. After each reply:
- `chainHash` must equal the phone's own hash at `lastSeq` → save `ackedSeq`, `ackedHash`, `ackedRefHash`, time; next batch.
- Hash differs, `conflict`, or the server's `lastSeq` is past the phone's last entry → stop with **"This backup doesn't match this phone"** (key reused or data diverged). Never resent in a loop.
- `gap` → continue from the server's `lastSeq`.
- `keyRejected` → stop with **"Backup key rejected"**.
- Network error → stop quietly; retried at the next trigger.
- When leaving the app, a request under 60 KB is sent with `keepalive` so it can finish after the app is hidden. Larger ones may be cut off and resume on the next open.

**Status icon** (top-right of Home; hidden when no key is set):

| State | Looks | Tap |
|---|---|---|
| Backed up | cloud + check, dimmed | shows "Backed up 2 min ago" |
| Backing up | cloud + arrow, animated | nothing |
| Waiting to send | cloud + dot | backs up now |
| Problem | cloud + "!", warn colour | shows the reason, then retries |

"Problem" = key rejected, backup doesn't match, or no successful backup for **3 days** while there's something to send. A short network failure alone stays "Waiting to send".

**Setup → Backup:** one "Backup key" row. Paste + Save checks the key's form (a JWT whose `aud` is an `https://` URL; `http://localhost` allowed in dev), then calls `GET /status`:
- Server empty → first backup starts.
- Server has a backup and this phone's ledger is empty → "Restore from backup? *N* entries" (Restore / Not now).
- Server has a backup and the phone has entries → allowed only if the phone's hash at the server's `lastSeq` matches (same backup, e.g. key pasted again); otherwise "This key belongs to a different backup. Restore it on an empty phone, or use a new key."
- Row shows the server's host when set, and "Remove key" (stops backups on this phone; nothing on the server changes).

## Restore
- Only on an empty phone, never a merge. Same rule as Import.
- `GET /restore` returns a snapshot; the app loads it with the existing Import, then stores `ackedSeq`, `ackedHash`, `ackedRefHash` so nothing is resent.

## Snapshot format (Export, Import, Restore)
- Top level: `schemaVersion`, `exportedAt`, `appVersion`, `currency`, then arrays of accounts, expense categories (with subcategories and budget history), income categories and ledger entries (ordered by `seq`).
- Records carry their UUID **and** human-readable names (e.g. an entry includes `debitName`, `creditName`), so the data is understandable without joining ids.
- Amounts as integer minor units (`amountMinor: 1250` = 12.50 in the ledger currency), entry `date` as an ISO 8601 calendar day (`YYYY-MM-DD`), timestamps (`recordedAt`, `createdAt`, `updatedAt`, `archivedAt`, `exportedAt`) as ISO 8601 UTC, budget months as `YYYY-MM`.
- **Import validation** (rejects the whole file on any failure): supported `schemaVersion`; `seq` runs 1, 2, 3… with no gaps or duplicates; every amount > 0; debit ≠ credit; every debit/credit id refers to a known account, category, subcategory, income category or Opening Balances; entry ids are unique; every reversal references an earlier, non-reversal entry, mirrors it exactly (debit and credit swapped, same amount, same date), and each entry is reversed at most once.
- Bump `schemaVersion` on any format change and document it. The server keeps accepting older versions.

## Server
- **Stack:** Node 26 LTS (pinned), Koa (`@koa/router`, `@koa/bodyparser`, `@koa/cors`), `pg`. Signatures checked with `node:crypto`. Code in `apps/backup-server`.
- **Database:** Postgres. Tables mirror the snapshot records, one column per field, every row with `backup_id`: `backups` (`backup_id`, `last_seq`, `chain_hash`, `currency`, timestamps), `entries`, `accounts`, `expense_categories` and `subcategories` (budget history as a JSON column), `income_categories`. A view adds names to entries for reading/analysis.
- **Isolation:** row-level security on every table, forced, keyed on `backup_id` set per transaction (`SET LOCAL app.backup_id`). The API connects as a non-owner role without `BYPASSRLS`. Migrations run separately with the owner role.
- **Append-only in the database too:** the API role has no `UPDATE`/`DELETE` on `entries`, and no `DELETE` anywhere.
- **Deleting a backup** (after revoking): done by the owner with the owner role, by `backup_id`. Documented in the deploy checklist.
- **Encryption at rest:** Postgres data on an attached Lightsail disk (encrypted by default). HTTPS: the owner's reverse proxy (Traefik, placeholder config for now). The API listens only on the internal/local network.
- **Docker Compose:** `compose.dev.yaml` (API with reload + Postgres, ports on localhost) and `compose.prod.yaml` (API + Postgres, proxy labels as placeholders). Secrets in a `.env` on the server only.
- **Tests:** Vitest; database tests on PGlite locally and real Postgres in CI.
- **Later:** nightly encrypted off-server copy (location undecided); a read-only role for AI analysis.
