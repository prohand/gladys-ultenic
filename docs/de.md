# Ultenic-Saugroboter in Gladys

Diese Integration bringt deine **Ultenic**-Saugroboter in Gladys: Du siehst ihren
Zustand, ihre Batterie und ihre Reinigungsstatistiken, und du kannst eine
Reinigung starten, sie stoppen, die Saugstufe ändern oder sie zurück zur
Ladestation schicken — vom Dashboard, aus einer Szene oder aus dem Chat.

## Wie es funktioniert und warum du ein Tuya-Konto brauchst

Ultenic-Saugroboter basieren auf der **Tuya**-Plattform: Die Ultenic-App ist
eine Tuya-App unter eigener Marke, und die Saugroboter sprechen mit der
Tuya-Cloud, nicht mit deinem lokalen Netzwerk. Es gibt kein dokumentiertes lokales
Protokoll, daher geht diese Integration über die **Tuya-IoT-Cloud** — denselben
Weg, den Home Assistant und die anderen Open-Source-Integrationen für
Tuya-basierte Hardware nehmen.

Konkret: Du erstellst ein kostenloses **Cloud-Projekt** auf der Tuya IoT
Platform, autorisierst es über das App-Konto, dem der Saugroboter gehört, und
gibst Gladys die Access ID und das Access Secret des Projekts. Gladys liest und
steuert deine Saugroboter dann über dieses Projekt.

Genau dieser Autorisierungsschritt scheitert bei Ultenic — lies den
nächsten Abschnitt, bevor du beginnst, er bestimmt den Rest des Vorgehens.

> Alles Folgende ist kostenlos. Die Testphase eines Tuya-Cloud-Projekts muss
> alle paar Monate von Hand verlängert werden (ein Klick in der Konsole) — siehe
> den Abschnitt zur Fehlerbehebung.

## ⚠️ Zuerst lesen: Die Ultenic-App kann den Tuya-QR-Code nicht scannen

Das offizielle Tuya-Verfahren verlangt, dass du einen QR-Code mit der App
scannst, um dein Konto mit dem Cloud-Projekt zu verknüpfen. **Diesen Scanner gibt
es in der Ultenic-App nicht.** Der Scanner, den du in der Gruppen- bzw.
Zuhause-Verwaltung findest, ist ein anderer: Er liest nur Einladungen in ein
Zuhause. Zeigst du ihm den QR-Code aus der Tuya-Konsole, erkennt er ihn einfach
nicht — das Fenster schließt sich und du bist wieder auf dem vorherigen
Bildschirm, ohne Fehlermeldung.

Du hast nichts falsch gemacht: Tuya macht diesen QR-Code nur für die Apps
**Tuya Smart** und **Smart Life** lesbar, plus eine Handvoll ausdrücklich
freigegebener Marken-Apps. Ultenic gehört nicht dazu.

Zwei Wege, in der Reihenfolge der Empfehlung:

| Weg                                                | Was es kostet                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A. Den Saugroboter nach Smart Life umziehen** ✅ | Saugroboter zurücksetzen und neu koppeln; er verlässt die Ultenic-App        |
| **B. Modus „App-Konto“**                           | Kein QR-Code, funktioniert in der Praxis aber nur mit einem Smart-Life-Konto |

Weg A ist der, der zuverlässig funktioniert. Weg B wird unten beschrieben: Er
umgeht den QR-Code, ändert aber nichts daran, dass Tuya ein Drittprojekt nicht
über das Schema einer Marken-App autorisiert.

## Schritt 1 — Den Saugroboter in Smart Life koppeln

Installiere **Smart Life** (die kostenlose App von Tuya, für iOS und
Android) und kopple deinen Saugroboter dort, in einem **2,4-GHz**-WLAN.

Ein Tuya-Gerät gehört immer nur zu einem Konto: Um es von Ultenic nach Smart Life
umzuziehen, musst du es **aus der Ultenic-App entfernen** (oder seine
Reset-Taste drücken, meist 5 bis 10 Sekunden) und es dann in Smart Life als neues
Gerät koppeln.

Was du verlierst: die Funktionen, die nur die Ultenic-App bietet (Karte,
Sperrzonen bei einigen Modellen). Was du behältst: Reinigung, Zeitpläne,
Saugleistung und Rückkehr zur Ladestation — also alles, was diese Integration
steuert.

> Geräte teilen ist kein Ersatz: Das Cloud-Projekt sieht nur die Geräte, die dem
> verknüpften Konto **gehören**, nicht die, die mit ihm geteilt wurden.

Prüfe, dass du den Saugroboter aus Smart Life starten und stoppen kannst,
bevor du weitermachst: Wenn die App ihn nicht steuern kann, kann Gladys es auch
nicht.

