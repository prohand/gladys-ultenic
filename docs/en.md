# Ultenic robot vacuums in Gladys

This integration brings your **Ultenic** robot vacuums into Gladys: you see
their state, their battery and their cleaning statistics, and you can start a
run, stop it, change the suction level or send them back to their dock — from
the dashboard, from a scene or from the chat.

## How it works, and why you need a Tuya account

Ultenic robot vacuums are built on the **Tuya** platform: the Ultenic app is a
branded Tuya app, and the vacuums talk to the Tuya cloud, not to your LAN. There
is no documented local protocol, so this integration goes through the **Tuya IoT
cloud** — the same route Home Assistant and the other open-source integrations
take for Tuya-based hardware.

Concretely: you create a free **Cloud project** on the Tuya IoT Platform, you
authorize it over the app account that owns the vacuum, and you give Gladys the
project's Access ID and Access Secret. Gladys then reads and drives your vacuums
through that project.

That authorization step is the one that breaks with Ultenic — read the next
section before you start, it decides the rest of the procedure.

> Everything below is free. Tuya's trial period for a Cloud project has to be
> extended manually every few months (a one-click button in the console) — see
> the troubleshooting section.

## ⚠️ Read this first: the Ultenic app cannot scan the Tuya QR code

The official Tuya procedure asks you to scan a QR code from the app to link
your account to the Cloud project. **That scanner does not exist in the Ultenic
app.** The one you find under group / home management is a different scanner:
it only reads invitations to join a home. Show it the QR code from the Tuya
console and it simply does not recognise it — the window closes and you are
back on the previous screen, with no error message.

This is not something you did wrong: Tuya only makes that QR code readable by
the **Tuya Smart** and **Smart Life** apps, plus a handful of explicitly
allowlisted branded apps. Ultenic is not one of them.

Two ways forward, in order of preference:

| Path                                    | What it costs                                                    |
| --------------------------------------- | ---------------------------------------------------------------- |
| **A. Move the vacuum to Smart Life** ✅ | Reset and re-pair the vacuum; it leaves the Ultenic app          |
| **B. "App account" mode**               | No QR code, but in practice only works with a Smart Life account |

Path A is the one that reliably works. Path B is described below: it avoids the
QR code, but it does not get around the fact that Tuya does not authorize a
third-party project over a branded app's schema.

## Step 1 — Pair the vacuum in Smart Life

