# Catan setup preview — PWA 1.3.0

This is the first Catan slice in the installed Game Shelf PWA. The user selected **iPad setup first**, before internet Catan. It is a local shared-device preview, not a complete base game.

## Try it on iPad

1. Open the installed app online and accept **Install update**. Check version **1.3.0** and **Ready for offline**.
2. Open **Catan → Open Catan setup** from the library.
3. Choose three or four players and press **Start setup**. Player order is randomized and displayed.
4. Tap a highlighted intersection to place a settlement, then a highlighted adjacent edge to place its road. Repeat in forward player order, then reverse order.
5. Starting resources are awarded from terrain around each player's second settlement. They are public during this shared-device setup.
6. After a few placements, turn on airplane mode with Wi-Fi off, fully close the app and reopen it. Open Catan and continue from the saved position.
7. Optionally export a backup, start a new setup and restore the backup. Replacing a saved setup requires confirmation.

The preview ends with **Setup complete!** after two settlements and two roads per player. Dice, player/bank trades, development cards, robber play, scoring and internet Catan are not exposed in this preview. The existing tic-tac-toe local/online modes remain separate and available.

## Reuse and boundaries

- `src/game/engine/setupSession.ts` is a pure TypeScript session/rule module: injected IDs/time/player order, versioned legal-move journal, explicit turn/revision checks, immutable transitions, payload-bound command deduplication and deterministic replay. No UI, Redux runtime, transport, storage or clock dependencies.
- Reuse `setupValidation.ts`, the existing board geometry and fixed 19-tile board generator. The validation module now accepts a structural domain input instead of importing the session/Redux state type. Existing OpenCatan callers remain compatible.
- Setup's `ruleVersion: 1` pins its fixed layout and rules. Saves replay all placements to validate them before use. This is sufficient for this bounded deterministic setup; it is not the full internal recovery snapshot needed for dice, secret decks and future gameplay. Do not silently change the version-1 board/rules.
- `pwa/hello/catan.js` provides an original SVG rendering and touch/keyboard placement UI. Only currently legal targets are offered; the engine independently validates every placement. Completed pieces appear only after IndexedDB transaction completion.
- `record-store.js` extracts the existing local compare-and-write adapter for reuse. Tic-tac-toe retains its original `spelhyllan` database; Catan uses `game-shelf-catan`. New revisions append exactly one journal entry, with immutable game settings and CAS in one transaction. Unknown/corrupt stored formats are preserved and block destructive replacement.
- Local backups validate by replay and restore with a fresh game identity. This setup has no secret hands/deck to export. Future full-game authority backups require a separate security design.
- `scripts/build-pwa.mjs` bundles only the pure setup engine with Vite and includes it in the source-derived build ID and verified service-worker inventory. No legacy `public` assets, images, sounds, fonts, React application, PartyKit client or backend credentials enter the setup package. All 16 required app assets are cached for offline use.

## Rights and limitations

Graphics are original SVG primitives and system text. The original OpenCatan media files are not distributed in this PWA. The repository README's MIT assertion still lacks the previously requested independent licensing evidence; asset/code/trademark distribution review remains open under LEG-01. This preview is not a claim that all original project rights have been resolved or that the product is affiliated with the board game's publisher.

There are no ports, movable robber, random maps, AI, secret-hand UI or multiplayer transport for Catan yet. The chosen scope is placement and persistence. Same-device participants are trusted and share public setup information. The player count is three or four, with a fixed map and randomized order; this does not establish broader rule/variant parity.

## Verification

- 58 unit tests passed, including five Catan setup cases (parameterized for both player counts): snake order, second-settlement resources, finite starting pieces, legal phases/coordinates/turns/road adjacency, immutable rejection, replay, duplicate command receipts, changed-payload conflicts and unsupported/corrupt records.
- 20 deterministic PWA browser tests passed: the prior 17 scenarios plus full four-player setup/export/reset/restore, three-player offline full-browser restart, and failed placement saving/unknown stored schema. The shared storage refactor retains existing tic-tac-toe save/update/recovery coverage.
- `npm run build:typecheck` passed; the legacy main application still has its existing >500 kB bundle warning. Scoped ESLint and syntax checks passed for changed modules/tests. Existing global lint debt is not resolved by this slice.
- Visually inspected a full-page screenshot at an iPad-sized viewport. Real iPad verification of version 1.3.0 remains pending. The unchanged internet backend was not rebuilt or load-tested for this local slice.

Next: verify real iPad touch/offline recovery, then integrate subsequent base-game phases and a managed authority using the shared rule/session architecture. Do not extend the prototype's duplicated SQL game rules into a second Catan rule implementation.
