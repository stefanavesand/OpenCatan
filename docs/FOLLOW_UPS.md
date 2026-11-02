# Follow-up work

Local tracking for this implementation. The repository requests the `bd` CLI in AGENTS.md, but it is not installed in the execution environment; no Beads records or external issues could be created.

The next migration/private-MVP work is now tracked with stable IDs in [MIGRATION_MVP_TODO.md](MIGRATION_MVP_TODO.md), following the [inventory](MIGRATION_INVENTORY.md), [requirements decision draft](MVP_REQUIREMENTS.md) and [UI design brief](MVP_UI_DESIGN.md). The user confirmed the private MVP product baseline and later phone support; responsive phone design is required now. Exact operational acceptance and visual design agreement remain pending. Historical entries below retain their original slice/status and are not all requirements for this MVP.

- SESSION-1 (partly complete): Economy, dice/robber, development-card effects, scoring and victory now use typed pure transitions with scenario-based browser coverage. Remaining: extract setup rules, implement player trading, unify legacy message types and verify natural complete games. See BASE_RULES.md.
- SESSION-2: Add a complete versioned authoritative snapshot and IndexedDB store. Atomically persist command receipts and state before acknowledging durable success; recover without repeating a move. Handle storage refusal/quota failures, schema upgrades and export. Current receipt/state data is memory-only.
- SESSION-3: Reconnection/reload lifecycle tests, including interrupted command/receipt delivery. A live host socket reconnect is different from reloading or losing the host browser. No automatic migration is permitted until authoritative secrets and authority transfer have a design.
- SESSION-4: Implement audited public/private projections for all log types, statistics, trade offers, chat and future expansion data. The setup slice projects only public build logs and base-game hands.
- SESSION-5: Offline local session without a server, PWA manifest, verified atomic resource caching (including fonts), persistent-storage request and safe update activation. No reliance on iOS background execution. Test on real iOS/Android.
- SESSION-6: Capacitor packaging, transport capability tests and later native TCP/BLE proof of concept. No Bluetooth implementation in this change.
- QUALITY-1: Repair pre-existing global lint failures and remaining @ts-nocheck modules. Add full-game, mobile and accessibility browser coverage. The current browser test uses Chromium and two players.
- RIGHTS-1: Obtain an actual code license notice and verifiable redistribution rights for all bundled images/sounds/fonts. README says MIT but no LICENSE file was found; PRD claims Colonist licensing without attached terms. Keep the test build local until rights are established for distribution.

- GAMEPLAY-1: Extend the scenario-based progression tests to naturally generated complete games and four-player sessions. Expand road tie/branch and resource-shortage edge cases.

- PWA-1 (verified): User confirmed Game Shelf 1.1.0 game recovery on the actual iPad. Cache/update/IndexedDB recovery is also automated in Chromium. Future work includes standalone domain/session integration for OpenCatan, history, schema migrations and cross-device transport.

- ONLINE-1 (partly verified): User confirmed 1.2.0 online play on their devices. Separate physical networks and exact suspend/reopen scenarios remain to verify. Add room/user cleanup, abuse/rate/cost controls, identity recovery/linking, payload-bound dedup and future-schema validation. Replace duplicated SQL/TS rules before extending this backend to OpenCatan; managed transport choice remains replaceable.

- DESIGN-1: Implement the PRD 3.1 / HLD 1.1 baseline incrementally in the reference game. Resolve ADR-01 (shared TypeScript authority runtime), ADR-02 (identity/invitation recovery), ADR-03 (rate limits, cost, retention and disaster recovery), ADR-04 (rules/rights). State charts and mapped test cases are target behavior, not completed implementation. See HLD implementation steps and PRD release gates.

- SESSION-STATE-1 (client slice implemented): PWA 1.2.1 has pure connection/command state policy, stable transport failure codes, backoff/Retry-After and stops on blocked errors. See SESSION_STATES.md. Remaining: common runtime across games, backend payload-bound dedup/stable rejection receipts, durable/cross-tab cooldown, strict protocol/save validation and IndexedDB outbox. This does not close E1 or implement server rate limits.

- LANGUAGE-1: English UI/repository policy is implemented in PWA 1.2.2. Preserve legacy storage keys, lock names and local route alias. See ENGLISH_RELEASE.md. Verify the installed English update on the actual iPad.

- CATAN-PWA-1: Version 1.3.0 implements the user-selected local iPad setup preview with shared pure TypeScript placement rules, durable saves and original SVG visuals. See CATAN_SETUP.md. Verify actual iPad touch/offline recovery. Next phases, full snapshots, private projections and managed online authority remain open; this does not close E1/E2. Preserve ruleVersion-1 fixed-layout replay compatibility.

- BOT-PLAN-1: Review/implement the planned BOT-01–18 baseline in BOT_REQUIREMENTS.md. B1 local setup first; B2 full-phase/headless coverage; B3 two internet humans plus one bot depends on Catan rooms. Select and pin a licensed policy, define observation/work/fallback limits and safe save migration, then implement through ordinary authority commands. No bot code or new bot test passes are claimed by the requirements change.

- CATAN-FULL-1 (pilot implemented): Full shared engine, deterministic Easy/Standard bots and exactly two-human/one-bot managed rooms. See CATAN_FULL_GAME.md for evidence. 100 natural seeded simulations and 65 unit tests pass. Older SESSION/GAMEPLAY entries describe the legacy path; the new shared session implements setup/trading/full progression without rewriting that app. Local offline bot scheduling, one-human/multiple-bot UI and four-human internet room configuration remain open.
- CATAN-FULL-2: Verify a complete human-played game on actual iPads/two networks, full-close/reopen, touch clarity, suspend/reconnect and bot status. Browser automation does not certify the device gates.
- CATAN-FULL-3: Measure policy incremental memory, managed response p95, aggregate CPU/billing; configure cleanup/retention, budget alerts and backups. Make rate limiting atomic and add an aggregate abuse perimeter. Expose bot-policy errors rather than merely stopping the drain.
- CATAN-FULL-4: Keep the managed authority source synchronized with this repo and reconstruct/test the complete initial schema/migration chain. See backend/catan/README.md. Repeat combined backend recovery suite after its hourly quota resets; last run was 7/8 with one expected quota block, not all green.
- CATAN-FULL-5: Retain licensing follow-up RIGHTS-1 for reused OpenCatan code. The new PWA ships original SVG art, and only the MIT catan-ai settlement heuristic adaptation has a verified license/notice; it does not resolve upstream code licensing.
