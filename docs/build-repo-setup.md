# Setup: `commands/build/wled`

`commands/build/wled` muss ein **echtes, eigenständiges Git-Repository** sein. Aktuell ist es
das nicht: es ist im Bot-Repo als kaputter Submodule-Verweis (Mode `160000`, kein
`.gitmodules`, kein `.git`-Ordner darin) eingetragen. Dadurch operieren `git`-Befehle mit
`cwd: commands/build/wled` in Wirklichkeit auf dem **Repo des Bots selbst** (Git läuft den
Verzeichnisbaum nach oben, bis es ein `.git` findet).

Dies ist ein einmaliger, manueller Schritt auf dem Host und wird bewusst **nicht** automatisch
vom Bot-Code ausgeführt (potenziell datenverändernd, erfordert Bestätigung der Repo-URL).

## Ablauf

```bash
# 1. Den kaputten Gitlink-Eintrag aus dem Bot-Repo-Index entfernen
#    (Arbeitsverzeichnis bleibt erhalten, nur der Index-Eintrag wird entfernt)
git rm --cached commands/build/wled

# 2. Bisherigen Ordner sichern/umbenennen, falls dort bereits Build-Artefakte
#    (.pio, node_modules, o.ä.) liegen, die nicht verloren gehen sollen
mv commands/build/wled commands/build/wled.bak

# 3. Frischen, echten Klon anlegen
git clone https://github.com/wled/WLED.git commands/build/wled

# 4. Optional: alte Build-Caches aus wled.bak übernehmen, dann wled.bak löschen
```

## Danach

- `commands/build/wled/` ist bereits über `.gitignore` vom Bot-Repo ausgeschlossen.
- Der Bot ermittelt den Default-Branch automatisch (`git rev-parse --abbrev-ref origin/HEAD`)
  und bietet über Autocomplete alle Remote-Branches/-Tags zur Auswahl an
  (`git ls-remote --heads --tags origin`) — es muss also keine feste Branch-Referenz im Code
  gepflegt werden.
- Der erste Build nach dem Neu-Klonen dauert länger (kein warmer `.pio`/`node_modules`-Cache).
