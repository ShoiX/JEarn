# 005 — Backup server: records, self-signed keys, Postgres

**Status:** Accepted (2026-10-31). Amends [002](002-server-backup-not-icloud.md): the one-way backup to the owner's server stands, but the full-snapshot upload, per-user `user_id` and "token per device" are replaced as below.

**Context:** Before building the backup, the owner set these goals: backups run by themselves; only the owner can let someone back up; no server setup per person; storage separated per person and encrypted at rest; new records saved instead of whole snapshots; everything as lean as possible. Auth0 was considered and dropped: its access tokens expire after at most 30 days (monthly re-paste), machine-to-machine tokens have a small free quota, and a browser can't request them without exposing a secret.

**Decision:**
- **Records, not snapshots.** The phone sends only ledger entries the server doesn't have yet, found by `seq` (entries are append-only and numbered 1, 2, 3…), plus the small reference data (accounts, categories, budgets, currency) when it changed. The server only ever inserts entries; it never updates or deletes them. A running SHA-256 hash of all entries lets both sides confirm they hold the same ledger.
- **Self-signed access keys.** The owner holds an Ed25519 private key (in a password manager); the server holds only the public key. A small script on the owner's machine signs an access key (a JWT with a key ID, a random backup ID and the server URL). The person pastes it into JEarn once; it never expires. Revoking = adding the key ID to a block-list file on the server. No admin endpoint, no user accounts, no third-party auth.
- **The key, not the phone, identifies a backup.** A new phone pastes the same key and restores. There's no device ID; the owner doesn't reuse a key across phones, and the app stops with an error if the server holds entries the phone doesn't.
- **Postgres, shared tables, row-level security.** Every row carries a `backup_id`; Postgres policies (forced, and the API connects as a non-owner role) make other backups' rows invisible. The API role can't update or delete entries.
- **Encryption at rest** by the disk: Postgres data lives on an attached AWS Lightsail disk (encrypted by default). Not end-to-end, so the owner can analyse the data later.
- **Server:** Node 26 LTS, Koa, `pg`; Docker Compose (dev and prod files). HTTPS is terminated by the owner's reverse proxy (probably Traefik, not set up yet). The code lives in this repo, reorganised as npm workspaces (`apps/web`, `apps/backup-server`, `packages/core`), so the app and server share one copy of the record format and validation.

**Consequences:**
- Adding a person = running one command and sending them the key. Nothing changes on the server.
- The private key must be backed up; losing it means no new keys (existing keys keep working). If it leaks, make a new pair and reissue every key.
- An access key works like a password for one backup. Revoking takes a config change and a restart.
- No phone-side database upgrade: the phone only remembers how far the server has confirmed (`seq`, hash).
- iPhone web apps can't run in the background, so backups happen only when the app is opened or left. A small icon on Home shows the state.
- Restore reuses Import and only works on an empty phone.
- Still open: the server's domain, the reverse-proxy config and the nightly off-server copy.
