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
project, authorized over the app account that owns the vacuum. The manifest
declares `"transports": ["cloud"]` accordingly: no "prefer local" toggle is
offered for a channel that does not exist.

### Two authorization modes, because the QR code is not universal

Tuya's documented way of authorizing a Cloud project over an app account is a
QR code scanned from the app. That scanner only exists in **Tuya Smart** and
**Smart Life** (plus allowlisted branded apps): the Ultenic app has none — the
scanner in its group-management screen only reads home invitations and silently
rejects the Tuya QR code. So the integration supports two modes:

| `auth_mode`        | Token endpoint                                                | When to use it                                    |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| `linked_account`   | `GET /v1.0/token?grant_type=1`                                | The QR code was scanned from Smart Life (default) |
| `user_credentials` | `POST /v1.0/iot-01/associated-users/actions/authorized-login` | No QR code: log in as the app user directly       |

In `user_credentials` mode the token belongs to one app account, so the devices
are listed through `/v1.0/users/{uid}/devices` with the UID the login returned,
instead of the project-wide `associated-users` listing. Everything downstream —
signing, refresh, commands — is identical.

The credentials mode is not a way to keep the vacuum in the Ultenic app: Tuya
does not normally authorize a third-party project over a branded app's schema.
It is the escape hatch for a QR code that keeps expiring or refuses to scan.

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
- The Tuya Access Secret and the app account password are declared as `secret`
  config fields: they are stored encrypted by Gladys and never sent back to the
  browser. The password is md5-hashed before it leaves the process — weak by
  modern standards, but it is the wire format Tuya defines for that endpoint.
- A Tuya Cloud project runs on a trial subscription that has to be extended
  from the Tuya console every few months. It is free, but it does expire — the
  documentation says so, and the Configuration screen reports the resulting
  error instead of going quiet.
- `cover.png` is a generated placeholder (800×534). Replace it with a real
  visual before publishing to the store.

## License

Apache-2.0
