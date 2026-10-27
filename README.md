# JEarn

A minimal, personal budget tracker for iPhone, built natively in SwiftUI.

- Single user, offline, no login, no third-party dependencies (≤ 5 MB)
- Immutable double-entry ledger: entries are never edited or deleted, only voided
- Accounts, categories with subcategories, monthly budgets with rollover, transfers, a calculator for amounts, reports

## Status
Early development. The logic package (`JEarnCore`) is built and tested; the iOS app and CI build come next.

## Layout
```
docs/spec/        Product, ledger, backup and design specs (source of truth)
docs/decisions/   Why key choices were made
docs/prototype/   Frozen HTML prototype (open in a browser)
Packages/JEarnCore/  Pure-Swift logic: ledger, budgets, rollover, reports, calculator
```

## Development
Developed on Linux, with no Mac needed:

```sh
# Swift toolchain via swiftly (https://www.swift.org/install/linux/)
. ~/.local/share/swiftly/env.sh
cd Packages/JEarnCore && swift test
```

- **Build:** GitHub Actions on macOS produces an unsigned `.ipa` (planned).
- **Install:** SideStore with a free Apple ID; an iOS Shortcuts automation refreshes it daily.
- **Workflow:** test-first (TDD). Spec changes go in `docs/spec/` before or with the code.

See [CLAUDE.md](CLAUDE.md) for working conventions.

## License
Private project. All rights reserved.
