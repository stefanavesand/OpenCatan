# Game Shelf / OpenCatan — Product Requirements Document

Version 3.4 · 2026-11-02 · Roadmap baseline with a confirmed narrow private-MVP scope; product decisions agreed, mobile-ready design required, operational acceptance and visual design still under review.

This PRD supersedes the [original PRD](docs/archive/PRD-2025-12-29.md). Its game ideas remain available as history; claims of feature completeness, asset licensing, host migration and all expansions at launch are not verified commitments. This document takes precedence for future work. The document version is independent of the app version. Version 3.1 translated the baseline into English. Version 3.2 added staged bot requirements; version 3.3 recorded the confirmed private MVP scope and its decision drafts; version 3.4 records the agreed product baseline and later phone-support design requirement. Existing requirement IDs remain stable.

## 1. Goals and audience

Build a board-game collection for friends on tablets, phones and computers. OpenCatan is the first substantial game. Tic-tac-toe is a small reference game for verifying installation, sessions and transports before adding complexity.

Start with an installable PWA, with iPad as the first verified device. Internet play must use managed hosting without requiring us to administer a server. Later, the same product should be packaged for iOS/Android with Capacitor and support LAN and cross-platform Bluetooth. Reuse web technology/TypeScript where appropriate; Rust/Wasm is not required.

Local games must work without internet or an authentication server. Internet games may require internet access. Downloading the app does not mean an internet game can continue without its authority.

The app and all maintained repository content must be in English. Conversation with the user may be in Swedish. Language changes must preserve installation identity, saved games, player identities and compatibility with existing links.

## 2. Stages and scope

Private MVP scope confirmed by the user on 2026-11-02: **two humans plus one bot, internet play, iPad PWA, private invitations**. The broader E2/B1–B3 capabilities below remain roadmap stages; not all are mandatory for this first MVP. [MVP requirements](docs/MVP_REQUIREMENTS.md) propose the detailed acceptance contract and open decisions; [UI design brief](docs/MVP_UI_DESIGN.md) defines the design work still required. The user also agreed the detailed product baseline on 2026-11-02: both iPad orientations, fixed beginner board/ten VP/no timer, first invited guest admission, persistent anonymous identity with no storage-loss recovery, Easy/Standard at creation, Catan/resume primary with experiments separate, and save/reconnect after every accepted action. Design responsive phone layouts now for later mobile support; phone certification and native packaging remain later gates. Operational choices remain open. The user selected A — Calm Table as the visual direction on 2026-11-02; detailed design and clickable-prototype agreement remain pending. [Inventory](docs/MIGRATION_INVENTORY.md) and [migration/release todo](docs/MIGRATION_MVP_TODO.md) describe the independent-repository transition; no live migration has occurred.

| Stage | Deliverable and gate |
|---|---|
| E0 — reference game | Installable PWA, locally saved tic-tac-toe and internet play. The baseline exists; remaining failure paths and measurements must be verified under §8. |
| E1 — shared session foundation | Independent rule engine, versioned session protocol, durable storage, private views, defined states/errors and a selected managed execution environment. Verify with tic-tac-toe first. |
| E2 — OpenCatan base game | 3–4 human/bot players, touch UI, complete scoped base game, saving and reconnection. Includes player trading; verify complete natural games. Distribution of bundled assets requires rights review. |
| E3 — native and local transports | Capacitor iOS/Android; verify LAN/TCP, then Bluetooth separately. Document host trust and recovery. |
| Later | Expansions, 5–6 players, direct P2P/WebRTC, account linking, spectators, advanced AI and automatic host migration need separate prioritization. Friends follow account linking and identity recovery; invitations remain room links for now. Basic bots are now in scope under the staged plan below; advanced learned/LLM opponents remain later work. |

Avoid a large rewrite: replace bounded flows and preserve working installations/saves. Native, Bluetooth and expansions are outside the next implementation. Existing PartyKit code is reuse material, not a binding provider choice. Lovable Cloud is verified prototype hosting; the final runtime for a shared TypeScript engine remains open.

