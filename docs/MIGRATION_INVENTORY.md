# Game Shelf migration inventory

2026-11-02. Baseline: source `34a26ea`; published PWA 1.4.0, build `5c47df960c8b`. Compare against locally available upstream commit `97786b131a4af8eae8aada53578bfca9b1789982`; this inventory does not assert that upstream has not changed remotely.

## Finding

An independent repository is feasible without rewriting the working game. The published PWA uses its own DOM/SVG UI, session layer and managed authority. The legacy React/Redux/PartyKit application is outside the PWA's emitted runtime. OpenCatan-derived geometry, board generation and types remain; a new repository does not remove their provenance or licensing requirements.

Built both PWA engine entrypoints with Vite/Rollup, inspecting emitted module contributions. The full-game bundle has **14 source modules**, five with upstream counterparts (three unchanged, two modified). The setup bundle has five modules; the union is fifteen. This is a module inventory, not a percentage of original authorship. Nine full-game modules were added in our history; that does not establish independent authorship of every statement in them.

The TypeScript source closure contains **43 files**, including Redux slices, old networking and session adapters. Type-only imports/barrel exports pull those into typechecking even though they are erased from the shipped bundle. Copying only the runtime files will not produce an independently typecheckable project.

Machine-readable evidence: [module inventory](MIGRATION_MODULE_INVENTORY.json). This turn executed bundle inspection and compiler dependency discovery; it did not rerun full games, perform fresh device tests or inspect the live database. Previous execution evidence remains in [CATAN_FULL_GAME.md](CATAN_FULL_GAME.md).

## Components and disposition

| Component | Concrete paths | Origin / dependency | Migration disposition |
|---|---|---|---|
| PWA shell, install/update/cache integrity | `pwa/hello/app.js`, `manifest.webmanifest`, `pwa/sw-template.js`, build/serve/publish scripts | Added in project history; own generated icons | Keep behavior and installation identity; adapt build paths independently of UI work. |
| Full Catan touch UI | `pwa/hello/catan-online.js`, `index.html`, `style.css` | Added DOM/SVG UI; no legacy artwork or framework runtime | Preserve as a functional reference; redesign after requirements/design agreement. Current room forms and long vertical page compete with the board. |
| Local setup and reference game | `catan.js`, `library.js`, `game.js`, `storage.js`, `record-store.js`, `online.js` | Added in project history; IndexedDB and separate tic-tac-toe backend | Preserve installed saves during migration. Keep as regression/reference functionality; new feature work is outside the selected MVP. Decide visibility in design. |
| Full session, player trades and bot policy | `src/game/session/{catan,bot,index}.ts` | Added session code; bot settlement heuristic adapts pinned MIT catan-ai source | Keep rules/behavior; retain MIT notice. Separate session orchestration from rule API incrementally. |
| Base rules | `src/game/engine/base/{board,economy,scoring,turn}.ts`, `setupValidation.ts` | Added in project history, using existing types/coordinates | Keep and test; resolve structural type dependencies. Do not replace with the old permissive engine. |
| Local setup engine | `src/game/engine/setupSession.ts` | Added; uses upstream board/geometry | Keep old snapshot/replay compatibility or provide explicit migration/compatible playback. |
| Geometry | `src/utils/hex.ts`, `hexMath.ts` | `hexMath` unchanged; `hex` has three endpoint/adjacency fixes relative to upstream | Retain corrections and coordinate keys; isolate minimum required functions. Rights gate applies. |
| Board generation | `src/utils/boardGenerator.ts` | Unchanged upstream; only beginner-board/terrain functions survive tree shaking | Extract required surface after rights decision; expansions/random generators are outside MVP. |
| Player/card helpers | `src/types/{player,cards}.ts` | Cards unchanged; player adds projected card counts | Retain required limits/deck constants/factory; remove unrelated expansion surface only with parity tests. |
| Types and private projection | `src/session/{protocol,projectView}.ts`, `src/types/*`, imported Redux slice types | Added protocol/projection with upstream-derived state/type shapes | Define UI-independent domain types and separate internal snapshot from player observation. Eliminate type imports into Redux/network modules. |
| Internet client and connection policy | `catan-online-transport.js`, `session-state.js`, shared `online-transport.js` identity export | Managed HTTP, anonymous Supabase identity, localStorage outbox; Catan imports identity from tic-tac-toe transport | Keep stable identity/outbox; extract neutral auth and transport/storage ports. Add explicit capability/limit declarations. |
| Managed authority | `backend/catan/*`; linked Lovable project | TanStack server route plus Supabase; local files are review snapshots, not a complete deployable backend | Bring deployable source, tests and complete schema under version control; remove manual runtime-copy step; retain existing pilot service during cutover. |
| Tests and tooling | `tests/unit`, `tests/pwa`, PWA Playwright config; bot runner | New scenarios include 65 unit tests, 21 deterministic browser tests and natural live/simulation evidence from previous release | Port relevant tests and fixtures. Separate legacy PartyKit E2E; create clean scoped lint/typecheck/build gates. Do not count old passes as migration verification. |
| Legacy application and assets | React pages/components/hooks, Redux store, `src/network/*`, `party/`, legacy engines, original images/sounds, `mcp-server copy/` | Upstream legacy application plus experiments | Archive/reference; exclude from new runtime and dependencies. Preserve relevant history/attribution. Do not import artwork by accident. |

