# Managed Catan authority review snapshot

Origin: [Lovable project](https://lovable.dev/projects/cdbab9d4-9c51-4ab0-89d9-feb24af9b7ce), source commit `503bbf3f22b4eb6a4406472294e0325918e5d6fd`, deployment `9431b104-fd99-4b48-a580-5e9238cf0a27`.

Public endpoint: `https://stefan-game-shelf.lovable.app/api/public/catan`.

These are source/SQL review artifacts from the managed project, not a standalone Node server or a local deployment target. The route expects that project's TanStack router and server-only Supabase integration. No service credentials are included. Do not import server code into the PWA.

The generated shared `catan-runtime.js` is intentionally not duplicated here. Build it from `src/game/session/index.ts` using `node scripts/build-catan-runtime.mjs`. Its checked SHA-256 is `134e4bde70212752518acbd6e0680ff6e9ec5cd68acfdbfe14af7e6b5d1f9348`; the copied deployed module was fetched and independently matched byte-for-byte. The bot MIT notice is included by the build script.

`migrations/` mirrors the subsequent atomic-recovery and privilege-hardening migrations. The initial Catan tables were created through the managed database tool and are not present in the platform's checked-in initial migration. `schema-columns.json` and `current-functions.sql` record current column/function definitions for review; they are **not** a complete restore script (indexes, constraints, grants and policies also matter). Reconstruct and test a full migration chain before claiming reproducible deployment/disaster recovery. Never run these artifacts blindly against an existing database.

Observed backend test evidence reported by its managed build:

- Exact runtime hash and both robber-scoring levels passed local regression tests.
- Nine Catan integration checks exercised setup, main turns, bot actions, privacy, membership, duplicate/changed payloads and direct database denial.
- Added targeted winning-acknowledgment loss, persisted rejection, atomic create/join concurrency, cross-principal collisions and legacy RPC denial checks passed in individual runs. The last combined recovery/runtime rerun passed 7/8: the repeated create-race case received the configured five-creates/hour HTTP 429. That case had passed earlier. A clean combined repeat remains outstanding; quotas were not cleared to make it green.
- An earlier broader run also encountered anonymous-auth limits and an invalid randomized empty-hand assertion; the assertion/helper was corrected without changing rules. Full real browser game evidence is recorded separately in docs/CATAN_FULL_GAME.md.

Pilot limits: five creates/hour, twenty joins/minute, 120 views/minute, sixty commands/minute per principal; ten active rooms; 8 KiB request body; names capped at thirty characters; logical expiry after seven inactive days. Rate counters use count/insert and can overshoot under concurrency. Anonymous principal recreation bypasses per-principal quotas. Bot drains cap at 24 decisions/invocation, not a strict wall-clock CPU timeout. Cleanup, cost alerts, aggregate abuse control and restore exercises remain open.