Basic bot stages: **B1** local Catan setup bots, **B2** complete base-game decisions and repeatable headless simulations, **B3** internet play with two humans plus one bot. B3 depends on Catan rooms and managed authority; B1 remains shared-device setup. [Bot requirements](docs/BOT_REQUIREMENTS.md) define BOT-01–18, acceptance tests BT-01–12 and release gates. These are planned requirements, not implemented features.

## 3. Current status and evidence

Status: **M** = manually confirmed, **A** = automatically verified within the stated scope, **R** = code-reviewed, **P** = planned. Passing a scenario is not a general guarantee.

| Area | Evidence as of 2026-11-01 | Remaining |
|---|---|---|
| PWA installation, offline startup, updates and local tic-tac-toe | M: user confirmed on iPad. A: cache integrity, failed updates, storage failures and recovery. | Wider iOS/Android matrix, long-term storage. |
| Online tic-tac-toe, Lovable Cloud | M: user confirmed 1.2.0 on their devices. A: full game with two isolated browser identities against the real backend, polling and reconnection. | Separate physical networks and exact sleep/resume scenarios have not been specifically confirmed. |
| PWA commands and failures | A: simulated lost response, identical retry after reload, offline pause and identity preservation on failed token refresh. Version 1.2.1 added lifecycle/backoff policy; the user confirmed it works. | Complete failure/version matrix and safer identity-loss handling. |
| OpenCatan | A: local PartyKit scenarios cover setup and progression to victory using prepared fixtures. A/R: parts of the rules and protected player views. | Natural complete games, 3–4 participants, player trading, full durable saves and secrecy review. |
| Security and operations | R: prototype RLS, validating RPCs and public client key. Lovable reported 11 passing backend/rule tests; these were not independently rerun here. | Rate limiting, abuse protection, retention, cost controls and complete threat-model implementation. |
| Rights | README states MIT; an actual license file and supporting asset rights were missing at the initial review. | Establish rights or replace affected assets before distribution. |

The original 3.0 baseline followed 41 passing unit tests, 12 deterministic PWA tests and one separate live-backend E2E test. The 1.2.1 lifecycle slice subsequently passed 53 unit tests, 16 deterministic PWA tests and a separate live-backend E2E; see [session states](docs/SESSION_STATES.md). This document does not claim a new test run. See [online PWA](docs/ONLINE_PWA.md), [local game](docs/LOCAL_GAME.md), [rule review](docs/BASE_RULES.md) and [session E2E](docs/SESSION_E2E.md). Existing global lint debt remains in OpenCatan.

## 4. Game scope

E2 includes 19 hexes, five resources, snake-order setup, randomized turn order, dice and resource production, finite bank supply, roads/settlements/cities, development cards/deck, robber/seven/discard/steal, bank/port trading, player trading, Longest Road, Largest Army and victory on the active player's turn (normally 10 points). Invalid moves must not change state. The authority generates randomness from an appropriate secure source; clients cannot choose dice outcomes or cards.

Document the rule reference and explicit variants; an ambition to match Colonist is neither a specification nor a license. Finalize map/robber variants before E2. Start with unlimited turns; timers and automatic actions need explicit rules and cannot depend on client background execution. Expansions and their variants are outside E2.

## 5. User stories and acceptance criteria

Requirement IDs are stable. A = mandatory for the stated stage; B = later improvement. Map each row to verification under §8 and the HLD. Target design is not implementation status.

