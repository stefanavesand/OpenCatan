# Reference session lifecycle — PWA 1.2.1

This is the first implementation slice of [HLD §6–7](HLD.md), addressing PRD UX-04/05, NFR-01 and the client side of SEC-05. It does not complete E1 or introduce server-side rate limiting.

## Changed behavior

- Pure `pwa/hello/session-state.js` owns connection/command state and retry policy, independent of UI, transport and storage. It is reusable by a future session adapter.
- UI distinguishes sending, accepted, rejected, not sent and unknown outcome. A lost response leaves the persisted intent intact and shows unknown rather than claiming rejection. A receipt resolves the outcome; successful synchronization alone does not claim the command was accepted.
- The transport exposes stable failure codes. Transient network/5xx failures use increasing delay (1 second doubling to a 60-second base, with up to 25% jitter). HTTP 429 respects the larger of backoff and readable `Retry-After` (seconds or HTTP date). Manual retry cannot bypass that delay in the running app.
- Auth, storage, unsupported version, malformed protocol and unavailable saved room stop automatic retries. Explicit retry can recheck after the underlying problem is fixed. Existing identity and unresolved command are preserved. No replacement anonymous identity is silently created.
- Background/offline/local-game navigation stops polling. Reconnecting does not erase a blocked error or an outstanding in-memory retry deadline.
- No backend changes or additional Lovable build requests. Current RPC names, public key configuration and saved identity/intent format remain compatible with 1.2.0.

## Verification

- 53 unit tests passed, including 12 lifecycle-policy cases for unknown vs unsent outcomes, retry timing/jitter, blocked errors across disconnect, stable rejection and `Retry-After` parsing.
- 16 deterministic PWA tests passed. New real-browser scenarios inject HTTP 429 and advance a controlled clock (no premature request, same command ID later), an incompatible API response or unknown error code (intent preserved, no automatic loop), and an inaccessible saved room (polling stops). Existing offline/update/local-save and two-player/retry scenarios continue to pass.
- Live two-player browser test passed against the actual backend (24.3 seconds), including a full game, polling, offline reload/recovery with the same identity, and both clients reaching the same win. It is run separately with `PWA_LIVE=1`. No real production overload or rate-limit load test is performed.

## Remaining gaps

This is a policy/session-client slice, not the full common session runtime. State-machine failure/backoff counters live in memory and reset on full reload; persisted pending intent does not. Client delay is not an abuse/security boundary. Server quotas must enforce cross-tab/reload limits; cross-tab auth/command locks already exist where Web Locks is supported, but a global cross-tab cooldown is not implemented. `Retry-After` needs an exposed CORS response header to be readable.

The backend still needs payload-bound command IDs and stable stored rejection receipts. Unknown identity recovery, indexed session storage, full game lifecycle, authority snapshots, retention/cost controls, a shared online/local rule runtime, and private Catan projections remain open. The local and OpenCatan implementations have not been moved onto this state policy yet.

The user subsequently confirmed version 1.2.1 works on their device.
