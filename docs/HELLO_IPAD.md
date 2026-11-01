# Hello iPad: installation and offline proof

A standalone, static PWA, separate from OpenCatan and its assets. It uses original generated PNG icons and system fonts. There is no PartyKit dependency, account, database or background-execution requirement.

Expected production URL once GitHub Pages is enabled:

https://stefanavesand.github.io/OpenCatan/hello/

## On the real iPad

1. Open the URL in Safari while connected to the internet.
2. Wait for **Klart för offline**. This appears after the active service worker has checked the contents of all seven required app files against SHA-256 hashes.
3. Tap **Share → Add to Home Screen → Add**. Leave **Open as Web App** enabled if that option appears.
4. Launch **Hello iPad** from the new home-screen icon. **Startläge** should say **Installerad webbapp**.
5. Turn on airplane mode and explicitly turn Wi-Fi off. Close the app completely from the app switcher, then open the home-screen icon again.
6. **Hello world**, the version and **Klart för offline** should still appear. **Nätkontakt** should report no connection.

The network label uses the browser's connection signal, not an internet reachability probe. Offline readiness is established independently by cache integrity checks. This proof has no data to save. Safari can still remove website storage; readiness is rechecked at startup and the control button can repair missing files when online.

Installation and cold startup on actual iPadOS require the user's device check. Chromium browser tests do not certify that manual step.

## Local build and browser tests

```sh
npm ci
npx playwright install chromium
npm run pwa:test
```

The test server reproduces GitHub Pages' `/OpenCatan/hello/` path on localhost:4175. Tests use an 820×1180 viewport. They verify:

- Manifest scope/start URL, standalone display and actual PNG icon dimensions.
- Offline reload and a full Chromium shutdown/restart with persistent service-worker storage.
- A corrupted first download cannot activate a worker or show offline readiness.
- A corrupt update leaves the previous version working offline; a good update waits for the user to press **Installera uppdatering**.
- A removed cache file clears readiness and can be repaired when the network returns.

For manual local testing, run `npm run pwa:dev` and open http://127.0.0.1:4175/OpenCatan/hello/ . Localhost is a permitted service-worker origin, but an iPad cannot install from another machine's plain HTTP LAN address; use the production HTTPS URL.

In this execution environment the browser command is:

```sh
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost PLAYWRIGHT_BROWSERS_PATH=/tmp/opencatan-browsers npm run pwa:test
```

## Publish and update

`npm run pwa:publish` builds the static files and pushes only `pwa-dist` contents to the fork's `gh-pages` branch. It does not publish game assets, change master or configure Pages. Authentication uses the existing `gh` credential provider. No credential is written into the output.

The repository's Pages settings must use **Deploy from a branch**, branch **gh-pages**, folder **/(root)**. The source implementation lives on `codex/pwa-hello`; the publishing branch contains only static output and no build dependencies.

For the next device update test, increment `pwa/version.json` to `1.0.1`, run the checks and publish. Reopen the installed app online; it should offer **Installera uppdatering**. After accepting, verify the version and repeat the offline cold-start check. Version 1.0.0 is the first device installation; version 1.0.1 has not been published as part of the initial setup.

## Update boundaries

Each build has a source-derived build ID and its own cache. Failed installs delete only the incomplete candidate cache. The worker never automatically calls skipWaiting for an update. The previous app stays available until the new package is complete and the user accepts activation. Worker scope and cache cleanup are limited to this Hello app. All assets are local; no CDN or external font is needed.

This is a small installation proof. Future games still need complete authoritative persistence, schema migration and a safe session boundary for updates before the same mechanism is used during ongoing matches.

Verification: four PWA browser scenarios passed locally; all 29 existing rule/session unit tests still passed. The original game e2e suite was not rerun for this independent static app. The device-installation result remains to be supplied from the iPad.
