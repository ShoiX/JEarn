# 002 — Backup to own server, not iCloud sync

**Status:** Accepted (2026-10-27). Upload method and auth amended by [005](005-backup-server-design.md).

**Context:** The original handoff planned SwiftData + CloudKit sync. CloudKit requires a paid Apple Developer account. The owner has a private cloud server, wants to analyse the data there later (e.g. with a Hermes agent), and may support other users in the future. Only one device edits the data.

**Decision:** One-way backup (not two-way sync): a full JSON snapshot over HTTPS to the owner's server, on app launch and on backgrounding. It is not built in v1; v1 ships manual JSON export/import. See [../spec/backup.md](../spec/backup.md).

**Consequences:** No conflict resolution is needed. The snapshot format must stay readable and versioned (`schemaVersion`). Data on the server is not end-to-end encrypted, so the server must be secured. The server is multi-user-ready (`user_id`); the app stays single-user.
