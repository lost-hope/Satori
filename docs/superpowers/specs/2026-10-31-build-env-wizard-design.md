# Build-Env-Wizard: geführte Erstellung von PlatformIO-Build-Envs per Discord-Command

## Intent & Warum

`/build` existiert bereits und kompiliert WLED-Firmware aus einem PlatformIO-`[env:...]`-Textblock,
den der Nutzer von Hand in ein Modal pastet. Das setzt voraus, dass der Nutzer die PlatformIO-Ini-
Syntax sowie die relevanten Board-Namen, Feature-Flags und UserMod-Namen von WLED kennt.

Aktuell nutzen WLED-Discord-Nutzer dafür https://wled-compile.github.io/, eine externe Website,
die den Nutzer per mehrstufigem Formular (Board/Chip → Feature-Optionen → UserMods → Review →
Build) durch die Konfiguration führt und daraus einen `[env:...]`-Block erzeugt. Ziel dieses
Projekts: dasselbe geführte Erlebnis direkt im Discord-Bot abbilden, ohne dass der Nutzer die
externe Seite besuchen oder PlatformIO-Ini-Syntax kennen muss. Der generierte Env-Block wird am
Ende über die bestehende Build-Pipeline (Queue, Docker-Sandbox, Sanitizer, Lib-Scanner) gebaut —
dieses Projekt fügt nur einen neuen, geführten Weg hinzu, einen gültigen Env-Block zu *erzeugen*.

## Geltungsbereich

- **Goal:** Neuer Slash-Command, der den Nutzer in mehreren Schritten durch Board-Auswahl,
  Feature-Flags und UserMod-Auswahl führt, am Ende eine Review-Ansicht zeigt und nach Bestätigung
  denselben Build-Queue-/Docker-Pfad wie `/build` anstößt.
- **Goal:** Abdeckung vergleichbar zu wled-compile.github.io's Schritten 1–4 (Board/Chip, Feature-
  Optionen, UserMods, Review) plus Build-Start — aus der bestehenden `/build`-Pipeline.
