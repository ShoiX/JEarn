# JEarn — Product Spec

Screens and behaviour. Ledger rules and data model: [ledger.md](ledger.md). Visual style: [design.md](design.md). Future backup: [backup.md](backup.md).

**App name:** JEarn (home-screen name `JEarn`, from the web app manifest `short_name`). Logo directions: `../prototype/JEarn Logo.dc.html`.

## Overview
A single-user budget tracker, delivered as an offline-first Progressive Web App ([decision 004](../decisions/004-pwa-instead-of-native.md)) and installed from Safari with Add to Home Screen. Target device: iPhone SE (2nd gen, 2020 — 375×667 CSS px, no notch). Features: multiple accounts, expense categories with subcategories, income categories, monthly budgets per category and subcategory, transfers between accounts, custom transaction dates, an optional calculator on amount entry, currency selection, and a small reporting dashboard.

## About the Design Files
`../prototype/Budget Tracker.dc.html` is a **design reference built in HTML** — a working prototype showing intended look and behaviour, not production code. Rebuild it cleanly in the app stack: **TypeScript + Preact**, IndexedDB for local persistence, no backend, no login. Open the HTML file in a browser (keep `support.js` next to it) to click through every flow. The logic class at the bottom of the file (`class Component`) contains the reference implementation of all calculations.

## Footprint Requirements
The app must stay minimal: target **≤ 200 KB** of app files (gzipped), fully offline after the first load, no background activity.
- **No runtime dependencies except Preact** — no UI kits, analytics, crash reporting, Firebase or CDNs. Dev tools (Vite, Vitest, TypeScript) are fine.
- **System font only** (`-apple-system`, i.e. SF Pro on iPhone). Do not bundle Inter or any web font.
- **Icons:** a small set of inline SVGs drawn in the SF Symbols style (see [design.md](design.md)). No icon fonts or packs.
- **Charts:** plain SVG/CSS. No chart libraries.
- **Storage:** IndexedDB on-device; request persistent storage (`navigator.storage.persist()`). No backend, no login. The only network use is loading/updating the app files.
- **Offline:** a hand-written service worker caches the app shell. No push notifications, background sync or location access.
- **Backup to a private server is planned for a later version** — not built in v1, but v1 must be backup-ready (see [backup.md](backup.md)). v1 itself makes no network calls.
- Expected data size: ~100–200 bytes per transaction (≈1–2 MB after years of daily use).

Sizes given in pt are CSS px (1:1 on iPhone).

## Navigation
Bottom tab bar, 52pt tall, 5 slots: Home · Budgets · [+] · Reports · Setup. The centre [+] is not a tab — it opens the Add Transaction sheet. Active tab tint `#D2CEFD`, inactive `#75798C`, label 10pt.

## Screens

### 1. Home
- Header: month title ("October 2026", 26pt/500) + prev/next month buttons (36×36, 1pt `#3F424D` border, radius 8). Next disabled (30% opacity) on current month.
- Summary card (bg `#232532`, radius 14, padding 16): label "Left to spend" / "Over budget" (13pt `#9397AB`); amount 38pt/500 (turns warn colour when over); 6pt progress bar (track `#3F424D`, fill accent or warn); row "Spent $X of $Y" left, "Income $Z" right (13pt `#B2B6CA`).
- Accounts: horizontal scroll of cards (min-width 112, bg `#232532`, radius 8, padding 10×12): name 12pt muted, balance 16pt/500.
- Transactions for the month, grouped by date ("Today", "Yesterday", "Mon 6 Oct"). Row ≥52pt: 8pt category colour dot, title (subcategory name) 15pt, meta 12pt muted ("Category · Account · note"), amount right. Income `+$` in `#D2CEFD`; expense `−$` in text colour; transfer title "Transfer", meta "From → To", amount in `#B2B6CA`, grey dot.
- Voided entries and their reversals are hidden from the list (they remain in the ledger and in backups/exports). Opening-balance entries are not listed.
- Tap row → Transaction Detail sheet. Empty state: "No transactions this month. Tap + to add one."

