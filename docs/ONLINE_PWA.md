# Internet multiplayer PWA — 1.2.0

The installed PWA stays at https://stefanavesand.github.io/OpenCatan/hello/ .
The separate managed backend project is https://lovable.dev/projects/cdbab9d4-9c51-4ab0-89d9-feb24af9b7ce . Its first build cost 5.8 Lovable credits. This integration was written locally, without sending further Lovable build requests.

UI labels below use the English wording introduced in 1.2.2. Original 1.2.0 labels were Swedish.

## Try it on two devices

1. Open the installed app with internet, accept **Install update**, check version 1.2.0.
2. Choose **Play online**, then **Create room**. Copy the invitation link.
3. Open that link on a second device/browser and choose **Join room**. The creator is X and the joiner O. No login form.
4. Take turns; the other device sees updates within about five seconds.
5. Disconnect one device, then reconnect/reopen. The same browser identity recovers the saved room. Try devices on separate networks as well.
6. Local **Play tic-tac-toe** remains available without internet, with its existing separate IndexedDB save.

Opening a link in Safari and opening an installed iPad web app may use different browser storage. Return via the same browser/app that joined the room. Clearing site data loses the anonymous identity and access to its rooms. There is no account linking or identity export yet.

## Boundaries

- `pwa/hello/online-transport.js`: managed HTTP transport, public backend URL/key, anonymous auth, refresh token persistence, versioned v1 RPCs, durable pending intent. Capability descriptor reports internet required, remote authority, foreground polling and its interval.
- `online.js`: session UI, invitations, room replacement confirmation, revision ordering, reconnect and pause behavior. A successful committed server response is required before displaying a move. The local rule engine/store are unchanged.
- No CDN runtime dependencies. All online UI/transport files are part of the verified offline package. Backend responses/tokens are not service-worker cached. Offline readiness covers the app and local games; online games explicitly require internet.
- Poll every five seconds only while this view is visible and the game waits/is in progress. Stop when hidden, offline, outside the online view, or finished. Resume with a fresh server read; no reliance on iOS background execution.
- Store each command ID and full request before sending; retain on uncertain HTTP failures. On reload/reconnect retry the identical intent before reading current state. Auth errors never automatically replace an existing identity. Writes fail closed if browser storage is unavailable. Access tokens are refreshed before expiry, with refresh failures preserving the identity.
- Web Locks serialize auth refresh and outgoing commands across same-origin tabs where supported. Only one outstanding intent per browser identity is supported; separate devices/browsers get separate anonymous identities.
- The backend provides persistent atomic state/receipts through PostgreSQL RPCs and member-only RLS reads. Browser-held publishable key is intentionally public; no service-role key is used. CORS on the managed gateway allows arbitrary origins; auth/RLS enforce access.

## Known limits

Prototype only: no room cleanup, account linking, rematch, explicit leave, rate-limit budget or abuse controls. Managed-service usage can incur cost; five-second polling consumes requests. Rules currently exist both in backend SQL and pure TypeScript, so this is not the final architecture for OpenCatan. RPC dedup keys are per player, without payload binding: clients must always generate a fresh UUID per intent. Retrying a different payload with the same ID returns the original receipt. Failed refresh tokens require future identity-recovery UX; no silent identity replacement.

## Verification

- 41 unit tests passed.
- 12 deterministic PWA browser tests passed, including pre-existing cache/update/offline/IndexedDB tests and two new online scenarios. Online scenarios use a simulated backend for lost reply, reload/retry with identical command ID, third-player rejection, two identities, network pause/recovery and failed auth refresh preserving identity.
- Live browser test passed against the actual managed backend: two independent anonymous players, room invitation, alternating moves through a complete X win, automatic polling, offline reload/reconnect with unchanged identity and both devices reaching the same finished state (23.8 seconds). Browser contexts simulate two devices; real iPad and different physical networks remain to test.
- Live test: `PWA_LIVE=1 ... npm run pwa:test -- online-live.spec.ts`. Opt-in creates two real anonymous users and a room. Uses the session's configured HTTP proxy where present; the environment CA must be trusted by Chromium. No TLS verification bypass.
- Real iPad 1.1.0 local-game/offline recovery was confirmed by the user. The user also confirmed 1.2.0 online play on their devices after publication; exact physical network and suspend/reopen scenarios were not specified.
