# Spelhyllan 1.1.0: local game and recovery

The existing installed PWA now opens a small game library. Tre i rad (three-in-a-row / tic-tac-toe) is a local pass-and-play game for two players on the same device. The Hello world view remains available under `#hello`. No game assets or runtime code from OpenCatan are included in this static build.

URL, service-worker scope, manifest id and start URL remain unchanged:

https://stefanavesand.github.io/OpenCatan/hello/

The manifest and app title now say **Spelhyllan**. iPadOS may retain the original home-screen label **Hello iPad**; use the existing icon and update the app normally. There is no need to discard the existing installation.

## Device check

1. Turn Wi-Fi on, close the installed app completely and open it again.
2. Accept **Installera uppdatering** when offered. Verify **v1.1.0** and **Klart för offline**. If the new version is already displayed, activation has completed.
3. Open **Spela tre i rad**, make a few moves and wait for **Sparat på denna enhet**.
4. Turn on airplane mode and turn Wi-Fi off. Close the app completely and reopen its icon.
5. Open **Fortsätt partiet** if the library is shown. The same X/O positions should remain. Continue to a win or draw.
6. Optionally use **Sparning och kopior → Spara en kopia**, start another game and restore the copy using **Läs in en kopia**. Restoring or resetting a running game requires explicit confirmation.

This new device check is not yet confirmed on the user's iPad. Installation, cold offline startup and updating the earlier Hello versions have already been confirmed on that device.

## Architecture

- `pwa/hello/game.js`: pure rules; callers supply identity and timestamps. The version-1 record stores legal moves and derives the board, turn, winner and draw by replay. Unknown schemas, duplicate cells, invalid revisions and moves after a win are rejected.
- `pwa/hello/storage.js`: IndexedDB adapter, database `spelhyllan`, version 1, store `sessions`, key `current`. Comparison of expected identity/revision and the write occur in one transaction. Same-identity writes must append exactly one move. A reset or restored copy gets a new identity.
- `pwa/hello/library.js`: UI, navigation, persistence-status handling and backup/restore. A completed move appears only after transaction completion. Another writer's stale state is rejected and refreshed; a failed write leaves the displayed game at its last committed revision.
- `app.js`: the PWA shell. Explicit update activation waits for an in-flight game write to settle before reloading. All ten app assets, including rules and storage modules, are included in the verified offline package.

The app checks persistence support and offers a user-initiated `navigator.storage.persist()` request. A denied or unsupported request is explained and does not stop ordinary IndexedDB saving. Even granted persistence is not an absolute guarantee against user deletion or platform storage loss; JSON copies provide an additional recovery route.

An unrecognized stored schema is never overwritten automatically. Update activation does not clear IndexedDB, and the schema remains unchanged across this release.

## Verification

```sh
npm run test:run
npm run pwa:test
```

- 41 unit tests pass, including 12 new tests for win lines, O wins, draws, immutable rejection, record validation and identity/revision comparison.
- 10 PWA browser scenarios pass: the four existing cache/install/update checks and six new game/storage scenarios.
- The new scenarios cover copy/export/restore, confirmation before reset, corrupt import rejection, offline full-browser restarts for ongoing and finished games, failed writes, denied persistence, concurrent writers, unknown schemas, and a saved game surviving an app update followed by continued offline play.
- Scoped ESLint and JavaScript syntax checks pass. Chromium tests do not substitute for the actual iPad check above.

This release stores one game on one device. Cross-device play, Bluetooth, accounts, cloud saves, game history and automatic schema migrations are not implemented. The existing OpenCatan branches remain separate development work.