### 2. Budgets
- Header "Budgets" + compact month switcher ("Oct 2026").
- Totals line: "Spent $X" / "Budgeted $Y".
- One card per expense category (bg `#232532`, radius 8, padding 12): dot + name (15pt/500), "spent /" + tappable budget amount (dashed 1pt `#595D6C` border; tap → inline numeric field, commit on blur/Return, Esc cancels). 6pt bar. Footer row: "$X left" or "$X over" (warn) + "N subcategories ⌄" toggles expansion.
- Rollover line (only when the category has rollover on), 12pt, under the bar: "↳ +$45 from Sep · $945 available" in `#D2CEFD`, or negative in warn colour. Bar and "left/over" use **available** (budget + carryover). In the start month it reads "Rollover starts this month".
- Expanded: subcategory rows with the same spent/budget editing and 4pt bars. If sum of sub budgets > category budget show warn note: "Subcategory budgets add up to $X, more than $Y."
- Header totals read "Spent $X" / "Available $Y" (available includes carryovers).
- Footnote: "Tap an amount to change the budget from this month onward. Earlier months keep their budget. Turn on rollover per category in Setup."

### 3. Reports
- Segmented control: "This month" / "Last 6 months".
- This month: month switcher; 3 stat tiles (Income, Spent, Saved/Shortfall); "Spending by category" — horizontal bars sorted desc, bar width relative to the largest, shows % of total and amount.
- Last 6 months: grouped bar chart (income accent `#9184D9`, spending `#B2B6CA`, 140pt tall, current month label highlighted); "Monthly average" tiles (averages of the 5 completed months); "Average per category vs budget" list (avg turns warn when above budget).

### 4. Setup
Grouped lists (bg `#232532`, radius 8, rows ≥48pt, 1pt `#292B31` separators):
- Accounts: type icon, name, type label with caret under the name (tap → inline row of type chips below the account, closes on pick), current balance, archive (hidden from pickers; history keeps its name). "Add account" → name + opening balance (posted as an opening entry), then a wrap of type chips (icon + label, selected = accent border) + Add. No native dropdowns.
- Account types: Bank, Savings, Credit card, Cash, Investment, Loan (default Bank). Icons: bank → building.columns, savings → banknote / piggy bank, credit → creditcard, cash → dollarsign.circle, investment → chart.line.uptrend.xyaxis, loan → hand.raised / arrow.down.circle. Home account cards show the type icon before the name.
- Expense categories: expandable rows (dot, name, sub count). Expanded shows first a "Roll over to next month" switch (46×28 pill; on = accent border, `#2B2741` fill, `#D2CEFD` knob) with a note ("Unspent budget resets each month" / "Carrying +$45 into Oct" / "Starts fresh this month") and a "Reset" button when on; then subs with archive; "Add subcategory"; "Add category" (categories archive too). Renaming is allowed; it is reference data, not ledger history.
- Income categories: list + add/archive.
- Currency: "Ledger currency" with a picker (PHP, AUD, USD, EUR, GBP, NZD, CAD, SGD, JPY, INR); **default PHP (₱)**. JPY has 0 minor digits, the rest 2. **Locked once the first entry exists** (amounts are stored in minor units of this currency).
- Archived: a collapsed group listing archived accounts and categories, each with "Restore" (undoes a mistaken archive; reference data only).
- Footer: "Load sample data", only when the ledger is empty (confirm first). No "Clear transactions": the ledger is never erased in-app.
- Data: "Export data" (JSON snapshot, format in [backup.md](backup.md); uses the share sheet via `navigator.share` with a file, falling back to a download) / "Import data" (file picker; only when the ledger is empty).

### 5. Add Transaction sheet (from +)
Sheet from top 28pt, bg `#232532`, top radius 14, slides up 260ms `cubic-bezier(.2,.8,.2,1)`; backdrop black 55%, tap to dismiss.

