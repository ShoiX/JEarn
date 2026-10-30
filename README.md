# JEarn

A minimal, personal budget tracker for iPhone, built as an offline-first web app (PWA).

- Single user, offline, no login; Preact is the only runtime dependency
- Immutable double-entry ledger: entries are never edited or deleted, only voided
- Accounts, categories with subcategories, monthly budgets with rollover, transfers, a calculator for amounts, reports

## Status
v1 in development, switched from native Swift to a PWA (see [decision 004](docs/decisions/004-pwa-instead-of-native.md)). The Swift version is kept under the git tag `swift-archive`.

## Layout
```
docs/spec/        Product, ledger, backup and design specs (source of truth)
docs/decisions/   Why key choices were made
docs/prototype/   Frozen HTML prototype (open in a browser)
src/core/         Pure TypeScript logic: ledger, budgets, rollover, reports, calculator, snapshot
src/db/           IndexedDB persistence
src/ui/           Preact screens and components
public/           Manifest, service worker, icons
```

## Development
```sh
npm install
npm test          # Vitest
npm run dev       # local preview
npm run build     # static site in dist/
```

- **Install:** open the deployed URL in Safari on the iPhone → Share → Add to Home Screen. Works offline after that.
- **Deploy:** static HTTPS hosting (plan: GitHub Pages from a public repo holding only the built files).
- **Workflow:** test-first (TDD). Spec changes go in `docs/spec/` before or with the code.

See [CLAUDE.md](CLAUDE.md) for working conventions.

## License
Private project. All rights reserved.
