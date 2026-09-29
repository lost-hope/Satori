const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

async function walk(dir, callback) {
    let entries;
    try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await walk(full, callback);
        } else if (entry.isFile()) {
            await callback(full, entry.name);
        }
    }
}

// Löst custom_usermods-Bare-Tokens (bereits vom iniSanitizer auf "sichere Identifier oder '*'"
// geprüft) auf echte usermods/-Ordnernamen auf - spiegelt find_usermod() aus
// pio-scripts/load_usermods.py (Suffix-Varianten "<mod>", "<mod>_v2", "usermod_v2_<mod>").
// Diese Ordner kommen aus dem eigenen, per "git reset --hard" sauber gehaltenen Checkout, nicht
// von Nutzereingaben, und dürfen daher vom Post-Fetch-Scan ausgenommen werden.
function resolveUsermodFolderName(usermodsDir, token) {
    for (const candidate of [token, `${token}_v2`, `usermod_v2_${token}`]) {
        if (fs.existsSync(path.join(usermodsDir, candidate))) {
            return candidate;
        }
    }
    return null;
}

function resolveTrustedUsermodNames(gitPath, bareTokens) {
    const usermodsDir = path.join(gitPath, 'usermods');
    const trusted = new Set();
    for (const token of bareTokens) {
        if (token === '*') {
            let entries = [];
            try {
                entries = fs.readdirSync(usermodsDir, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const entry of entries) {
                if (entry.isDirectory() && fs.existsSync(path.join(usermodsDir, entry.name, 'library.json'))) {
                    trusted.add(entry.name);
                }
            }
            continue;
        }
        const resolved = resolveUsermodFolderName(usermodsDir, token);
        if (resolved) trusted.add(resolved);
    }
    return trusted;
}

// PlatformIO führt library.json -> build.extraScript automatisch beim Build aus - das ist ein
// eigenständiger Codeausführungs-Weg, unabhängig vom bereits per Allow-List blockierten
// extra_scripts in der Haupt-Ini. Ebenso kann eine Library ihre eigene platformio.ini/
// library.properties mit extra_scripts mitbringen.
// trustedNames: Ordnernamen (Top-Level unter libdeps/<env>/), die vom Scan ausgenommen werden -
// vorgesehen für bereits im Repo vorhandene, per Bare-Name referenzierte Usermods (siehe
// resolveTrustedUsermodNames), NICHT für extern gefetchte Inhalte.
async function scanFetchedLibs(gitPath, envName, trustedNames = new Set()) {
    const libDepsDir = path.join(gitPath, '.pio', 'libdeps', envName);
    const findings = [];

    if (!fs.existsSync(libDepsDir)) {
        return { ok: true, findings: [] };
    }

    await walk(libDepsDir, async (filePath, fileName) => {
        const libraryDir = path.dirname(filePath);
        const libraryLabel = path.relative(libDepsDir, libraryDir).split(path.sep)[0] || path.basename(libraryDir);

        if (trustedNames.has(libraryLabel)) return;

        if (fileName === 'library.json') {
            let json;
            try {
                json = JSON.parse(await fsp.readFile(filePath, 'utf8'));
            } catch {
                return;
            }
            if (json && json.build && json.build.extraScript) {
                findings.push({
                    library: libraryLabel,
                    file: filePath,
                    detail: `library.json contains build.extraScript: ${JSON.stringify(json.build.extraScript)}`,
                });
            }
            return;
        }

        if (fileName === 'platformio.ini' || fileName === 'library.properties') {
            let content;
            try {
                content = await fsp.readFile(filePath, 'utf8');
            } catch {
                return;
            }
            if (/extra_scripts\s*=/.test(content)) {
                findings.push({
                    library: libraryLabel,
                    file: filePath,
                    detail: 'File contains an extra_scripts directive.',
                });
            }
        }
    });

    return { ok: findings.length === 0, findings };
}

module.exports = { scanFetchedLibs, resolveTrustedUsermodNames };
