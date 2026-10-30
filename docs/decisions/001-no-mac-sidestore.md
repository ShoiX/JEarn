# 001 — Build without a Mac; install with SideStore

**Status:** Superseded by [004](004-pwa-instead-of-native.md) (2026-10-30)

**Context:** The app must be native (SwiftUI) and cost $0. Development happens on Linux, and there is no Mac. Native iOS builds need Xcode, which only runs on macOS. Without a paid Apple Developer account, sideloaded apps expire after 7 days.

**Decision:** Write code on Linux. A cloud macOS CI service (Codemagic or GitHub Actions, still to be decided) builds an unsigned `.ipa`. SideStore installs it with a free Apple ID, and an iOS Shortcuts automation refreshes it daily. The Xcode project is generated with XcodeGen.

**Consequences:** No Simulator or live previews locally, so UI changes take a CI build and an on-device check. Business logic lives in a pure-Swift package that is tested on Linux with `swift test`. The limits are 3 sideloaded apps and occasional re-pairing after iOS updates. Moving to a Mac or the $99 account later needs no code changes.