| ID / stage / priority | Story | Acceptance criteria |
|---|---|---|
| UX-01 / E0 / A | As a player, I want to install and open the app offline. | Given a complete verified resource package, a cold offline start opens the library and local play. Show “Ready for offline” only after checking every required file. An interrupted first download cannot show readiness. |
| UX-02 / E1 / A | I want to resume a local game. | Persist state durably after each completed move. Full shutdown/restart restores the latest accepted move. Denied storage/quota failure prevents a new move and offers a clear error/retry. |
| UX-03 / E1 / A | I want to invite and join without a registration form. | Creating a room provides a shareable invitation. Two reference players or 3–4 base-game players get unique seats. Invalid/full rooms give a clear message. Rejoining with the same identity consumes no additional seat. |
| UX-04 / E1 / A | I want to know whether my move happened. | Distinguish pending, accepted, rejected and unknown outcome. Retrying the same command after timeout returns its durable result without an additional move. A stale revision refreshes the view without automatically reinterpreting the player's choice. |
| UX-05 / E1 / A | I want to return after a network interruption or iPad sleep. | The same identity regains its seat; resolve pending commands and fetch the current authorized view before allowing new moves. No background execution is required. Explain lost identity; never silently replace it and claim a reconnection. |
| UX-06 / E2 / A | I want my secret cards to stay private. | Other clients receive no private hands/decks through state, messages, errors, logs or statistics. Show public counts and the player's own cards correctly. Explicit visibility rules also apply to reconnect/end-game behavior. |
| UX-07 / E1 / A | I want to update without losing my game. | A broken candidate package preserves the working version. Activation is controlled; finish in-flight storage and preserve pending commands. Unknown save/protocol versions preserve data and stop clearly. Migrations are tested or deferred without destructive changes. |
| UX-08 / E2 / A | I want to play a correct base game on iPad. | All scoped base rules work with touch, clear turn/error feedback and no hover requirement. Complete natural 3- and 4-player games finish without manually manipulating state. |
| UX-09 / E3 / A | I want local play without a service account. | An offline local identity participates through an available native transport; show capabilities/limitations. Do not contact internet authentication. Host loss gives an honest pause/recovery flow, not unsafe automatic migration. |
| UX-10 / E1 / A | I want to understand how my save is protected. | Request persistent browser storage where supported, handle denial and offer a safe backup for local games. Distinguish cloud saves from local copies. Copies containing secrets have an explicit audience and warning. |
| UX-11 / B1–B3 / A | I want to play with fewer human participants and reproduce bot-driven failures. | Explicit bot seats fill a 3-/4-seat game without taking human turns or seeing extra information. B1 supports local setup; B2 covers all base-game phases and seeded replay; B3 supports two invited human devices plus one bot. Meet [BOT-01–18 and staged acceptance gates](docs/BOT_REQUIREMENTS.md); no full internet-game promise is introduced by setup bots. |

## 6. Cross-cutting requirements

### Architecture and data integrity

| ID | Requirement and observable behavior |
|---|---|
| ARC-01 | Separate UI, rule engine, session, transport and storage. The engine must not import UI, PartyKit, networking or storage; supply randomness/time explicitly. Authorities use the same rule implementation. |
| ARC-02 | Transport declares internet requirements, delivery/ordering, targeted messages, payload limits, discovery and update mode. Session correctness cannot depend on a transport's automatic reconnect. |
| DATA-01 | Stable identity, unique command IDs, revisions and version fields. Authority verifies identity/permissions, binds IDs to content and protects concurrent writes. Reusing an ID with different content returns a conflict. |
| DATA-02 | Acceptance means atomic durable state and receipt before acknowledgment. A crash after commit but before reply recovers without repeating the move. Full internal recovery snapshots are distinct from player views. |
| DATA-03 | Version protocol, save format and rules. Unsupported versions fail explicitly without overwriting data. Recovery includes necessary internal phase/randomness information without exposing it to unauthorized players. |
| DATA-04 | IndexedDB is the first normal local game store, behind a replaceable interface. Prototype localStorage for online identity/outbox is temporary. Cloud storage, local copies and drafts have explicit authority and retention. |

### Authentication, security and privacy

