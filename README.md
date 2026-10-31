# JEarn

A minimal, personal budget tracker for iPhone. It's a web app you add to your Home Screen (a PWA): it opens like an app, works fully offline and keeps your data on the phone.

**Live app:** https://shoix.github.io/JEarn/

## Features
- Accounts (bank, savings, cash, credit card, loan, investment) with opening balances
- Expense categories with subcategories, plus income categories (a common starter set is created on first launch)
- Monthly budgets per category and subcategory, with optional rollover of unspent budget
- Expenses, income and transfers, with backdating and a built-in calculator
- Reports: this month and the last 6 months
- Export / import of all data as a JSON file
- Currency: PHP (₱) by default; others available until the first entry is added

**The ledger is permanent.** Entries are never edited or deleted. To fix a mistake, open the entry and tap **Void**, then add it again. Accounts and categories are archived (and can be restored), never deleted.

## Install on iPhone
1. Open https://shoix.github.io/JEarn/ in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open JEarn from the Home Screen icon (not the Safari tab: the tab keeps separate data).

Updates install themselves: after a new version is deployed, it's used the next time you open the app.

## First steps
1. **Setup → Add account** for each account, with its current balance.
2. Archive the starter categories you don't need, and add your own.
3. **Budgets:** tap an amount to set a monthly budget.
4. Tap **+** to add transactions.

## Keep your data safe
- Data lives only on your phone, inside the Home Screen app.
- **Deleting the Home Screen icon deletes the data.** Changing the app's URL also starts a new, empty app.
- Back up regularly: **Setup → Export data** and save the file (e.g. to Files or Drive). To restore on a fresh install: **Setup → Import data**.
- Automatic backup to a private server is planned (see [docs/spec/backup.md](docs/spec/backup.md)).

## Development
Requires Node.js (LTS).

```sh
npm install
npm run dev       # local preview at http://localhost:5173
npm test          # unit tests (Vitest)
npm run e2e       # builds, then tests every flow in headless Chrome at iPhone SE size,
                  # including that every button stays reachable (nothing cut off)
npm run build     # production build in dist/
```

- **Branches:** work on `develop`; `main` is the deployment branch.
- **Deploy:** every push to `main` runs the tests, builds and publishes to GitHub Pages ([deploy.yml](.github/workflows/deploy.yml)). Every push to any branch runs the tests ([test.yml](.github/workflows/test.yml)).
- **Workflow:** test-first (TDD). Specs in `docs/spec/` are updated before or with the code.
- Conventions for AI agents and contributors: [CLAUDE.md](CLAUDE.md).

## Project layout
```
src/core/         Pure TypeScript logic: ledger, budgets, rollover, reports, calculator, snapshot (fully tested)
src/db/           IndexedDB storage
src/app/          Preact screens and components
public/           Manifest, service worker, icons
scripts/          Icon generator, end-to-end test
docs/spec/        Product, ledger, backup and design specs (source of truth)
docs/decisions/   Why key choices were made
docs/prototype/   Frozen HTML design prototype
```

Stack: TypeScript, Preact (the only runtime dependency), Vite, Vitest. The earlier native Swift version is kept under the git tag `swift-archive` ([why it changed](docs/decisions/004-pwa-instead-of-native.md)).

## License
Personal project. All rights reserved.
