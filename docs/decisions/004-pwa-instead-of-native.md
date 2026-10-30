# 004 — PWA instead of a native app

**Status:** Accepted (2026-10-30). Supersedes [001](001-no-mac-sidestore.md).

**Context:** The native route (SwiftUI built on cloud CI, installed with SideStore) failed on the owner's phone. An iPhone SE 2020 with a dead home button cannot confirm the "Ready to Enable Developer Mode" screen. AssistiveTouch, Voice Control and Back Tap don't work there before the first unlock. A work profile also prevents turning the passcode off, which blocks the computer-based alternatives. Free-Apple-ID sideloaded apps can't run without Developer Mode on iOS 16+. React Native would hit the same wall.

**Decision:** Build JEarn as an offline-first Progressive Web App, installed with Safari → Add to Home Screen.
- Stack: TypeScript, Preact (the only runtime dependency), Vite, Vitest.
- Data lives in IndexedDB on the phone; the app asks for persistent storage.
- A hand-written service worker caches the app so it works fully offline.
- Static hosting over HTTPS: GitHub Pages from the source repo, which is made public (the owner accepted that the code and history are visible; the data never is).
- The Swift code is kept under the git tag `swift-archive`.

**Consequences:**
- No sideloading, Developer Mode, 7-day refresh or computer, and no Mac or macOS CI minutes. Updates go live about a minute after deploy.
- The UI is close to native but not identical: sheet and transition animations are imitated, there are no haptics, and swipe-back is limited.
- Data is in browser storage. Home Screen web apps are exempt from Safari's 7-day storage wipe and get persistent storage. Deleting the Home Screen icon still deletes the data, so export and, later, server backup matter more.
- The site URL must stay the same once installed; a new URL means a new, empty app.
- The ledger rules ([003](003-immutable-double-entry-ledger.md)) and backup plan ([002](002-server-backup-not-icloud.md)) are unchanged. Money stays integer minor units (JS safe integers instead of `Int64`); calculator maths uses exact fractions instead of `Decimal`.
