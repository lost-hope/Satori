const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const KILL_GRACE_PERIOD_MS = 5000;

// Node/libuv lösen unter Windows bare Kommandonamen (ohne Extension) beim direkten spawn()
// (ohne shell:true) nicht zuverlässig über PATH auf - manche Tools funktionieren trotzdem
// (vermutlich über eine "App Paths"-Registry-Registrierung, z.B. git.exe), andere echten .exe
// auf PATH (z.B. pio.exe, pip-/venv-installiert) scheitern reproduzierbar mit ENOENT, obwohl die
// Datei nachweislich existiert. Statt global shell:true zu setzen (unnötiges Injection-Risiko
// über cmd.exe-Quoting), wird der volle Pfad hier einmalig selbst aufgelöst und gecacht.
const resolvedCommandCache = new Map();

function resolveCommand(cmd) {
    if (process.platform !== 'win32') return cmd;
    if (/[\\/]/.test(cmd) || /\.(exe|cmd|bat|com)$/i.test(cmd)) return cmd;
    if (resolvedCommandCache.has(cmd)) return resolvedCommandCache.get(cmd);

    const pathDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
    const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';');
    let resolved = cmd;
    outer: for (const dir of pathDirs) {
        for (const ext of extensions) {
            const candidate = path.join(dir, cmd + ext.toLowerCase());
            if (fs.existsSync(candidate)) {
                resolved = candidate;
                break outer;
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