## Schritt 2 — Ein Tuya-Cloud-Projekt erstellen

1. Erstelle ein Konto auf der [Tuya IoT Platform](https://iot.tuya.com/)
   (das ist die Entwicklerkonsole, ein anderes Konto als das der App).
2. Gehe zu **Cloud → Development → Create Cloud Project**.
3. Gib ihm einen beliebigen Namen. Wähle bei **Industry** _Smart
   Home_ und bei **Development Method** _Smart Home_.
4. Wähle bei **Data Center** das Rechenzentrum, in dem dein Ultenic-Konto
   liegt — das ist das Feld, bei dem am häufigsten Fehler passieren:
   - Europa → _Central Europe_
   - Vereinigtes Königreich → _Western Europe_
   - Vereinigte Staaten → _Western America_ (oder _Eastern America_)
   - Indien → _India_
   - China → _China_
5. Prüfe auf dem nächsten Bildschirm, dass die API-Dienste **IoT Core** und
   **Authorization** für das Projekt aktiviert sind (standardmäßig ist das so).

Auf der Seite **Overview** des Projekts hast du jetzt eine **Access ID /
Client ID** und ein **Access Secret / Client Secret**. Halte beide bereit.

## Schritt 3 — Dein Smart-Life-Konto mit dem Projekt verknüpfen

1. Öffne im Projekt den Tab **Devices** und dann **Link App Account**.
2. Klicke auf **Add App Account**: Ein QR-Code erscheint.
3. Öffne in **Smart Life** den Tab **Ich** (Profil) und verwende das
   Scan-Symbol **oben rechts** — nicht das aus der Zuhause-Verwaltung. Scanne
   den QR-Code und bestätige.
4. Deine Geräte erscheinen in der Liste **All Devices** des Projekts. Fehlt dein
   Saugroboter dort, stimmt das Rechenzentrum des Projekts nicht mit dem deines
   Kontos überein — erstelle das Projekt im richtigen Rechenzentrum neu.

Notiere dir auf diesem Bildschirm die **UID**, die neben dem verknüpften
Konto angezeigt wird: Sie ist optional, aber nützlich, wenn du mehrere Konten
verknüpft hast und nur eines davon in Gladys möchtest.

### Wenn der QR-Code nicht funktioniert: der Modus „App-Konto“

Der QR-Code läuft schnell ab, und manche Konten lehnen ihn einfach ab. In diesem
Fall kann sich die Integration **direkt als Benutzer der App** anmelden, ganz
ohne QR-Code: Stelle das Feld **Autorisierungsmodus** auf _App-Konto_ und
trage E-Mail-Adresse, Passwort, Ländervorwahl und App-Schema ein.

Das **Schema** ist der Tuya-Code der App, zu der das Konto gehört: `smartlife`
für Smart Life, `tuyaSmart` für Tuya Smart.

Ein ehrlicher Hinweis zu diesem Modus: Er ist keine Hintertür, um den
Saugroboter in der Ultenic-App zu behalten. Eine Marken-App hat ein eigenes
Schema, und Tuya lässt ein Cloud-Projekt eines Drittanbieters normalerweise nicht
damit authentifizieren — der Versuch endet mit „user not exist“ oder „permission
deny“. Das Feld ist ein Freitextfeld, nichts hindert dich also daran, es zu
versuchen, bevor du den Saugroboter umziehst: Die Schaltfläche **Verbindung
testen** antwortet in wenigen Sekunden.

## Schritt 4 — Die Integration in Gladys konfigurieren

Installiere die Ultenic-Integration, öffne ihren Tab
**Konfiguration** und fülle aus:

| Feld                         | Was hinein gehört                                                         |
| ---------------------------- | ------------------------------------------------------------------------- |
| **Tuya-Rechenzentrum**       | Das in Schritt 2 gewählte                                                 |
| **Access ID**                | Von der Seite Overview des Projekts                                       |
| **Access Secret**            | Von der Seite Overview des Projekts                                       |
| **Autorisierungsmodus**      | _Verknüpftes Konto_, wenn der QR-Code funktioniert hat, sonst _App-Konto_ |
| **Tuya-Benutzer-UID**        | Optional — leer lassen, um alle verknüpften Konten zu nehmen              |
| **Aktualisierungsintervall** | Wie oft die Saugroboter gelesen werden (30 s ist ein guter Wert)          |

Im Modus _App-Konto_ werden vier zusätzliche Felder verwendet: **App-Schema**
(`smartlife`), **E-Mail des App-Kontos**, **Passwort des App-Kontos** und
**Ländervorwahl** (`49` für Deutschland, `33` für Frankreich). Im Modus
_Verknüpftes Konto_ werden sie ignoriert.

Klicke auf **Konfiguration speichern** und dann auf **Verbindung testen**. Die Antwort sollte
die Anzahl der gefundenen Saugroboter und ihre Namen nennen.

## Schritt 5 — Die Geräte anlegen

Öffne den Tab **Entdecken** der Integration: Deine Saugroboter sind dort
aufgelistet. Klicke bei jedem, den du in Gladys haben möchtest, auf **Zu
Gladys hinzufügen**, weise ihm einen Raum zu, und fertig.

## Was du bekommst

Jeder Saugroboter wird ein Gladys-Gerät mit:

- **Betriebszustand** (nur lesen) — gestoppt, läuft, pausiert, Fehler, kehrt zur
  Ladestation zurück, lädt, angedockt.
- **Betriebsmodus** — auf _Reinigen_ stellen, um eine Reinigung zu starten, auf
  _Leerlauf_, um sie zu stoppen.
- **Reinigungsmodus** — die Saugstufe, abgebildet auf die Reinigungsmodi von
  Gladys (_Wischen_ = Saugen aus, _Leise_ = sanft, _Auto_ = normal,
  _Tiefenreinigung_ = stark/maximal). Nur die Stufen, die dein Modell unterstützt,
  werden angenommen.
- **Zurück zur Ladestation** — schickt den Saugroboter nach Hause.
- **Batterie**, in Prozent.
- **Gereinigte Fläche**, **Reinigungsdauer** und **Verbleibende Filterlebensdauer**,
  wenn das Modell sie meldet.

Die Sensoren werden nur hinzugefügt, wenn dein Saugroboter sie tatsächlich
veröffentlicht; zwei verschiedene Ultenic-Modelle bieten also nicht unbedingt
dieselbe Liste an Funktionen.

Am Gerät wird ein Badge **Cloud** angezeigt: Es wechselt zu **Nicht
erreichbar**, wenn die Tuya-Cloud den Saugroboter als offline meldet
(Ladestation ausgesteckt, WLAN ausgefallen).

## Fehlerbehebung

**„Tuya hat die Zugangsdaten abgelehnt (sign invalid)“** — die Access ID oder das
Access Secret ist falsch, oder es wurde ein Leerzeichen mit eingefügt. Kopiere
beide erneut von der Seite Overview des Projekts.

**„Kein Saugroboter gefunden“** — drei übliche Ursachen: Das Rechenzentrum des
Projekts stimmt nicht mit deinem Konto überein, das App-Konto ist nicht mit dem
Projekt verknüpft, oder der Saugroboter ist in einem anderen App-Konto gekoppelt
als dem verknüpften (typisch: Er ist noch in der Ultenic-App, während ein
Smart-Life-Konto verknüpft wurde).

**Das Scannen des QR-Codes schließt das Fenster und bewirkt nichts** — du
verwendest den Scanner der Gruppenverwaltung der Ultenic-App, der nur Einladungen
in ein Zuhause liest. Dieser QR-Code ist nur mit Tuya Smart und Smart Life
lesbar: siehe den Kasten oben auf dieser Seite.

**„user not exist“ / „permission deny“ im Modus App-Konto** — das App-Schema
passt nicht zum Konto, oder Tuya autorisiert dein Cloud-Projekt nicht über dieses
Schema (der Fall einer Marken-App wie Ultenic). Verwende ein
Smart-Life-Konto mit dem Schema `smartlife`.

**„permission deny“ / Code 1106** — die API-Dienste des Projekts enthalten IoT
Core nicht, oder das verknüpfte Konto ist abgelaufen. Verknüpfe das
App-Konto erneut.

**Es hat funktioniert und nach ein paar Monaten aufgehört** — ein
Tuya-Cloud-Projekt läuft mit einem Testabonnement, das abläuft. Öffne
**Cloud → Development → dein Projekt → Service API** und verlängere die
Testphase (das ist kostenlos und dauert einen Klick).

**Der Zustand hinkt der App hinterher** — die Integration fragt die Tuya-Cloud
im von dir konfigurierten Intervall ab. Verringere es, wenn du eine
schnellere Rückmeldung möchtest; ein einziger API-Aufruf aktualisiert alle
Saugroboter, ein kurzes Intervall bleibt also günstig.

**Der Modus Kartieren bewirkt nichts** — der Betriebsmodus von Gladys bietet den
Wert _Kartieren_, aber die API der Tuya-Cloud stellt keinen Standardbefehl
„kartieren ohne zu reinigen“ bereit. Die Integration lehnt ihn ausdrücklich ab,
statt stillschweigend etwas anderes zu tun.
