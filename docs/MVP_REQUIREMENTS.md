# Private MVP requirements — decision draft

Version 0.1 · 2026-11-02. The user **confirmed scope**: private iPad PWA, two people plus one bot, complete internet game. Individual acceptance criteria and UI design below are proposals for agreement, not an approved release contract. Existing PRD/HLD remain the wider roadmap; after agreement, update the PRD before changing architecture or implementation.

## Product outcome

Two friends install/open the app on separate iPads, create/join a private invitation room, finish a base game against one bot, and resume the same seats after a normal interruption. Neither person operates a server. The UI/repository are English; conversation with the product owner may be Swedish.

The MVP is a private pilot for invited friends, not an app-store or public matchmaking launch. It is releasable when the agreed flows work on real target devices, operational limits are owned, and distribution rights are resolved. Existing PWA 1.4.0 is a prototype baseline, not evidence that all MVP gates are closed.

## Proposed acceptance contract

| ID | Requirement | Acceptance evidence |
|---|---|---|
| M-01 | Install and safely update on the agreed iPad/iPadOS matrix. Show offline readiness only after verified resources; retain compatible installs/saves and unresolved commands. | Real install/full close/reopen and interrupted-update test; old install upgrades without reinstalling. Exact devices/OS versions recorded. |
| M-02 | Create one room with a human name and Easy/Standard bot; share/join its invitation with the second human. Exactly two human seats and one visibly labeled bot; no public room directory. | Two physical devices join correct seats. Repeat join retains seat; a third principal is denied. Link holders can claim an empty guest seat; host approval is an open decision below. |
| M-03 | Play the scoped base game from legal snake setup to active-player victory at ten points on a fixed beginner board. | Natural full real game plus rule fixtures: production, finite bank, builds, ports/bank trades, player trade responses, all development-card phases, discards, robber/victims, longest road/largest army and victory. Agree the rule reference/variants before sign-off. |
| M-04 | Make the current actor, own legal choices, costs, turn phase and outcome understandable without reading implementation details. Board, own hand and primary turn action stay readily accessible. | Task-based prototype and real-game playtest; people can place, build, trade, discard and end turn without developer guidance. Design specifies both orientations. |
| M-05 | Every accepted action is saved by the authority before durable success. Unknown outcomes retry the same ID/payload; duplicates and stale/forged commands cannot create extra moves. | Lost acknowledgment/reload after commit, changed-payload conflict, concurrent browser attempts and winning-command retry. Server receipt and snapshot are committed atomically. |
| M-06 | Pause safely offline; foreground reopen/reconnect restores the same identity and current game. Show synchronizing, pending outcome, retry cooldown and permanent recovery problems distinctly. | Airplane mode, Wi-Fi interruption and full close/reopen on real devices; no iOS background dependency or human-seat takeover. Internet Catan remains paused until authority is reachable. |
| M-07 | Keep opponents' hands/deck private; the bot receives only its authorized player observation. Server derives seat from verified principal. | Inspect both human projections and bot input; equal public observations with different hidden contents give equal decisions. Non-members/direct browser database access are denied. No tokens/private snapshots in diagnostics. |
| M-08 | Offer two named basic bot levels and preserve the chosen policy/version for a room. Bot covers every eligible phase and can respond off turn. Surface a recoverable bot failure without retry storms. | Natural seeded three/four-seat engine regression plus mixed internet game; bounded scheduler/concurrent retry tests. Relative strength is not advertised as established. Numeric resource targets remain in BOT_REQUIREMENTS.md and require measured evidence. |
| M-09 | Support bounded two-party resource offers, accept/decline/cancel and clear pending state. Never execute a different trade after an outdated confirmation. | UI task test plus atomic transfer/race/insufficient-resource tests; inviter can cancel a pending offer. No auction/counteroffer system is required. |
| M-10 | Keep anonymous browser identity durable across normal updates/reopens. Explain identity loss without silently replacing a participant or granting access from a room link. | Failed refresh, unavailable storage and missing identity retain original data and show explicit recovery guidance. Proposed MVP: cross-device account recovery/account linking is deferred; owner must accept that limitation. |
| M-11 | Use original or authorized assets/code with documented provenance and notices. | License/dependency inventory reviewed; unresolved OpenCatan rights settled or affected code replaced with evidence of independent implementation. Product name/art reviewed. |
| M-12 | Deploy frontend, shared engine and managed authority reproducibly from versioned source. Keep secrets server-only, compatible protocol/schema handling and a rollback path. | Clean checkout builds/tests; fresh test database migration and restore exercise; frontend/backend hash or semantic parity checked automatically; no manual code transcription. |
| M-13 | Operate within an agreed private-pilot budget with bounded requests/bot work, access controls, expiry/retention and useful sanitized diagnostics. | Atomic quota/concurrency and 429/backoff tests, bounded load test, billing alert, documented owner and incident/restore procedure. Proposed seven-day inactivity expiry must be made visible and its data-deletion policy agreed. Editor credits and runtime/hosting charges are tracked separately. |
| M-14 | Provide accessible iPad controls: touch targets at least 44 CSS px, labels beyond player color alone, readable contrast/text, keyboard focus and visible commit/selection feedback. | Design specifications plus manual touch/VoiceOver/keyboard spot checks and automated checks where applicable. Resolve accidental double-tap/build/turn-end behavior. |
| M-15 | Complete release verification on the supported device matrix with no known blocking defect. | Clean scoped lint/typecheck/build, mapped unit/integration/browser tests, old-save/update compatibility and a complete two-human/one-bot physical-device game. Separate historical passes from tests rerun on the release candidate. No open data-loss, secret-leak, wrong-rule, duplication or deadlock defect. |

## Deliberately outside this MVP

Full offline Catan, LAN/Bluetooth/WebRTC/native packaging; one-human/two-bot or configurable four-seat internet rooms; expansions/random maps; accounts/friends directory/matchmaking/chat/spectators; host transfer or disconnected-human takeover; competitive bot ratings; public-service scale. Preserve existing local setup/tic-tac-toe saves and behavior during migration; decide whether their entrypoints remain visible or move to a separate experiments area.

## Decisions needed before implementation scope is fixed

| Decision | Proposed baseline | Status |
|---|---|---|
| Private MVP audience and two-human/one-bot internet flow | Confirmed by user on 2026-11-02 | Agreed scope |
| Supported devices/orientations | iPad first; portrait and landscape; list actual iPadOS versions before acceptance | Proposed |
| Rules/map | Base game, ten VP, beginner board, no timer, normal robber/discard rules; choose a specific rules reference | Proposed |
| Entry/identity | Persistent anonymous principals, invitation-only room discovery, first valid guest claims slot; clearly disclose identity loss | Proposed; decide whether host confirmation is required |
| Reference games | Keep existing data; move experimental entrypoints out of the main Catan flow | Proposed |
| Naming/visual style | Original readable tabletop-inspired SVG design, distinct from commercial assets; working name Game Shelf | Proposed; design review needed |
| Expiry, budget and operation | Start from explicit pilot limits; choose retention/deletion period, monthly runtime cap and operational owner | Open |
| Requirements/design agreement | Review this contract, rule variants and hi-fi prototype together; record accepted version and changes | Pending |

The next conversation should resolve these product decisions; it should not reopen the already confirmed narrow MVP scope without a reason. Tasks, dependencies and release gates: [migration/MVP todo](MIGRATION_MVP_TODO.md). Design deliverables: [UI design brief](MVP_UI_DESIGN.md).
