# Running the two-player setup slice

This change makes the base-game setup flow testable end to end. It is not yet a complete offline/PWA release. The host's live browser remains authoritative.

## Automated browser test

Use Node 22.12+ (verified here with Node 24.19.0) and npm:

```sh
npm ci
npx playwright install chromium
npm run test:run
npm run build:typecheck
npm run test:e2e
```

On Linux, Playwright may also need its documented OS dependencies (`npx playwright install --with-deps chromium`). The browser test starts Vite on 127.0.0.1:5174 and PartyKit on 127.0.0.1:1998, and closes them afterwards. Those ports must be free. It creates a random room and two isolated browser contexts, without an account or external login.

If your environment uses an HTTP proxy, ensure `NO_PROXY` includes `127.0.0.1,localhost` for local browser/server checks. In this managed environment the browser binaries are installed under `/tmp/opencatan-browsers`; run with `PLAYWRIGHT_BROWSERS_PATH=/tmp/opencatan-browsers` there. A normal local install needs neither that variable nor the temporary directory.

For interactive execution:

```sh
npm run test:e2e:ui
```

Open `playwright-report/index.html` for results. On failure, inspect the retained screenshot and trace in `test-results/`, using `npx playwright show-trace <trace.zip>`. Successful runs also save `test-results/setup-host.png` and `test-results/setup-peer.png`.

## What the setup browser test exercises

- Two real web clients join a real local PartyKit server, ready up and start through the existing UI.
- The host initializes the board once, using the server's turn order. Both clients see the same board and active player.
- Both rounds of snake setup are played by clicking rendered settlement/road targets. Both clients end with four settlements, four roads and the roll phase.
- The relay binds commands to the authenticated connection's player identity. A peer cannot act as the host or send authoritative state deliveries.
- Unknown protocol versions and game IDs are rejected. Stale command revisions are rejected.
- Resending the exact same accepted road command returns the original receipt without adding a road or advancing the revision.
- An old authoritative view does not roll the peer back.
- The peer gets its own hand and only counts for opponents. A recognizable host-only development-card fixture is never present in the peer's received messages.
- Losing the host connection does not promote a peer holding an incomplete view.

Negative protocol checks and the single secret-card fixture use the real client adapter/store through Vite module imports. The successful setup moves use UI clicks. There are no test-only globals in the application and no fabricated transport in the browser test.

## Manual test

In two terminals:

```sh
npm run party:dev
npm run dev
```

Open `http://localhost:5173/ABCDEF` in a normal browser and a separate browser profile/private window. Use a fresh room code for another game. The first player is host. Press **Ready Up** in both windows and **Start Game** in the host window. Place each settlement and an adjoining road using the highlighted targets. The second round reverses the order. Compare both boards after every move.

Do not use two tabs sharing the same localStorage as two independent players: the stored session token deliberately identifies one player. Keep the host page open during testing. A refresh of the host or server restart cannot yet restore the game; start a fresh room instead.

## Implementation boundary

`src/session` contains transport contracts, the versioned command/receipt protocol, in-memory deduplication and recipient views. `src/network/sessionTransport.ts` adapts PartyKit. Host/peer managers connect that session to the existing Redux rule implementation. Setup retains the rule implementation in `network/host.ts`. Economy and turn rules have since been extracted into typed transitions; see [stage 2](BASE_RULES.md). Full engine extraction is still pending.

Revision advances once per accepted rule command. Rejected commands have stable receipts. Receipt history is in memory and bounded to 10,000 unique commands; reaching the limit rejects additional commands instead of silently dropping deduplication records. This is not durable exactly-once delivery across host restart.

A `SessionView` is a recipient view, not a recoverable authoritative snapshot. It contains no deck or full set of opponent hands. Views and receipts are targeted by player ID, and only the host can send them through the relay. Legacy unrestricted GAME_STATE broadcast is disabled. There is no automatic host takeover during a running game.

Only public building logs are projected in this slice. Other log/statistics/trade projections still need review before complete multiplayer rule support is claimed. The local in-browser host remains trusted and can inspect everyone's secrets. Unit tests cover command receipts, secrecy and setup geometry. Existing modules still include unchecked TypeScript and unrelated lint debt; see FOLLOW_UPS.md.

## Stage 1 verification (2026-11-01)

- Six Vitest tests pass.
- The Chromium E2E scenario passes with two isolated clients and a real local relay.
- `npm run build:typecheck` passes. Vite still warns about the main JavaScript chunk exceeding 500 kB (about 565 kB before compression).
- Scoped ESLint checks pass for the new session/transport/validation modules, rewritten host/peer managers, player panel and test files.
- The full repository lint command still fails: 372 errors and 22 warnings, compared with 399 errors and 23 warnings in the initial audit. These are follow-up work, not a passing global quality gate.
- This does not verify a complete game, WebKit/mobile browsers, durable recovery, offline installation or Bluetooth.

## Stage 2 gameplay test

`npm run test:e2e` also runs `gameplay.spec.ts` (turns, bank trading, city upgrade, development-card purchase and a fixture-based ten-point victory on both clients). See [BASE_RULES.md](BASE_RULES.md) for the exact fixture boundary and updated verification results. Its victory screenshot is saved as `test-results/gameplay-victory.png`.
