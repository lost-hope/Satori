# Setup: Sandboxed Build-Container

`/build` kompiliert WLED-Firmware nicht mehr direkt auf dem Bot-Host. Stattdessen startet der
Orchestrator (der eigentliche Discord-Bot-Prozess) für **jeden einzelnen Build einen frischen,
isolierten Docker-Container** (`docker run --rm`), der die komplette Pipeline (Sanitizing,
Git-Clone, `pio pkg install`, Sicherheits-Scan, `pio run`) in sich abgeschlossen ausführt.

**Warum:** Der Orchestrator hält den Discord-Bot-Token. Ein RCE über die Compile-Pipeline (z.B.
eine Lücke in unserem eigenen Sanitizer/Scanner, die wir nicht kennen) soll den Token und den
restlichen Server **nicht** erreichen können — nur den Wegwerf-Container, der direkt danach
ohnehin verschwindet. Der Orchestrator selbst hat weder `git`-Checkout von WLED noch `pio`
installiert; er braucht nur `git` (für Branch-Autocomplete per `git ls-remote`, ohne lokalen
Checkout) und `docker`.

**Wichtig:** Das ist Defense-in-Depth, keine Garantie. Eine Ini-Allow-List (wie unser Sanitizer)
kann PlatformIO-Missbrauch nie vollständig abdecken — PlatformIO führt als Build-System per Design
beliebigen Code aus (Compiler-Flags, Library-Build-Hooks, Platform-Packages, ...). Die
Container-Isolation nimmt an, dass irgendein Bypass existiert, den wir nicht kennen, und begrenzt
den Schaden trotzdem auf den Wegwerf-Container statt auf den Host mit Root-Rechten.

## Einmaliges Setup auf dem Server

### 1. Docker installieren (falls noch nicht vorhanden)

Siehe [docs.docker.com](https://docs.docker.com/engine/install/) für die jeweilige Distribution.

### 2. Builder-Image bauen

```bash
cd /path/to/Satori
docker build -t satori-builder:latest -f docker/builder/Dockerfile docker/builder
```

Bei Updates am Builder-Code (`docker/builder/`) muss dieser Befehl erneut ausgeführt werden — der
Orchestrator nutzt immer das lokal getaggte Image, es gibt keinen automatischen Rebuild.

### 3. Netzwerk + Cache-Volume anlegen

Der Orchestrator legt Netzwerk und Volume beim ersten Build automatisch an, falls sie fehlen
(idempotent). Manuell geht's auch:

```bash
docker network create satori-builder-net
docker volume create satori-pio-cache
```

- `satori-builder-net`: eigenes, isoliertes Netzwerk nur für Build-Container — keine Verbindung zu
  anderen Containern/Diensten auf dem Host, aber mit Internetzugang (nötig für Git/npm/PlatformIO).
- `satori-pio-cache`: persistentes Volume für den PlatformIO-Paket-/Toolchain-Cache
  (`~/.platformio` im Container) — beschleunigt wiederholte Builds erheblich. Enthält nur von
  PlatformIO selbst verwaltete, versionierte Pakete, kein Build-Zustand einzelner Requests.

### 4. Orchestrator-User braucht Docker-Zugriff

Der PM2-Prozess muss `docker run`/`docker network`/`docker volume` ausführen können — entweder als
root (nicht empfohlen, siehe unten) oder als Mitglied der `docker`-Gruppe:

```bash
sudo usermod -aG docker <user>
```

**Wichtig:** Mitgliedschaft in der `docker`-Gruppe ist praktisch äquivalent zu Root-Rechten auf dem
Host (man kann beliebige Container mit beliebigen Mounts starten) — der Punkt dieser Architektur
ist, dass der **Build-Container** eingeschränkt ist (non-root, `--cap-drop=ALL`, read-only,
Ressourcen-Limits), nicht der Orchestrator selbst. Den Orchestrator-Prozess trotzdem nicht als
root laufen zu lassen, ist weiterhin empfehlenswert (Defense in Depth).

## Was der Orchestrator NICHT mehr braucht

- Keinen lokalen WLED-Checkout (`commands/build/wled/` wird nicht mehr verwendet)
- Kein `pio`/PlatformIO auf dem Host
- Keinen `npm ci`/Node-Toolchain-Zugriff für den WLED-eigenen Web-UI-Build (passiert im Container)

## Konfiguration (`config.json`)

Siehe `config_sample.json` für alle Keys. Relevant für den Builder:

| Key | Default | Bedeutung |
|---|---|---|
| `wledRepoUrl` | `https://github.com/wled/WLED.git` | Quelle für den Git-Clone im Container |
| `dockerImage` | `satori-builder:latest` | Image-Tag (siehe Schritt 2) |
| `dockerNetwork` | `satori-builder-net` | Siehe Schritt 3 |
| `dockerPioVolume` | `satori-pio-cache` | Siehe Schritt 3 |
| `dockerMemoryLimit` | `3g` | Hard-Limit pro Build-Container |
| `dockerCpuLimit` | `2` | CPU-Kerne pro Build-Container |
| `dockerPidsLimit` | `512` | Schutz gegen Fork-Bombs |
| `dockerTmpfsSize` | `2g` | Größe des beschreibbaren `/tmp` (WLED-Checkout + Build-Artefakte landen dort, RAM-backed, verschwindet mit dem Container) |
| `buildConcurrency` | `1` | Wie viele Build-Container gleichzeitig laufen dürfen |

## Manueller Test

```bash
mkdir -p test-input test-output
# Container läuft als non-root "builder"-User mit einer UID, die normalerweise NICHT zum
# Host-User passt - ohne das hier schlägt das Schreiben von /output/result.json mit
# EACCES fehl, bevor überhaupt ein Ergebnis zurückkommt. (Der Orchestrator macht das für
# echte Builds automatisch, siehe dockerRunner.js - hier beim manuellen Test von Hand.)
chmod 777 test-output

docker run --rm \
  --network satori-builder-net \
  --cap-drop=ALL --security-opt no-new-privileges \
  --pids-limit 512 --memory 3g --cpus 2 \
  --read-only --tmpfs /tmp:rw,size=2g \
  -v "$(pwd)/test-input:/input:ro" \
  -v "$(pwd)/test-output:/output" \
  -v satori-pio-cache:/home/builder/.platformio \
  satori-builder:latest
```
mit `test-input/job.json` = `{"envInput": "[env:esp32dev]\nboard = esp32dev", "branch": "main"}`.
Nach dem Lauf: `test-output/result.json` und bei Erfolg `test-output/firmware.bin` prüfen.