- **Non-goal:** 1:1-Nachbau aller wled-compile-Schritte. Schritt 1a/1b ("Advanced Compiler
  Settings", "Special Hacks/Tweaks") sowie Schritt 6 ("Direct USB Installation") werden **nicht**
  abgebildet — ersteres kollidiert mit dem Sanitizer-Allowlist-Modell (bewusst restriktiv, siehe
  `docker/builder/lib/iniSanitizer.js`), letzteres ist technisch unmöglich (Discord-Bot hat keinen
  Zugriff auf USB-Ports des Nutzers).
- **Non-goal:** Custom-Pinout-/Hardware-spezifische Envs (z. B. die `*_hub75`-Varianten mit eigenen
  Pin-Defines) werden nicht unterstützt. Der Wizard deckt die "normalen" vordefinierten Boards ab;
  wer einen hub75/Custom-Pinout-Build braucht, nutzt weiterhin `/build` mit Freitext-Ini.
- **Anti-goal:** Der Wizard darf den Sanitizer/Scanner (`iniSanitizer.js`, `libScanner.js`) nicht
  umgehen oder abschwächen. Er erzeugt am Ende ganz normalen Ini-Text, der denselben Sanitize-Pfad
  durchläuft wie heute bei `/build` — keine Sonderbehandlung, kein Vertrauensbonus, weil der Text
  "vom Wizard" statt vom Nutzer kommt.
- **Anti-goal:** `/build` selbst wird nicht verändert oder ersetzt. Der Wizard ist ein zusätzlicher,
  alternativer Einstiegspunkt, der am Ende in dieselbe `runOneBuild`/`buildQueue`-Logik mündet.

## Bekannte Constraints

- **Sanitizer-Allowlist** (`iniSanitizer.js`): erlaubt genau **eine** Section `[env:<name>]` sowie
  eine feste Liste von Keys (`board`, `extends`, `build_flags`, `build_unflags`, `custom_usermods`,
  `lib_deps`, …). Der vom Wizard erzeugte Text muss diese Regeln einhalten — keine Extra-Sections,
  keine anderen Keys.
- **`extends` trägt die ganze Arbeit:** Die vordefinierten Board-Envs in `platformio.ini` (z. B.
  `env:esp32dev`, `env:esp32s3dev_16MB_opi`) bringen bereits Board-, Platform-, Partition- und
  Standard-`lib_deps`-Konfiguration mit. Ein Wizard-Env muss diese nicht duplizieren, sondern kann
  per `extends = env:<board>` erben und nur `custom_usermods`/zusätzliche `build_flags` ergänzen.
  Das hält den generierten Block kurz und reduziert die Angriffsfläche (weniger Freitext nötig).
- **Discord-Component-Limits:** Ein Select-Menü erlaubt max. 25 Optionen; eine Nachricht erlaubt
  max. 5 Action-Rows, jede Action-Row entweder genau 1 Select-Menü oder bis zu 5 Buttons. Bei 75
  UserMods, ~34 Boards und 16 Feature-Flags muss jeder Schritt entsprechend in mehrere Menüs/
  Kategorien aufgeteilt werden (siehe UX-Flow unten).
- **State über mehrere Interaktionen:** Discord-Interaktionen sind zustandslos; der Bot muss den
  Fortschritt des Wizards pro Nutzer selbst halten (analog zum bestehenden `pendingBranchByUser`-
  Pattern in `buildRunner.js`), inkl. TTL/Cleanup.
- **Ground truth drifted von der Realität:** Die statischen Katalog-Daten (Boards/UserMods/
  Features) werden einmalig aus dem aktuellen `main`-Branch des offiziellen WLED-Repos abgeleitet
  und als Konfigurationsdatei im Bot-Repo gepflegt (siehe Entscheidung unten). Wählt der Nutzer
  einen anderen Branch oder Fork über die Branch-Auswahl, kann der Katalog in Einzelfällen nicht
  exakt zum tatsächlichen Stand dieses Branches passen (neue/entfernte Boards oder UserMods seit
  dem letzten Katalog-Update). Das ist ein bewusst akzeptierter Kompromiss (siehe Entscheidungen).

## Entscheidungen (mit Nutzer abgestimmt)

1. **Umfang:** Voller Wizard — Board + Feature-Flags + alle 75 UserMods (nicht nur eine kuratierte
   Teilmenge).
2. **Ausgabe:** Der letzte Schritt reiht den generierten Env-Block direkt in die bestehende
   Build-Queue ein (wie ein modal-submit bei `/build`), kein reiner "Text anzeigen"-Modus.
3. **Katalog-Quelle:** Statische, im Bot-Repo gepflegte Konfigurationsdatei (aus WLED-`main`
   abgeleitet), **kein** Live-Parsing des vom Nutzer gewählten Branches beim Wizard-Start. Grund:
   deutlich weniger Implementierungsaufwand (kein zusätzlicher Git-Clone/Parse-Schritt im
   interaktiven Pfad) und keine neue Fehlerklasse (kaputte/fremde Forks beim Parsen). Drift-Risiko
   bei Nicht-main-Branches wird in Kauf genommen.
4. **Board-Standard-UserMods:** Boards, die in der Basis-`platformio.ini` bereits
   `custom_usermods` setzen (z. B. `audioreactive` bei allen ESP8266-Boards), zeigen diese im
   UserMods-Schritt **transparent vorausgewählt** mit einem Hinweis ("vom Board vorgegeben"). Der
   Nutzer sieht sie und kann sie bewusst abwählen — kein verstecktes Verhalten.

## UX-Flow

Ein neuer Slash-Command (Arbeitsname `/buildenv`, finaler Name ist Bausache) startet eine Serie von
ephemeral Discord-Interaktionen, die dieselbe Nachricht per `interaction.update()` fortlaufend
ersetzen (klassisches Discord-Wizard-Pattern, kein Modal-Hopping):

1. **Branch:** **Kein eigener Wizard-Bildschirm** — Discords Autocomplete funktioniert nur auf
   Optionen des Slash-Commands selbst, nicht auf Select-Menüs/Buttons einer späteren Interaktion.
   Der Command bekommt daher dieselbe `branch`-Option + Autocomplete wie `/build`
   (`branchLookup.js`), die beim Aufruf des Commands aufgelöst wird, bevor die erste Wizard-
   Nachricht (Board-Auswahl) überhaupt angezeigt wird — exakt wie `handleChatInput` das heute für
   `/build` macht. `branch` ist also von Anfang an Teil des Session-Objekts, nicht Ergebnis eines
   Wizard-Schritts.
2. **Board/Chip:** Zweistufige Auswahl, da ~34 Boards > 25-Options-Limit:
   - Select-Menü 1: Chip-Familie/Kategorie (z. B. "ESP8266", "ESP32 (generic)", "ESP32-S2/S3",
     "ESP32-C3", "Matrix/HUB75-Boards" — letztere ggf. ganz weglassen, siehe Non-goal oben).
   - Select-Menü 2 (erscheint nach Auswahl 1): konkrete Boards dieser Kategorie (≤25 pro Kategorie).
3. **Feature-Flags:** Ein Multi-Select-Menü mit den 16 `WLED_DISABLE_*`-Flags aus dem WLED-Quellcode
   (z. B. "MQTT deaktivieren", "Alexa/EspAlexa deaktivieren", "Infrarot-Fernbedienung
   deaktivieren", …), menschlich beschriftet statt Rohflag. Mehrfachauswahl, alles standardmäßig
   nicht ausgewählt (= Standard-WLED-Verhalten).
4. **UserMods:** 3–4 Multi-Select-Menüs gleichzeitig auf einer Nachricht (eine Action-Row pro
   Kategorie, Discord erlaubt bis zu 5 Rows/Message), grob kategorisiert z. B.:
   - Sensoren (Temperatur/Feuchte/Licht/Distanz/Bewegung/Batterie — ADS1115, BME280, PIR,
     Battery, …)
   - Display & Uhr (ST7789, TTGO-T-Display, Cronixie, Word-Clock, Seven-Segment, …)
   - IO/Steuerung/Automation (Relais, PWM-Fan, Rotary-Encoder, SD-Karte, …)
   - Netzwerk/Effekte/Sonstiges (audioreactive, boblight, animartrix, wireguard, …)

   Bereits vom Board vorgegebene UserMods (siehe Entscheidung 4) sind in ihrer Kategorie
   vorausgewählt. Ein "Weiter"-Button (eigene Action-Row) bestätigt die Auswahl über alle
   Kategorie-Menüs hinweg.
5. **Review:** Zeigt den vollständig generierten `[env:custom_build]`-Block als Code-Block
   (Discord-Embed), mit Buttons "✅ Build starten", "✏️ Von vorne" und "❌ Abbrechen".
6. **Build:** Bei "✅ Build starten" wird exakt derselbe Pfad wie beim Modal-Submit von `/build`
   verwendet — `buildQueue.enqueue(...)` → `runOneBuild(...)` → Docker-Sandbox → Sanitizer →
   Lib-Scanner → `pio run`. Keine neue Build-Logik, nur ein neuer Weg, den `rawText`-Input dafür zu
   erzeugen.

## Env-Generierung (Kernlogik)

Aus den Wizard-Auswahlen wird ein einzelner Ini-Block gebaut:

```ini
[env:custom_build]
extends = env:<gewähltes_board>
custom_usermods = <board-default-usermods falls nicht abgewählt> <nutzer-gewählte-usermods>
build_flags = ${env:<gewähltes_board>.build_flags}
	-D WLED_DISABLE_XYZ
	-D WLED_DISABLE_ABC
```

- `custom_usermods`: Liste dedupliziert, Leerzeile falls keine Auswahl (Key dann ganz weglassen).
- `build_flags`: **Korrektur nach Builder-Check** — PlatformIOs `extends` ersetzt eine vom Child
  gesetzte Section komplett, statt sie mit dem Parent zusammenzuführen. In der echten
  `platformio.ini` setzt **jeder** Board-Env seine eigene volle `build_flags`-Kette (nicht nur
  Release-Name-Kosmetik, sondern z. B. `WLED_DISABLE_PARTICLESYSTEM2D` bei ESP8266 als RAM-Schutz
  oder `ARDUINO_USB_CDC_ON_BOOT=0` bei S3-Chips) — das ist der Normalfall, keine Ausnahme. Würde
  der Wizard `build_flags` nur mit den selbst gewählten `-D WLED_DISABLE_*`-Flags setzen, gingen
  alle vererbten Board-Flags beim ersten ausgewählten Feature-Flag stillschweigend verloren.
  Lösung: `build_flags` wird **nur** gesetzt, wenn mindestens ein Feature-Flag aktiviert wurde, und
  beginnt dann immer mit `${env:<board>.build_flags}` (genau diese `${env:X.key}`-Interpolation auf
  eine andere, in der Basis-`platformio.ini` fest definierte Section wird dort bereits heute
  verwendet, z. B. `build_unflags = ${env:esp32S3_wroom2_32MB.build_unflags}`, und besteht den
  Sanitizer unverändert — kein neuer Allowlist-Fall nötig). Wird kein Feature-Flag aktiviert, lässt
  der Wizard den `build_flags`-Key komplett weg, damit `extends` die Board-Flags unangetastet
  durchreicht.
- Env-Name: fester/generierter Platzhalter (z. B. `custom_build` oder `custom_<kurzer_hash>`) —
  taucht aktuell nirgends sichtbar für den Nutzer außer intern auf, daher kein eigener Wizard-
  Schritt dafür nötig.

Der generierte Text wird **exakt wie heute** durch `iniSanitizer.sanitizePlatformioEnv()` geschickt,
bevor er in die Build-Pipeline geht — keine Bypass-Logik, auch wenn der Wizard "vertrauenswürdig"
generiert.

**Geklärt (Builder-Check-Frage):** Braucht der UserMods-Schritt zusätzliche Eingaben für Pins/
Parameter pro UserMod, oder reicht die reine Namensauswahl? Stichprobe im UserMod-Quellcode (z. B.
`usermods/PIR_sensor_switch/PIR_sensor_switch.cpp`) zeigt das durchgängige WLED-v2-Usermod-Muster
`#ifndef XYZ_PIN #define XYZ_PIN <chip-spezifischer_default> #endif` — jedes Pin/Parameter hat
einen sinnvollen Compile-Time-Default, überschreibbar nur bei Bedarf über zusätzliche `-D`-Flags
(die der Wizard nicht anbietet) oder zur Laufzeit über die UserMod-Settings-Seite im WLED-WebUI.
Reine Namensauswahl in `custom_usermods` ist also funktional ausreichend für alle 75 UserMods auf
den unterstützten (nicht-custom-Pinout-)Boards — kein zusätzlicher Konfigurations-Schritt nötig.

## Katalog-Datenstruktur

Neue Konfigurationsdatei, z. B. `commands/build/lib/envWizardCatalog.json` (oder `.js`), mit:

```json
{
  "boards": [
    { "id": "esp32dev", "label": "ESP32 (generic)", "category": "esp32", "defaultUsermods": [] },
    { "id": "nodemcuv2", "label": "ESP8266 (NodeMCU v2)", "category": "esp8266", "defaultUsermods": ["audioreactive"] }
  ],
  "boardCategories": [
    { "id": "esp8266", "label": "ESP8266" },
    { "id": "esp32", "label": "ESP32 (generic)" }
  ],
  "features": [
    { "flag": "WLED_DISABLE_MQTT", "label": "MQTT deaktivieren" }
  ],
  "usermods": [
    { "id": "audioreactive", "label": "Audioreactive", "category": "network_effects" }
  ],
  "usermodCategories": [
    { "id": "sensors", "label": "Sensoren" }
  ]
}
```

Einmalig aus dem aktuellen WLED-`main` abgeleitet (Boards aus `platformio.ini`-Env-Headern,
UserMods aus `usermods/*`-Verzeichnisnamen, Features aus `WLED_DISABLE_*`-Grep in `wled00/`). Die
genaue Board-/UserMod-Kategorisierung (welches UserMod in welche von 3–4 Kategorien fällt) ist eine
Bau-Entscheidung — die Gruppierung im UX-Flow oben ist ein Vorschlag, keine feste Vorgabe.

## State-Management

Pro Nutzer ein In-Memory-Wizard-Session-Objekt (analog `pendingBranchByUser`), z. B.:

```js
{ step, branch, boardId, selectedFeatures: Set, selectedUsermods: Set, messageId, expiresAt }
```

- TTL (z. B. 10 Minuten wie `PENDING_BRANCH_TTL_MS`), abgelaufene Sessions zeigen beim nächsten
  Interaktions-Versuch eine Fehlermeldung ("Session abgelaufen, bitte `/buildenv` erneut
  ausführen"), analog zum bestehenden `consumeBranch`-Verhalten.
- Nur eine aktive Session pro Nutzer; ein erneuter `/buildenv`-Aufruf während einer laufenden
  Session überschreibt die alte (kein Stacking).

## Was dem Bauenden überlassen bleibt

- Finaler Command-Name (`/buildenv` ist ein Arbeitsname).
- Exakte Kategorisierung der 75 UserMods in 3–4 Gruppen (Vorschlag oben als Ausgangspunkt).
- Exakte Board-Kategorien/-Gruppierung für Schritt 2.
- Copy/Wording der Button- und Menü-Labels (deutschsprachig, analog zum bestehenden `/build`-Ton
  wie "❌", "✅", "⏳ Queued...").
- Ob der generierte Platzhalter-Env-Name `custom_build` heißt oder anders — unkritisch, da intern.
- Technische Umsetzung des Mehrfach-Select-über-mehrere-Menüs-Sammelns (z. B. Zustand nach jeder
  Select-Interaktion zwischenspeichern vs. erst beim "Weiter"-Button alle Component-States der
  Nachricht auslesen).