**Step 1 — Amount**
- Top: close (×) left; segmented Expense / Income / Transfer (252pt wide, selected = 1pt accent border + `#D2CEFD` text).
- Amount display, right-aligned: optional expression line (14pt muted, e.g. "(12+3)×2") above the value (40pt/500; placeholder colour `#595D6C` when empty).
- One row of compact pills: [wallet Account ⌄] [calendar Today ⌄] … [calculator toggle]. Pills 34pt, radius 8, 1pt `#3F424D` border (accent when open).
  - Account pill opens an inline panel (bg `#161826`, radius 8) with account chips; closes on pick. In Transfer mode the pill reads "From → To", the panel shows From and To rows, closes after picking To; border turns warn if From = To.
  - Date pill opens a panel: Today, Yesterday, and a native `<input type="date">` (max = today). Closes on pick.
  - Calculator toggle: off = 3-column keypad (1–9, ., 0, ⌫; keys 54pt). On = 4-column keypad (C ( ) ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / . 0 ⌫ =; keys 46pt; operator keys bg `#2B2741` text `#D2CEFD`; = bg `#423A6A`). Turning it off evaluates any expression into a plain amount.
- Primary button (full width, 48pt, outline accent): "Choose category" — or "Save transfer" in Transfer mode. Disabled (40%) until amount > 0 (and From ≠ To).

**Step 2 — Category** (not used for transfers)
- Back button showing the amount, meta "Account · Date" on the right, optional "Note" field.
- Expense: each category as a header (dot + name) with its subcategories as 44pt chips; tapping a chip saves. Categories with no subs show one chip with the category name. Income: one group of income categories.
- After save: sheet closes, app jumps to the transaction's month.

### 6. Transaction Detail sheet
Sheet from top 230pt. Kind label (Expense/Income/Transfer), amount 38pt, detail rows (Category, Subcategory, Account / From, To, Date, Note), "Void transaction" button (destructive, confirm first). Voiding posts a reversal entry; nothing is edited or deleted. To correct a mistake: void, then add it again.

## Behaviour & Rules
- Amount entry: max 2 decimals per number, max 7 digits per number, expression ≤ 32 chars. Calculator supports + − × ÷ and parentheses with standard precedence; implicit × before "(" after a number/")"; unclosed "(" auto-closes; trailing operators are ignored for the live result. Result rounded to cents. Reference parser: `evalExpr()` in the HTML file.
- **Budget history:** budgets repeat every month until changed. Each category/subcategory stores a list of `{from: YYYY-MM, amount}`. Editing while viewing month X removes entries with from ≥ X and adds {from: X, amount}, so the change applies to X and later; earlier months keep their old budget. budgetAt(month) = latest entry with from ≤ month (if none, the earliest entry). Carryover uses budgetAt(m) for each past month. Reference: `budgetAt()` / `setBudget()` in the HTML. Spent = sum of expense transactions in the viewed month.
- **Rollover (category level only):** each expense category has `rollover: Bool` and `rollStart: YYYY-MM`. Turning it on sets rollStart = previous month; "Reset" sets rollStart = current month. carryover(month) = Σ over months m from rollStart up to month−1 of (budget − spent(m)), accumulating, positive and negative, no cap. Available(month) = budget + carryover(month). **Computed from the ledger, never stored**, so voiding or backdating an entry corrects later months. Subcategories have no rollover. Reference: `carryFor()` in the HTML.
- "Left to spend" = total available (budgets + carryovers) − month expenses.
- Account balance = Σ debits − Σ credits for asset accounts; for liability accounts (credit card, loan) = Σ credits − Σ debits, shown as amount owed. All time.
- Transfers are excluded from income/expense totals and reports.
- Accounts and categories are archived, never deleted; their entries keep showing the original name.
- Persist everything locally in IndexedDB (database `jearn`); writes happen immediately, so closing the app never loses data. The prototype's `localStorage` key is not used.

## State (per screen)
tab, month offset, expanded categories, inline budget edit {kind, ids, value}, inline add form {kind, parentId, values}, report range, sheet (add|tx), add draft {type, amount expression, step, accountId, toAccountId, day/date, note, catId, subId, picker open, calc on}.

## Files (`../prototype/`, frozen reference — the spec overrides it)
- `JEarn Logo.dc.html` — logo / app icon directions (final pick pending).
- `Budget Tracker HIG.dc.html` — **visual reference** (HIG style). Same behaviour as below.
- `Budget Tracker.dc.html` — original prototype; reference for behaviour and the logic class (all calculations and sample data generator).
- `support.js` — runtime needed to open the HTML in a browser.
