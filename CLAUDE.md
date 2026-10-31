# JEarn

Personal, single-user budget tracker, built as an offline-first PWA for iPhone (SE 2nd gen, 375×667). $0 to build and run.

## Docs (source of truth)
- `docs/spec/product.md`: screens, behaviour, footprint, state
- `docs/spec/ledger.md`: ledger rules and data model (strictest; change only with a decision record)
- `docs/spec/backup.md`: server backup (keys, API, sync, restore, server) and snapshot format
- `docs/spec/design.md`: HIG visual direction, tokens, icons
- `docs/decisions/`: why key choices were made (PWA instead of native, server backup, immutable ledger). Don't reverse one without a new decision record.
- `docs/prototype/`: frozen HTML prototype. Reference logic: `evalExpr`, `budgetAt`, `setBudget`, `carryFor` in `Budget Tracker.dc.html`. Never edit; the spec overrides it.

Doc rules: update the spec before or with the code (same commit/PR). Each fact lives in one file; link, don't copy.

## Stack & constraints
- TypeScript (strict) + Preact, built with Vite, tested with Vitest. Dark only (Nocturne palette), iOS HIG look.
- **Only runtime dependency: Preact.** System font, inline SVG icons, no CDNs. Target ≤ 200 KB gzipped.
- Offline-first: IndexedDB storage, hand-written service worker. No network calls besides loading the app and, when a backup key is set, the backup server.
- Keep everything as lean as possible. Prefer plain HTML/CSS and the smallest design that meets the spec.

## Ledger (non-negotiable)
- Immutable, append-only, double-entry. One `Entry` table: one debit id, one credit id, positive `amountMinor`.
- Only `post()` and `void()` write to the ledger. Never update or delete an entry. Corrections = reversal entry.
- Money is integer minor units in the single ledger currency. Never floats for money; the calculator uses exact fractions.
- Accounts and categories are archived, never deleted.
- Use the real current date. The prototype hardcodes October 2026; don't port that.

## Architecture
npm workspaces (being reorganised on `feature/backup-server`):
- `packages/core/`: pure TypeScript logic shared by app and server, no DOM/Preact/IndexedDB/Node-server imports: ledger, balances, budgets, rollover, reports, expression parser, snapshot encode/decode and validation, chain hash, screen logic. Fully unit tested.
- `apps/web/`: the PWA. `src/db/` IndexedDB persistence (thin), `src/app/` Preact components calling into core, `public/` manifest, service worker, icons.
- `apps/backup-server/`: Node 26 + Koa + `pg` backup API, `jearn-key` script, Dockerfile, `compose.dev.yaml` / `compose.prod.yaml`. Postgres with row-level security per `backup_id`.

## Build & deploy
- `npm install`, `npm test` (Vitest), `npm run dev` (local preview), `npm run build` (output in `dist/`).
- Node lives in `~/.local/node/bin` on the dev machine (add to `PATH`).
- Deploy: GitHub Pages from this (public) repo via `.github/workflows/deploy.yml`, on every push to `main` (tests + build first). URL: https://shoix.github.io/JEarn/. Install on the phone via Safari → Add to Home Screen. The URL must never change once installed.
- The old native Swift version is under the git tag `swift-archive`.

## Backup server
- One-way backup of new records to the owner's server, self-signed access keys, no user accounts ([005](docs/decisions/005-backup-server-design.md), `docs/spec/backup.md`). No iCloud/CloudKit, no Auth0.
- Not deployed yet: domain, reverse proxy (Traefik placeholders) and nightly off-server copy are open. Node 26 LTS pinned everywhere.
- Server data may later be analysed by an AI agent; the app stays single-user.

## Working agreements
- **Coding is delegated to the `web-coder` subagent (Sonnet 5.5).** The main session plans, reviews and integrates.
- **TDD (red → green → refactor).** Write a failing test from the spec first, run it to see it fail, then write the minimal code to pass, then tidy up. Every behaviour in `docs/spec/` gets a test before its code. Bug fixes start with a test that reproduces the bug. Keep logic out of components so it's testable in `src/core`.
- Discuss/brainstorm before writing code; don't start implementing until asked.
- Keep replies short and plain; the user often asks for a tl;dr.
- Work on `develop` (or feature branches off it). `main` is the deployment branch; PRs target `main`. Claude may commit freely on any branch except `main`/`master`; never commit or push to those.
