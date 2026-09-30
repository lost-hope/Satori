const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KILL_GRACE_PERIOD_MS = 5000;

// Node/libuv lösen bare Kommandonamen (ohne Pfad) beim direkten spawn() (ohne shell:true) nicht
// immer zuverlässig über process.env.PATH auf:
// - Windows: manche Tools funktionieren trotzdem bare (vermutlich über eine "App Paths"-Registry-
//   Registrierung, z.B. git.exe), andere echten .exe auf PATH (z.B. pio.exe, pip-/venv-
//   installiert) scheitern reproduzierbar mit ENOENT, obwohl die Datei nachweislich existiert.
// - Linux/PM2: der PM2-Daemon läuft oft mit einer anderen (minimaleren) Umgebung als die
//   interaktive Shell, in der man z.B. manuell "git clone" getestet hat (PM2 cached die Umgebung
//   vom Start des Daemons/Systemd-Unit; ein simples "pm2 restart" reicht dafür oft nicht) - selbst
//   ein systemweit installiertes git kann so mit ENOENT scheitern, weil process.env.PATH im
//   PM2-Prozess git's Verzeichnis schlicht nicht enthält.
// Statt global shell:true zu setzen (unnötiges Injection-Risiko über z.B. cmd.exe-Quoting), wird
// der volle Pfad hier einmalig selbst aufgelöst und gecacht - inkl. eines Fallbacks auf die
// üblichen System-Bin-Verzeichnisse unter Linux, falls PATH selbst schon unvollständig ist.
const resolvedCommandCache = new Map();
const COMMON_POSIX_BIN_DIRS = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/local/sbin', '/usr/sbin', '/sbin'];

// PlatformIO's eigener Installer (get-platformio.py) legt "pio" nicht in einem der System-
// Verzeichnisse oben ab, sondern in einer Per-User-venv unter dem Home-Verzeichnis dessen, der
// die Installation ausgeführt hat - hier läuft der Bot als root, also typischerweise
// /root/.platformio/penv/bin/pio. pip-User-Installs (z.B. via "pip install --user") landen
// entsprechend unter ~/.local/bin. Beides deckt COMMON_POSIX_BIN_DIRS nicht ab.
function userPosixBinDirs() {
    try {
        const home = os.homedir();
        if (!home) return [];
        return [
            path.join(home, '.platformio', 'penv', 'bin'),
            path.join(home, '.local', 'bin'),
        ];
    } catch {
        return [];
    }
}

function resolveCommand(cmd) {
    if (/[\\/]/.test(cmd)) return cmd; // bereits ein Pfad, nichts aufzulösen
    if (resolvedCommandCache.has(cmd)) return resolvedCommandCache.get(cmd);

    let resolved = cmd;

    if (process.platform === 'win32') {
        if (!/\.(exe|cmd|bat|com)$/i.test(cmd)) {
            const pathDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
            const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';');
            outer: for (const dir of pathDirs) {
                for (const ext of extensions) {
                    const candidate = path.join(dir, cmd + ext.toLowerCase());
                    if (fs.existsSync(candidate)) {
                        resolved = candidate;
                        break outer;
                    }
                }
            }
        }
    } else {
        const pathDirs = (process.env.PATH || '').split(path.delimiter);
        for (const dir of [...pathDirs, ...userPosixBinDirs(), ...COMMON_POSIX_BIN_DIRS]) {
            if (!dir) continue;
            const candidate = path.join(dir, cmd);
            try {
                fs.accessSync(candidate, fs.constants.X_OK);
                resolved = candidate;
                break;
            } catch {
                // nicht hier - weitersuchen
            }
        }
    }

    resolvedCommandCache.set(cmd, resolved);
    return resolved;
}

// Spawnt mit detached:true, damit der Kindprozess eine eigene Prozessgruppe leitet - PlatformIO
// (bzw. npm/git) spawnen ihrerseits Subprozesse; ein einfaches child.kill() würde diese als
// Waisen zurücklassen. Bei Timeout wird die gesamte Gruppe signalisiert (POSIX-only, passend zum
// Linux-Produktivziel laut ecosystem.config.js).
function spawnWithTimeout(cmd, args, opts = {}, timeoutMs) {
    const { onSpawn, ...spawnOpts } = opts;

    return new Promise((resolve) => {
        const child = spawn(resolveCommand(cmd), args, { ...spawnOpts, detached: true });

        let settled = false;
        let timedOut = false;
        let timeoutTimer = null;
        let killTimer = null;

        const clearTimers = () => {
            if (timeoutTimer) clearTimeout(timeoutTimer);
            if (killTimer) clearTimeout(killTimer);
        };

        if (timeoutMs) {
            timeoutTimer = setTimeout(() => {
                timedOut = true;
                try {
                    process.kill(-child.pid, 'SIGTERM');
                } catch {
                    // Prozess(gruppe) existiert evtl. schon nicht mehr
                }
                killTimer = setTimeout(() => {
                    try {
                        process.kill(-child.pid, 'SIGKILL');
                    } catch {
                        // bereits beendet
                    }
                }, KILL_GRACE_PERIOD_MS);
            }, timeoutMs);
        }

        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimers();
            resolve({ code: null, signal: null, timedOut, error });
        });

        child.on('close', (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimers();
            resolve({ code, signal, timedOut, error: null });
        });

        if (typeof onSpawn === 'function') {
            onSpawn(child);
        }
    });
}

module.exports = { spawnWithTimeout, resolveCommand };
