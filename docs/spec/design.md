# JEarn — Design

## Visual Direction: iOS HIG (use this)
`../prototype/Budget Tracker HIG.dc.html` is the **chosen visual style**. It has the same screens, behaviour and logic as `Budget Tracker.dc.html`, restyled to Apple's Human Interface Guidelines while keeping the Nocturne dark palette. Where [product.md](product.md) says "outlined" or gives Inter sizes, the HIG overrides here win:
- **Font:** system font stack (`-apple-system, system-ui, sans-serif` → SF Pro on iPhone). Large titles 34pt bold; section headers 13pt uppercase, +0.03em tracking, inset 32pt; sheet titles 17pt semibold.
- **Lists:** inset grouped (16pt side margin, radius 10, cell `#232532`, 0.5pt `#3F424D` separators). Transactions grouped by day in these blocks.
- **Segmented controls** (Expense/Income/Transfer, report range): track `#161826` (or `#232532`), radius 9, 2pt padding; selected segment `#4A4D5C` with white text and a soft shadow. Build as a small reusable component.
- **Chips/pills** (account, date, account type): capsules, no border; off `#2F3140` / text `#E9E9ED`, on accent `#9184D9` / text `#161826`. Account and date pills in the Add sheet are capsules on `#161826` with a 1pt border.
- **Prominent buttons** (Save, Choose category, Add, the + tab button): **filled** accent `#9184D9`, text `#161826` semibold, radius 12 (50pt tall), + button is a 44pt circle.
- **Toggle:** iOS-style switch (51×31), on tint `#9184D9` (a styled checkbox; Safari 17.4+ `switch` attribute where available).
- **Sheets:** grabber, radius 12. Add sheet header: "Cancel" (left, accent) and "New Transaction" (centre), segmented control below. Detail sheet closes with "Done". Sheets slide up from the bottom over a dimmed backdrop; tap the backdrop or drag the grabber down to close.
- **Text fields:** radius 10, no border, fill `#161826`.
- **Tab bar:** translucent (`backdrop-filter: blur`), 0.5pt top hairline, padded for `env(safe-area-inset-bottom)`; selected tab icon uses the filled variant.
- **Month arrows:** 34pt circular buttons, fill `#232532`, accent chevrons.
- **Destructive:** text `#FF6961` on `#2C2430` (use `role: .destructive`).
- Prefer plain HTML elements (`button`, `input`) styled with CSS; keep components few and small.

## Fidelity
**High-fidelity.** Colours, type sizes, spacing and interactions are final. Use the system font instead of Inter; keep sizes and weights. Draw icons as inline SVGs in the SF Symbols style (mapping below names the SF Symbol each one imitates).

## Design Tokens (Nocturne — dark only)
- Background `#161826` · Surface `#232532` · Text `#E9E9ED`
- Neutrals: 300 `#CFD3E5`, 400 `#B2B6CA`, 500 `#9397AB` (muted text), 600 `#75798C`, 700 `#595D6C`, 800 `#3F424D` (borders/tracks), 900 `#292B31` (separators)
- Accent `#9184D9` · accent-300 `#D2CEFD` (accent text) · accent-200 `#E7E5FE` · accent-800 `#423A6A` · accent-900 `#2B2741` (tints)
- Warn (over budget) `oklch(0.76 0.11 30)` ≈ `#E8907C`; delete border `oklch(0.66 0.12 30)`
- Category colours: `oklch(0.74 0.09 H)` with H cycling 289, 215, 160, 85, 25, 330, 250, 120
- Type: SF Pro (see Visual Direction above for titles/headers) — original prototype titles 26/500, big numbers 38–40/500 (−0.02em), body 15, secondary 13–14, captions 12, tab labels 10. Tabular numerals throughout.
- Radii: 4 (inputs), 8 (cards, buttons, chips), 14 (summary card, sheets)
- Primary buttons: filled accent per the HIG direction above (the original prototype used outlined buttons).
- Touch targets ≥ 44pt.
- PWA chrome: `theme-color` and `background-color` `#161826`, `apple-mobile-web-app-status-bar-style` `black-translucent`, `viewport-fit=cover`, no pinch zoom, `user-select: none` outside text fields, `-webkit-tap-highlight-color: transparent`.

## Icons (Phosphor → SF Symbol look-alike, inline SVG)
house → house · target → target · chart-bar → chart.bar · gear-six → gearshape · plus → plus · caret-left/right/down/up → chevron.* · trash → trash · x → xmark · backspace → delete.left · wallet → wallet.pass · calendar-blank → calendar · calculator → plus.forwardslash.minus