Install **Smart Life** (Tuya's free app, on iOS and Android) and pair your
vacuum there, on a **2.4 GHz** Wi-Fi network.

A Tuya device belongs to one account at a time: to move it from Ultenic to
Smart Life you have to **remove it from the Ultenic app** (or press its reset
button, usually 5 to 10 seconds), then pair it in Smart Life as a new device.

What you lose: the features specific to the Ultenic app (map, no-go zones on
some models). What you keep: cleaning, scheduling, suction power and return to
dock — that is, everything this integration drives.

> Device sharing is not a substitute: the Cloud project only sees the devices
> **owned** by the linked account, not the ones shared with it.

Check that you can start and stop the vacuum from Smart Life before going any
further: if the app cannot drive it, neither can Gladys.

## Step 2 — Create a Tuya Cloud project

1. Create an account on the [Tuya IoT Platform](https://iot.tuya.com/) (this is
   the developer console, a different account from the app one).
2. Go to **Cloud → Development → Create Cloud Project**.
3. Give it any name. For **Industry** pick _Smart Home_, for **Development
   Method** pick _Smart Home_.
4. For **Data Center**, pick the one your Ultenic account lives in — this is
   the field people get wrong most often:
   - Europe → _Central Europe_
   - United Kingdom → _Western Europe_
   - United States → _Western America_ (or _Eastern America_)
   - India → _India_
   - China → _China_
5. On the next screen, make sure the **IoT Core** and **Authorization** API
   services are enabled for the project (they are, by default).

On the project **Overview** page you now have an **Access ID / Client ID** and
an **Access Secret / Client Secret**. Keep them at hand.

## Step 3 — Link your Smart Life account to the project

1. In the project, open the **Devices** tab, then **Link App Account**.
2. Click **Add App Account**: a QR code appears.
3. In **Smart Life**, open the **Me** (profile) tab and use the scan icon at the
   **top right** — not the one in home management. Scan the QR code, then
   confirm.
4. Your devices appear in the **All Devices** list of the project. If your
   vacuum is not there, the data center of the project does not match the one
   of your account — recreate the project in the right one.

While you are on this screen, note the **UID** shown next to the linked
account: it is optional, but useful if you linked several accounts and only
want one of them in Gladys.

### If the QR code will not work: the "app account" mode

The QR code expires fast, and some accounts simply refuse it. In that case the
integration can authenticate **directly as the app user**, with no QR code at
all: set the **Authorization mode** field to _App account_ and fill in the
e-mail, password, country code and app schema.

The **schema** is the Tuya code of the app the account belongs to: `smartlife`
for Smart Life, `tuyaSmart` for Tuya Smart.

An honest note about this mode: it is not a back door for keeping the vacuum in
the Ultenic app. A branded app has its own schema, and Tuya does not normally
let a third-party Cloud project authenticate against it — the attempt comes
back as "user not exist" or "permission deny". The field is free text, so
nothing stops you from trying before you move the vacuum: the **Test the
connection** button answers in a few seconds.

## Step 4 — Configure the integration in Gladys

Install the Ultenic integration, open its **Configuration** screen, and fill in:

| Field                  | What to put there                                       |
| ---------------------- | ------------------------------------------------------- |
| **Tuya data center**   | The one you picked in step 2                            |
| **Access ID**          | From the project Overview page                          |
| **Access Secret**      | From the project Overview page                          |
| **Authorization mode** | _Linked account_ if the QR worked, else _App account_   |
| **Tuya user UID**      | Optional — leave empty to take every linked account     |
| **Refresh interval**   | How often the vacuums are read (30 s is a good default) |

In _App account_ mode, four extra fields are used: **App schema**
(`smartlife`), **App account e-mail**, **App account password** and **Country
code** (`33` for France). They are ignored in _Linked account_ mode.

Save, then click **Test the connection**. It should answer with the number of
vacuums found and their names.

## Step 5 — Create the devices

Open the **Discovery** tab of the integration: your vacuums are listed there.
Click **Create** on each one you want in Gladys, give it a room, and you are
done.

## What you get

Each vacuum becomes a Gladys device with:

- **Operational state** (read only) — stopped, running, paused, error,
  returning to dock, charging, docked.
- **Run mode** — set it to _Clean_ to start a run, to _Idle_ to stop it.
- **Clean mode** — the suction level, mapped onto the Gladys clean modes
  (_Mop_ = suction off, _Quiet_ = gentle, _Auto_ = normal, _Deep clean_ =
  strong/max). Only the levels your model supports are accepted.
- **Return to dock** — sends the vacuum home.
- **Battery**, in percent.
- **Cleaned area**, **Cleaning time** and **Filter life remaining**, when the
  model reports them.

The sensors are added only if your vacuum actually publishes them, so two
different Ultenic models will not necessarily expose the same feature list.

A **cloud** badge is shown on the device: it turns **unreachable** when the Tuya
cloud reports the vacuum as offline (unplugged dock, Wi-Fi down).

## Troubleshooting

**"Tuya refused the credentials (sign invalid)"** — the Access ID or the Access
Secret is wrong, or a space was pasted along with it. Copy them again from the
project Overview page.

**"No robot vacuum was found"** — three usual causes: the data center of the
project does not match your account, the app account is not linked to the
project, or the vacuum is paired in an app account other than the linked one
(typically: it is still in the Ultenic app while a Smart Life account was
linked).

**Scanning the QR code closes the window and does nothing** — you are using the
group-management scanner of the Ultenic app, which only reads home invitations.
That QR code is readable by Tuya Smart and Smart Life only: see the box at the
top of this page.

**"user not exist" / "permission deny" in app account mode** — the app schema
does not match the account, or Tuya does not authorize your Cloud project over
that schema (the case of a branded app such as Ultenic). Use a Smart Life
account with the `smartlife` schema.

**"permission deny" / code 1106** — the project's API services do not include
IoT Core, or the linked account has expired. Re-link the app account.

**It worked and stopped after a few months** — a Tuya Cloud project runs on a
trial subscription that expires. Open **Cloud → Development → your project →
Service API**, and extend the trial (it is free, and takes one click).

**The state lags behind the app** — the integration polls the Tuya cloud at the
interval you configured. Lower it if you want a faster feedback; one single API
call refreshes every vacuum, so a short interval stays cheap.

**Mapping mode does nothing** — Gladys' run mode offers a _Map_ value, but the
Tuya cloud API exposes no standard "map without cleaning" command. The
integration refuses it explicitly instead of silently doing something else.
