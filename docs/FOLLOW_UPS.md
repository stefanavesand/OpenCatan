# Follow-up work

Local tracking for this implementation. The repository requests the `bd` CLI in AGENTS.md, but it is not installed in the execution environment; no Beads records or external issues could be created.

- SESSION-1 (partly complete): Economy, dice/robber, development-card effects, scoring and victory now use typed pure transitions with scenario-based browser coverage. Remaining: extract setup rules, implement player trading, unify legacy message types and verify natural complete games. See BASE_RULES.md.
- SESSION-2: Add a complete versioned authoritative snapshot and IndexedDB store. Atomically persist command receipts and state before acknowledging durable success; recover without repeating a move. Handle storage refusal/quota failures, schema upgrades and export. Current receipt/state data is memory-only.
- SESSION-3: Reconnection/reload lifecycle tests, including interrupted command/receipt delivery. A live host socket reconnect is different from reloading or losing the host browser. No automatic migration is permitted until authoritative secrets and authority transfer have a design.
- SESSION-4: Implement audited public/private projections for all log types, statistics, trade offers, chat and future expansion data. The setup slice projects only public build logs and base-game hands.
- SESSION-5: Offline local session without a server, PWA manifest, verified atomic resource caching (including fonts), persistent-storage request and safe update activation. No reliance on iOS background execution. Test on real iOS/Android.
- SESSION-6: Capacitor packaging, transport capability tests and later native TCP/BLE proof of concept. No Bluetooth implementation in this change.
- QUALITY-1: Repair pre-existing global lint failures and remaining @ts-nocheck modules. Add full-game, mobile and accessibility browser coverage. The current browser test uses Chromium and two players.
- RIGHTS-1: Obtain an actual code license notice and verifiable redistribution rights for all bundled images/sounds/fonts. README says MIT but no LICENSE file was found; PRD claims Colonist licensing without attached terms. Keep the test build local until rights are established for distribution.

- GAMEPLAY-1: Extend the scenario-based progression tests to naturally generated complete games and four-player sessions. Expand road tie/branch and resource-shortage edge cases.

- PWA-1: Verify Spelhyllan 1.1.0 game recovery on the actual iPad. Cache/update/IndexedDB recovery is automated in Chromium; device test remains pending. Future work includes standalone domain/session integration for OpenCatan, history, schema migrations and cross-device transport.