| ID | Requirement and observable behavior |
|---|---|
| SEC-01 | Internet play uses verified authentication even without a registration form. Derive identity from a verified token/connection, not a trusted client parameter. Local identity requires no server. Refresh must not silently replace identity. |
| SEC-02 | Check membership/permissions on every read, command and subscription. Room IDs/invitations are not read permission or player identity. Validate joining; reconnect never takes another player's seat. |
| SEC-03 | Authority validates message format, version, size and action; clients cannot write authoritative state directly. Allow public/private fields explicitly per recipient. Protect secrets in logs/telemetry too. |
| SEC-04 | Internet TLS, least-privilege backend, server secrets only on the server, script-injection protection, dependency review and restrictive CSP where supported. CORS is not a substitute for authentication/authorization. |
| SEC-05 | Bound identity/room creation, join attempts, reads, commands, concurrent connections and payload sizes. Combine identity/IP/room limits where appropriate; NAT must not block ordinary game nights. Overload gives defined waiting behavior without dropping a pending command. |
| SEC-06 | Threat model includes malicious participants, outsiders, leaked links/tokens, replay, mass creation and misconfigured permissions. Cloud service/local host is trusted and can read internal secrets; protection against a malicious authority is out of scope. |
| SEC-07 | Document data types, retention, cleanup, access and deletion, including receipts and backups. Minimize personal data. Deleted/expired sessions produce a terminal state, not endless reconnect. |

### Operations, usability and distribution

| ID | Requirement and observable behavior |
|---|---|
| OPS-01 | Managed hosting, separate test/production environments, versioned deployment and recovery plan. No self-managed VPS required. Backend changes must not inadvertently break older installed clients. |
| OPS-02 | Measure latency, reconnects, rejections, rate limits, storage errors and costs without secrets. Set budgets/alerts and responsibility; an alert is not a hard spending cap. |
| OPS-03 | Cleanup/quotas must not unexpectedly delete active games. Explain inactivity, completion, retention and loss-of-access conditions before the relevant action. |
| NFR-01 | Internet games block new moves until synchronized. Offline-package readiness, device network status and game connection are distinct UI concepts. Errors explain what happened and the player's next action. |
| NFR-02 | Proposed E1 acceptance targets: p95 durable command acknowledgment ≤1 s and opponent-visible update ≤6 s, under a declared healthy test network with 20 concurrent reference rooms. Report measurement boundaries, network latency and load; these are targets, not measured guarantees or public capacity commitments. |
| NFR-03 | iPad/Safari and installed PWA are mandatory verification targets. Before wider release, test current and previous available major iOS/iPadOS versions, Android Chrome and desktop Chromium; record exact versions. Touch, keyboard, focus and status announcements must work. |
| LEG-01 | Inventory actual code licenses and rights to images, audio, fonts, names and other assets. Preserve attribution. Distribute only assets with documented rights or original replacements; README text alone is insufficient evidence. |

## 7. States and errors as product requirements

Connection, command and game states are separate. A game may remain active at its authority while a player is disconnected. HLD must specify triggers, guards, effects and states surviving restart.

| Situation | Required behavior |
|---|---|
| Timeout/unknown outcome | Keep the command ID/payload; look up or resend after reconnect. Timeout alone does not mean rejected. |
| Stale revision/illegal move | Show the latest authorized view or reason. Do not reinterpret the input as a new move automatically. |
| Storage failure | No success acknowledgment before durable commit. If server outcome is unknown, retain the intent for resolution/retry. |
| Auth failure/lost identity | Attempt safe refresh; otherwise block and explain recovery without taking another player's seat. |
| Rate limit/overload | Honor `Retry-After`, exponential delay and jitter; suspend background polling and avoid reconnect storms. |
| Lost authority | Cloud: restore latest durable state when the service returns. Local host: pause until the correct host restores; no automatic migration in the first version. |
| Version mismatch/expired room | Preserve data, provide an explicit terminal explanation and prevent endless retry/destructive migration. |

