# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 20+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that monitors and drives **Ultenic robot
vacuums** through the **Tuya IoT cloud** (the Ultenic app is a branded Tuya app; there is no
documented local protocol). Each vacuum becomes a `vacuum-cleaner` device: operational state,
run mode, clean mode (suction), return to dock, battery, cleaned area, cleaning time, filter life.
The user brings the Access ID / Access Secret of a free Tuya Cloud project.

Not released yet: no `v*` tag exists, `package.json` is still `1.0.0`.

## Commands

```bash
npm install
npm test                                     # node --test (built-in runner)
node --test test/signature.test.js           # one file
node --test --test-name-pattern "suction"    # one test by name
npm run lint                                 # eslint .
npm run format:check                         # prettier --check . (CI gate)
npm run format                               # prettier --write .
```

CI runs `format:check`, `lint`, `test`. Releases: **Actions → Release** only (bumps
`package.json`, manifest `version` + `docker_image`, tags, builds). The release rewrites the
manifest with `jq`: run `npm run format` afterwards or CI fails.

## Architecture

```
index.js                   SDK wiring: handlers, status messages, error explanations
src/config.js              defaults (region, credentials, auth mode, refresh interval) + clamps
src/ultenic/dataCenters.js Tuya data centers (eu, us, cn, in...) -> API hosts
src/ultenic/signature.js   Tuya HMAC-SHA256 request signing
src/ultenic/client.js      Tuya cloud client: token, list vacuums, specification, status, commands
src/ultenic/vacuumMapping.js  Tuya data points <-> Gladys vacuum states / modes / commands
src/devices/vacuum.js      one vacuum: discovery payload, states, onSetValue, locate
src/devices/index.js       DeviceRegistry: catalog, refresh loop, state dedupe, transports
```

### Invariants worth knowing

- **Two authorization modes** (`auth_mode`): `linked_account` (QR code of the Tuya console, only
  readable by Tuya Smart / Smart Life) and `user_credentials` (the project logs in as the app
  user). Tuya business codes (1004/1005, 1106/1114) are translated into actionable messages in
  `explainError()`.
- **No `poll_frequency` on devices.** The registry refreshes the whole fleet with ONE cloud call
  every `refresh_interval` seconds (default 30); Gladys polling each vacuum would multiply the
  calls. `onPoll` only answers a poll the user configured by hand.
- **Only what changed is published** (`lastPublishedStates`, `lastPublishedTransports`) — the host
  API rate limit is sized for changes. `publishCatalog()` clears both maps. States are sent in
  batches of at most 100.
- **Features follow the model.** The Tuya specification is read once per vacuum
  (`parseCapabilities`), so a D5s and a T10 can expose different features. A sensor is only
  published when the vacuum reports it.
- **Commands are followed by a re-read** 4 s later (`scheduleRefreshAfterCommand`) so the UI shows
  what the vacuum really did.
- **Transport badge**: `cloud`, flipping to `unreachable` when Tuya reports the vacuum offline.
- **Credentials are secrets**: never log the Access Secret, the app password or the tokens. A
  credential change rebuilds the client and clears the caches (`setConfig`).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- The `locate` action field uses `source: "devices"`: the core only validates that field type
  from Gladys 5.1.0, hence `gladys_version >=5.1.0` (pinned by `test/manifest.test.js`).
- **A vacuum added in Gladys is republished from memory** (`onDeviceCreated` /
  `onDeviceUpdated` → `registry.republishDevice()`): Gladys drops the states sent before the
  device exists, while the dedupe maps recorded them as published.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with `DEFAULT_CONFIG`,
the bounds and the action handlers (`test_connection`, `refresh_devices`, `locate`).

## Testing

No network: `test/helpers/tuyaFixtures.js` holds realistic Tuya payloads, `fetch` is stubbed and
`test/helpers/fakeGladys.js` stands in for the SDK.

## Conventions

Prettier formats, ESLint catches mistakes. Comments explain **why**; exported functions carry
JSDoc. User-facing messages are bilingual `{ en, fr }`; user docs in `docs/en.md` and
`docs/fr.md`, kept in sync. The container rootfs is read-only: write nothing.
