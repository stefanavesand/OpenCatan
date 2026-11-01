# Base-game rule verification: stage 2

The next slice after setup moves the active economy and turn rules into `src/game/engine/base`. These modules have no runtime dependency on React, Redux, PartyKit, storage or clocks. Their serializable state types still match the existing Redux slices; a standalone domain-state schema is future work.

## Implemented behavior

- Settlements, roads and cities validate ownership, phase, actual board geometry, connectivity, distance, resources and remaining pieces. Cities return a settlement to inventory. Rejected actions leave the input unchanged.
- Bank trading validates resource names, positive integer amounts, exact 4:1/3:1/2:1 ratios, the player's supply and the bank's stock. Ports are generated on real coastal edges and the same vertices are sent to rendering and used for trade rates.
- The host creates and shuffles one finite 25-card development deck: 14 knights, 5 victory points, and 2 each of Road Building, Year of Plenty and Monopoly. The deck stays outside recipient views and receipts. Buying draws from that deck instead of independently sampling a card type.
- Card effects validate ownership, purchase turn, phase and the one-action-card-per-turn limit. Road Building grants at most two legal roads. Duplicate Year of Plenty choices require two bank cards. A pre-roll Knight returns to the roll phase after resolving the robber.
- Dice production uses actual adjacent buildings, city multipliers, the robber and bank-shortage rules. Rolling seven freezes discard amounts. Discarding validates resource names, owned quantities and exact counts. Stealing requires the active player and an eligible adjacent victim, and transfers exactly one existing card.
- Longest Road counts trails rather than adding branches together, respects enemy buildings and preserves an existing holder on ties. Only the active player wins, including immediately after buying a hidden victory point. Final scores are sent to both clients.
- Receipt construction explicitly whitelists metadata and outcome fields: a rule result containing internal state can never serialize that state or its private deck into a receipt.

Host/peer transport and setup UI remain from stage 1. Setup still calls the legacy host rule implementation. Post-setup player-to-player trading and expansion actions are explicitly unavailable in this preview; the Trade dialog exposes bank trading. These unverified actions are rejected instead of reaching the legacy permissive validators.

## Verification

Use the commands in [SESSION_E2E.md](SESSION_E2E.md).

Verified on 2026-11-01 with Node 24.19.0:

- 29 Vitest tests pass (23 base-rule tests and 6 session/setup tests).
- Both Chromium browser scenarios pass against a real local PartyKit server and two isolated browser contexts: the original setup/security test and the new gameplay test.
- `npm run build:typecheck` passes. Vite still warns about the main JavaScript chunk exceeding 500 kB (about 576 kB before compression).
- Scoped ESLint passes for the new rule modules, host manager, receipt handling and new tests.
- Global lint remains under review: 371 errors and 14 warnings, compared with 372 errors and 22 warnings after stage 1.

The gameplay browser test plays setup and two normal dice/turn cycles, then uses an explicitly prepared hand to test UI bank trading, a city upgrade and a purchase. A separate late-game fixture verifies the final upgrade from nine to ten points and the victory UI on both clients. Fixtures use the real authoritative store and revisioned session; opponent hands are never installed in a peer browser. This is scenario-based progression coverage, not an unattended full game growing naturally from starting resources to ten points.

The pure tests cover resource conservation, atomic rejection, piece inventory, connection/distance rules, coastal ports, invalid trade amounts, all 25 card draws, receipt secrecy, card ownership/timing, all action-card effects, production/discard/steal behavior, road cycles and road blocking, and active-player victory.

## Remaining work

- Natural full-game simulations and four-player browser scenarios, more Longest Road tie/branch and bank-shortage edge cases, and actual-device browser tests.
- Player trading, audited logs/statistics/chat projections, complete authoritative snapshots and recovery.
- IndexedDB persistence, offline sessions, service worker installation and native transports.
- Remaining unchecked legacy modules and global lint debt; see [FOLLOW_UPS.md](FOLLOW_UPS.md).

No saved-game durability or offline-readiness claim is introduced in this stage.
