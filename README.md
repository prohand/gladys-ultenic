# Ultenic — external integration for Gladys Assistant

Monitor and control **Ultenic robot vacuums** from
[Gladys Assistant](https://gladysassistant.com), through the Tuya IoT cloud.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

## What it does

Each Ultenic vacuum found on your account becomes a Gladys device of the
`vacuum-cleaner` category:

| Feature               | Direction | Backed by                                                       |
| --------------------- | --------- | --------------------------------------------------------------- |
| Operational state     | read      | Tuya `status` + `fault`, mapped onto the 7 Gladys vacuum states |
| Run mode              | command   | `power_go` / `switch_go` / `mode`, whichever the model exposes  |
| Clean mode            | command   | the `suction` enum, mapped onto the Gladys clean modes          |
| Return to dock        | command   | `switch_charge`, or `mode: chargego` as a fallback              |
| Battery               | read      | `electricity_left` or `battery_percentage`                      |
| Cleaned area          | read      | `clean_area`                                                    |
| Cleaning time         | read      | `clean_time`                                                    |
| Filter life remaining | read      | `filter`                                                        |

The sensors are only published when the vacuum actually reports them, so a D5s
and a T10 do not necessarily expose the same feature list. A `cloud` transport
badge is published per device, flipping to `unreachable` when Tuya reports the
vacuum offline.

Three buttons are available in the Configuration screen: **Test the
connection**, **Refresh the vacuum list** and **Locate a vacuum** (makes the
chosen device beep, using the dynamic device select of the SDK).

## Why the Tuya cloud

Ultenic robot vacuums run on the Tuya platform — the Ultenic app is a branded
Tuya app — and there is no documented local protocol for them. The integration
therefore talks to the Tuya IoT cloud with the credentials of a free Cloud
project the user links their Ultenic app account to. The manifest declares
`"transports": ["cloud"]` accordingly: no "prefer local" toggle is offered for
a channel that does not exist.

Setup guide (with the Tuya console screens, step by step):
[`docs/en.md`](./docs/en.md) — [`docs/fr.md`](./docs/fr.md). Gladys re-hosts
them behind the **Documentation** link of the Configuration screen.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + event wiring (no vacuum logic)
├─ src/
│  ├─ config.js                      # config defaults, normalization, bounds
│  ├─ ultenic/                       # ← everything protocol-related
│  │  ├─ dataCenters.js              #   region -> Tuya API endpoint
│  │  ├─ signature.js                #   HMAC-SHA256 request signature (pure)
│  │  ├─ client.js                   #   token lifecycle + the 4 endpoints used
│  │  └─ vacuumMapping.js            #   Tuya data points <-> Gladys values (pure)
│  └─ devices/
│     ├─ index.js                    #   registry: catalog + refresh loop
│     └─ vacuum.js                   #   one vacuum: features, states, commands
├─ docs/{en,fr}.md                   # user documentation, re-hosted by Gladys
├─ gladys-assistant-integration.json # manifest (name, config schema, actions…)
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
└─ test/                             # node --test, no test framework to install
```

Two design decisions worth knowing before editing:

- **The catalog is dynamic.** There is no fixed device list: `src/devices/index.js`
  builds one blueprint per vacuum returned by the cloud, and re-reads the Tuya
  _specification_ of each model to know which data points it supports. Every
  command is an ordered list of candidates (`power_go`, then `switch_go`, then
  `mode: smart`…) and the first one the model declares wins — that is what makes
  the integration work across Ultenic generations instead of one model.
- **The refresh loop is ours, not Gladys'.** The devices are published without
  `poll_frequency`: the Tuya listing endpoint returns every device _with its
  data points_, so one call refreshes the whole fleet. The registry runs that
  call on its own timer and publishes only the states that changed. `onPoll` is
  still wired, for the case where a user sets a poll frequency on a device.

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="ultenic" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container. The SDK reads them
automatically.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # Unit tests, via the built-in `node --test` runner
```

The same three gates run on every push and pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

The tests cover the two places where a mistake is expensive and invisible: the
**request signature** (a wrong byte returns an opaque "sign invalid") and the
**data point mapping** (a wrong mapping quietly drives the vacuum somewhere
else). The Tuya client is tested against a `fetch` stub, so the suite needs no
credentials and no network.

## Validate before publishing

```bash
npx github:GladysAssistant/integration-store .
```

Runs the exact checks of the store indexer — manifest, Docker image, cover
image, code rules — and reports every problem at once.

## Release

Open **Actions → Release → Run workflow** and pick `patch`, `minor` or `major`.
The workflow bumps the version in `package.json` and in the manifest (including
the `docker_image` tag), pushes the `vX.Y.Z` tag and builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io`.

## Notes

- Requires **Node.js ≥ 20** (built-in global `fetch`, no HTTP dependency).
- The Tuya Access Secret is declared as a `secret` config field: it is stored
  encrypted by Gladys and never sent back to the browser.
- A Tuya Cloud project runs on a trial subscription that has to be extended
  from the Tuya console every few months. It is free, but it does expire — the
  documentation says so, and the Configuration screen reports the resulting
  error instead of going quiet.
- `cover.png` is a generated placeholder (800×534). Replace it with a real
  visual before publishing to the store.

## License

Apache-2.0
