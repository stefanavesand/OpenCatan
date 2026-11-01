# Follow-up work

Local tracking for this implementation. The repository requests the `bd` CLI in AGENTS.md, but it is not installed in the execution environment; no Beads records or external issues could be created.

- SESSION-1: Extract active rules from network/host.ts one action at a time. Verify validation, costs, inventory, trading, finite development deck and victory rules. Unify legacy message types. Full-game behavior is not covered by the setup E2E test.
- SESSION-2: Add a complete versioned authoritative snapshot and IndexedDB store. Atomically persist command receipts and state before acknowledging durable success; recover without repeating a move. Handle storage refusal/quota failures, schema upgrades and export. Current receipt/state data is memory-only.
- SESSION-3: Reconnection/reload lifecycle tests, including interrupted command/receipt delivery. A live host socket reconnect is different from reloading or losing the host browser. No automatic migration is permitted until authoritative secrets and authority transfer have a design.
- SESSION-4: Implement audited public/private projections for all log types, statistics, trade offers, chat and future expansion data. The setup slice projects only public build logs and base-game hands.
- SESSION-5: Offline local session without a server, PWA manifest, verified atomic resource caching (including fonts), persistent-storage request and safe update activation. No reliance on iOS background execution. Test on real iOS/Android.
- SESSION-6: Capacitor packaging, transport capability tests and later native TCP/BLE proof of concept. No Bluetooth implementation in this change.
- QUALITY-1: Repair pre-existing global lint failures and remaining @ts-nocheck modules. Add full-game, mobile and accessibility browser coverage. The current browser test uses Chromium and two players.
- RIGHTS-1: Obtain an actual code license notice and verifiable redistribution rights for all bundled images/sounds/fonts. README says MIT but no LICENSE file was found; PRD claims Colonist licensing without attached terms. Keep the test build local until rights are established for distribution.
