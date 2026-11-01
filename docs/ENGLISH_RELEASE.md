# English application and repository — PWA 1.2.2

The application display name is **Game Shelf**. Maintained UI, accessibility labels, validation/errors, tests, documentation and new repository contributions use English. `AGENTS.md` records this rule; Swedish is allowed only in the user conversation.

## Compatibility

- Keep the existing URL, manifest ID/start URL/scope and service-worker scope. Update the existing installation normally; no reinstall is required.
- Keep IndexedDB database `spelhyllan`, localStorage keys `spelhyllan-online-auth-v1` / `spelhyllan-online-state-v1`, and the existing Web Lock names. These persisted/internal identifiers retain their original spelling to preserve games, identities, pending commands and coordination with older tabs.
- New local navigation uses `#tic-tac-toe`; the previously shared `#tre-i-rad` bookmark remains a supported compatibility alias. New backup downloads use `tic-tac-toe.json`; imports accept previous files regardless of filename.
- App and manifest language are `en`. iPadOS may retain an existing Home Screen icon label; this does not affect the installed app or its data.
- PRD 3.1 and HLD 1.1 translate the previous baseline and preserve requirement/decision IDs and diagrams. The original English PRD remains archived unchanged. Historical release notes show current English UI labels with an explanatory note.

## Verification

53 unit tests and 17 deterministic PWA browser tests passed. Existing offline/cache/update/storage/retry tests now assert English labels. A new compatibility scenario seeds the previous local save and online identity keys, follows the old bookmark, verifies English HTML/manifest metadata, recovers the saved moves, and creates a room without a new anonymous signup.

The separate real-backend two-player browser test also passed (28.4 seconds), covering a complete game and offline reload/reconnection with the same identity. No backend schema/protocol changes or Lovable build requests are required for this language release. The user confirmed 1.2.1 works before this change; actual-device verification of 1.2.2 remains pending.
