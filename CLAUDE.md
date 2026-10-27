# JEarn

Personal, single-user budget tracker for iPhone (SE 2nd gen, 375×667 pt). Native, minimal, $0 to build and run.

## Docs (source of truth)
- `docs/spec/product.md`: screens, behaviour, footprint, state
- `docs/spec/ledger.md`: ledger rules and data model (strictest; change only with a decision record)
- `docs/spec/backup.md`: future server backup and snapshot format
- `docs/spec/design.md`: HIG visual direction, tokens, icons
- `docs/decisions/`: why key choices were made (no Mac, server backup, immutable ledger). Don't reverse one without a new decision record.
- `docs/prototype/`: frozen HTML prototype. Reference logic: `evalExpr`, `budgetAt`, `setBudget`, `carryFor` in `Budget Tracker.dc.html`. Never edit; the spec overrides it.

Doc rules: update the spec before or with the code (same commit/PR). Each fact lives in one file; link, don't copy.

## Stack & constraints
- Swift + SwiftUI, iOS 17+, SwiftData. Dark only (Nocturne palette), HIG style.
- **No third-party dependencies.** System font and SF Symbols only. Target ≤ 5 MB installed.
- v1 is fully offline: no network calls, no background tasks, no login.
- Keep everything as lean as possible. Prefer native components and the smallest design that meets the spec.

## Ledger (non-negotiable)
- Immutable, append-only, double-entry. One `Entry` table: one debit id, one credit id, positive `amountMinor`.
- Only `post()` and `void()` write to the ledger. Never update or delete an entry. Corrections = reversal entry.
- Money is `Int64` minor units in the single ledger currency. `Decimal` only for calculator input and display.
- Accounts and categories are archived, never deleted.
- Use the real current date. The prototype hardcodes October 2026; don't port that.

## Architecture
- **Pure-Swift logic package** (no SwiftUI/SwiftData imports): ledger, balances, budgets, rollover, reports, expression parser, snapshot encode/decode. It must build and test on Linux with `swift test`.
- **App target**: SwiftData models + SwiftUI views only, calling into the logic package.
- Xcode project is generated with **XcodeGen** (`project.yml`). Never hand-edit or commit `.xcodeproj`.

## Build & install (no Mac)
- Development happens on Linux. There is no Simulator or SwiftUI preview locally.
- Cloud macOS CI builds an unsigned `.ipa` (Codemagic or GitHub Actions; not yet decided).
- Installed on the phone via SideStore with a free Apple ID; a Shortcuts automation refreshes it daily.
- Verify logic with `swift test` locally; verify UI via CI build + install on device.

## Future (design for, don't build yet)
- One-way backup of a full JSON snapshot to the owner's private cloud server (see `docs/spec/backup.md`). No iCloud/CloudKit.
- Server may later be analysed by an AI agent and support other users; the app stays single-user.

## Working agreements
- **Coding is delegated to the `swift-coder` subagent (Sonnet 5.5).** The main session plans, reviews and integrates.
- Discuss/brainstorm before writing code; don't start implementing until asked.
- Keep replies short and plain; the user often asks for a tl;dr.
- Branch `develop`; PRs target `main`. Claude may commit freely on any branch except `main`/`master`; never commit or push to those.