All five full-game upstream counterpart modules are listed above. Additional type-only dependencies are listed in the JSON report. React, ReactDOM, Redux, React Router, PartyKit, PartySocket and uuid are not emitted by the inspected PWA engines; they are candidates for removal from the new app's dependency manifest after type/test isolation. Vite/TypeScript, Vitest and Playwright remain useful tooling. The managed backend has its own TanStack/Supabase dependency set and is a separate deployment target.

## Compatibility boundaries

| Boundary | Preserve / verify |
|---|---|
| Installation and origin | `https://stefanavesand.github.io/OpenCatan/hello/`; manifest id/start_url/scope `./`. Repository independence need not change the serving origin/path. Storage and service-worker scope are origin/path sensitive; do not assume a redirect moves them. |
| Online identity and outbox | localStorage `spelhyllan-online-auth-v1`, `spelhyllan-online-state-v1`, `game-shelf-catan-online-v1`; preserve unresolved command UUID/payload/principal and lock coordination. Never export tokens into ordinary game backups. |
| Local records | IndexedDB `spelhyllan` and `game-shelf-catan`, version 1, store `sessions`; existing snapshots/backups retain compatible reading. |
| Game and protocol | Engine `1.0.0`, schema/API 1, coordinate keys, receipt semantics, room/seat IDs and active room links. Package moves can change generated bytes; use a reviewed new hash and parity test rather than assuming old pin still applies. |
| Managed endpoints | Existing Lovable Catan route and Supabase auth/tic-tac-toe endpoints; retain principal binding, server-only snapshots and service credentials. CORS changes are required if the frontend origin changes later. |
| Publishing | Current publisher explicitly checks the OpenCatan fork URL and writes `gh-pages`; dev server/tests hard-code `/OpenCatan/`. Choose a compatibility deployment strategy before changing repository/path. |

## Release gaps

The existing full-game internet run passed, but does not certify a redesigned UI or new repository. Current gaps include actual two-device iPad play, identity-loss recovery policy, explicit bot-failure UX, non-atomic rate counters, anonymous abuse/cost controls, missing initial backend schema migration, restore/cleanup operations, and unresolved upstream code licensing. Current repository-wide lint has legacy debt; copying all files would copy that debt too.

The catan-ai settlement heuristic has a verified MIT notice. The original OpenCatan README asserts MIT but no actual license notice was found in the reviewed baseline. A rights decision is a release blocker, including for a private pilot; creating a new repository or rewriting code cosmetically does not settle it. Do not label the entire new project MIT without establishing the relevant rights.

Next work is ordered in [MIGRATION_MVP_TODO.md](MIGRATION_MVP_TODO.md). This inventory creates no repository, moves no hosting and changes no live behavior.