## 8. Verification plan and release gates

Unit tests verify pure rules/states; integration tests verify atomic storage/protocol/permissions; E2E tests verify player flows and injected failures. Real devices are required for installation, sleep and return. The cases below specify required future coverage, not a list of passing tests.

| Case | Requirements | Required scenarios / level |
|---|---|---|
| T-01 | UX-01, UX-07, NFR-03 | Cold offline start; broken first download; interrupted update; previous version and save survive. E2E + iPad. |
| T-02 | UX-02, UX-10, DATA-02/03/04 | Quota failure/denied persistence, concurrent local writers, crash before/after commit, corrupt/future schema, safe export/import. Integration + E2E. |
| T-03 | UX-03/05, SEC-01/02 | Same identity, full/invalid room, third player, seat theft, token refresh/loss, Safari versus installed storage. Integration + two devices. |
| T-04 | UX-04, DATA-01/02 | Duplicate delivery, changed payload with the same ID, concurrent moves, lost receipt, server crash after commit, delayed/reordered views. Integration + failure-injected E2E. |
| T-05 | UX-05, ARC-02, NFR-01 | Different networks, network switching, sleep/full shutdown, service failure/recovery. Not merely a simulated offline flag. Devices + E2E. |
| T-06 | UX-06, SEC-02/03/06 | Inspect actual client payloads, subscriptions, logs, errors and recovery. No opponents' cards/internal snapshots; deny forged identities and direct database access. Integration + E2E. |
| T-07 | UX-08, ARC-01 | Rule invariants (resource conservation, legal phases, deck, victory), natural full 3-/4-player games and all base-game flows including trading. Unit + integration + devices. |
| T-08 | SEC-04/05, OPS-02, NFR-02 | Oversized/unknown payload, auth/room/join spam, NAT, reconnect storm, 429/Retry-After, measured load and budget alerts. Bounded test environment, no unannounced production load. |
| T-09 | UX-07, DATA-03, OPS-01 | Old client/new backend and inverse, controlled update with pending move, migration failure and rollback. Integration + E2E. |
| T-10 | UX-09, SEC-06, OPS-03/SEC-07 | Local host loss/recovery with protected secrets; expiry, cleanup/deletion and receipt retention with explicit recovery error. Integration/devices by stage. |
| T-11 | LEG-01 | Asset inventory with licensing evidence/attribution and inspection of the actual distribution package. Document/package review. |

Bot-specific coverage BT-01–12 and B1/B2/B3 gates are maintained in [BOT_REQUIREMENTS.md](docs/BOT_REQUIREMENTS.md). They supplement T-01–11 and do not replace privacy, persistence, rights or real-device requirements.

E1 closes only after implementing contracts/states in the reference game, verifying T-01–05 and relevant T-08–10, documenting the threat model/measurement limits and demonstrating managed shared-rule execution. E2 additionally requires T-06/07/11, complete scoped base gameplay, secrecy review and full internal snapshot recovery. A prototype on GitHub Pages does not satisfy these gates by itself.

## 9. Decisions and open questions

Established direction: PWA first, TypeScript reuse, replaceable layers, managed internet hosting, local play without an authentication server, and no Bluetooth/host-migration implementation now. Resolve before the relevant implementation:

- Execute the same engine online/locally: Lovable experiment or another managed runtime. Duplicated SQL/TypeScript rules are not OpenCatan's target architecture.
- Recover lost anonymous identity without leaking secrets; optional future account linking, then friends. Friendship never grants automatic access to sessions/private cards.
- Exact rate limits, receipt/game retention, budget, backup/RPO/RTO and operational responsibility. Restart recovery is not protection from provider data loss.
- Base-game rule reference/variants, distribution rights and final product naming. The current English display name is Game Shelf.

[HLD](docs/HLD.md) and later decisions must reference requirement IDs; update product requirements here first. Historical review reports retain their dates and scope.
