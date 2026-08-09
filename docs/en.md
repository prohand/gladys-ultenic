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
**link your Ultenic app account** to it, and you give Gladys the project's
Access ID and Access Secret. Gladys then reads and drives your vacuums through
that project. Your Ultenic app keeps working exactly as before.

> Everything below is free. Tuya's trial period for a Cloud project has to be
> extended manually every few months (a one-click button in the console) — see
> the troubleshooting section.

## Step 1 — Pair the vacuum in the app

Pair your vacuum in the **Ultenic** app (or in **Smart Life**, which works with
the same devices), on a **2.4 GHz** Wi-Fi network. Check that you can start and
stop it from the app before going any further: if the app cannot drive it,
neither can Gladys.

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

## Step 3 — Link your Ultenic account to the project

1. In the project, open the **Devices** tab, then **Link App Account**.
2. Click **Add App Account**: a QR code appears.
3. In the **Ultenic** app (or Smart Life), open the profile tab, use the scan
   icon at the top right and scan the QR code, then confirm.
4. Your devices appear in the **All Devices** list of the project. If your
   vacuum is not there, the data center of the project does not match the one
   of your account — recreate the project in the right one.

While you are on this screen, note the **UID** shown next to the linked
account: it is optional, but useful if you linked several accounts and only
want one of them in Gladys.

## Step 4 — Configure the integration in Gladys

Install the Ultenic integration, open its **Configuration** screen, and fill in:

| Field                | What to put there                                       |
| -------------------- | ------------------------------------------------------- |
| **Tuya data center** | The one you picked in step 2                            |
| **Access ID**        | From the project Overview page                          |
| **Access Secret**    | From the project Overview page                          |
| **Tuya user UID**    | Optional — leave empty to take every linked account     |
| **Refresh interval** | How often the vacuums are read (30 s is a good default) |

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
project, or the vacuum is paired in an app account other than the linked one.

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
