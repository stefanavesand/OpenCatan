# MVP UI design brief and review plan

Version 0.1 · 2026-11-02. This is a **design brief and screen/state inventory**, not an approved visual design or a completed prototype. Scope: [private MVP requirements](MVP_REQUIREMENTS.md), two humans plus one bot on iPad. Do not implement a large UI rewrite before requirements and the resulting design are agreed.

## Design goals

Make the board the main workspace. Move room creation/invitation controls out of the active game's primary area. Keep the current phase, acting player, own hand and primary action accessible. Present player trades, card effects and discards as deliberate, understandable decisions with a visible commit boundary. Keep diagnostics and transport details out of normal gameplay.

Use original graphics, text and iconography with documented rights. Terrain/resource type and player identity must remain distinguishable without color alone. English copy, readable text, clear focus, 44 CSS px touch targets, contrast and VoiceOver labels are part of the design deliverable.

## Primary journey and screens

| Screen | Purpose / primary action | Required variants |
|---|---|---|
| Start/resume | Resume a game, create a room or open an invitation | First visit, existing room, cached offline shell, incompatible/unknown saved version |
| Create room | Name and bot level; create once and share invitation | Storage/auth failure, pending create, 429 cooldown, safe existing-room switch |
| Invitation/lobby | Show human seats and bot level; invite or join | Waiting guest, joining, full room, expired/invalid link, same-identity rejoin, identity missing |
| Setup board | Show snake order, piece to place and legal targets | Human selection/commit, waiting for friend/bot, second-settlement resource explanation, interrupted save |
| Active game | Board, player summaries, own hand, phase/action area | Roll, main actions, build preview, card choice, bank/port trade, free roads, opponent/bot acting |
| Trade panel | Specify both bundles and recipient; review then submit | Incoming accept/decline, outgoing cancel/waiting, stale/withdrawn offer, insufficient resources |
| Discard/robber/card decision | Show exact required choice and valid targets | Off-turn discard, move robber, select victim, Year of Plenty/Monopoly; no hidden opponent information |
| Recovery overlay/banner | Explain what is known and available next | Offline, sync, unknown command outcome, rate cooldown, expired room, lost identity, unsupported version, bot fault |
| Result/resume or new room | Winner/final public scores and clear completion | All participants see same result; pending winning acknowledgment resolved; explicit new-room action |

## Proposed layout, to validate in prototype

**Landscape:** compact header for room/connection status; dominant board; adjacent own hand/action area; compact public player summaries. Invitation details live in a room sheet. **Portrait:** board first, compact player strip, hand/action tray with detail sheets. Avoid the current long page that places create/join forms above an ongoing game. Validate both orientations at representative CSS viewports (1024×768 and 768×1024); these are design frames, not a final supported-device claim.

Proposed interaction: choose an action, preview a legal location/quantity, then commit according to one consistent pattern. Make cancellation obvious. Decide explicitly whether setup placement commits on first tap or uses a confirmation; avoid different behavior for visually equivalent pieces. After submission, prevent another command until the original outcome is resolved, while keeping the board readable. A cosmetic bot-thinking indicator must not imply a move has been saved.

Connection state and game state are orthogonal. A disabled action must have a visible reason. Distinguish a locally selected preview from a server-acknowledged piece. Show offline readiness as app availability while making internet-game pause clear. Permanent failures need next steps, rather than an endless spinner or an ineffective Reconnect button.

## Required deliverables before UI implementation

- [ ] D-01: Annotated low-fi journey for all screens above, including the off-turn/unknown-outcome branches; link each to M-01–15.
- [ ] D-02: Two original visual directions with one real board/hand/action screen each; select a direction with the product owner.
- [ ] D-03: Hi-fi portrait and landscape designs for lobby, setup, active game, trade and results, plus recovery states. Use realistic resource/card quantities and long player names.
- [ ] D-04: Component/state specification: terrain/pieces, player labels, hand/card UI, action/confirmation controls, legal targets, sheets, alerts, focus, spacing, typography, contrast and motion/reduced motion.
- [ ] D-05: Clickable prototype covering create/invite/join, both setup rounds, ordinary turn/build, a trade, discard/robber, development card, disconnect/reconnect and victory. Include asynchronous waiting and failure, not only the happy path.
- [ ] D-06: Walk through the prototype on iPad with the user and a second participant. Record whether each can understand who acts, what is legal, what is secret and what is committed. Fix blocking confusion before design agreement.
- [ ] D-07: Record agreed design version, prototype location, resolved choices, accessible behavior and implementation acceptance checklist. Unresolved states remain visible tasks.

Suggested prototype tasks: join a friend's room; place second settlement; identify own resources; build without an accidental commit; send/decline/cancel a trade; discard exactly the required number; move the robber and choose a victim; recover after a lost acknowledgment; recognize victory. The product owner can approve this brief's direction without treating it as approval of a visual design that does not yet exist.

Implementation should then proceed flow by flow using the shared engine as authority. Do not couple rules to drawing components or switch framework as a side effect of choosing a visual direction. Framework choice remains a small technical decision after the design needs are understood.
