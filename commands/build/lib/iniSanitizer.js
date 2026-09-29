const ENV_HEADER_RE = /^\s*\[env:([A-Za-z0-9_-]{1,64})\]\s*$/m;
const SECTION_HEADER_RE = /^\s*\[([^\]]*)\]\s*$/;
const KEY_RE = /^([A-Za-z0-9_.]+)\s*=/;

const ALLOWED_KEYS = new Set([
    'board', 'platform', 'platform_packages', 'framework', 'build_type',
    'build_flags', 'build_unflags', 'build_src_filter',
    'lib_deps', 'lib_ignore', 'lib_compat_mode', 'custom_usermods',
    'monitor_speed', 'monitor_filters', 'monitor_port',
    'upload_speed', 'upload_protocol', 'upload_port',
    'extends',
    'board_build.partitions', 'board_build.filesystem', 'board_build.flash_mode',
    'board_build.f_cpu', 'board_build.f_flash', 'board_build.flash_size', 'board_build.ldscript',
]);

// platform/platform_packages können auf PlatformIO-Packages zeigen, die beliebigen Python-Code
// mit vollem Build-Zugriff mitbringen (ähnlich riskant wie extra_scripts) - anders als bei
// lib_deps gibt es dafür keinen Post-Fetch-Scan. Erlaubt sind daher nur Registry-Namen und
// ${section.key}-Variablenreferenzen auf die (nicht user-kontrollierte) Basis-platformio.ini -
// aber keine literalen Remote-URLs.
const URL_RESTRICTED_KEYS = new Set(['platform', 'platform_packages']);
const URL_LIKE_RE = /(:\/\/|git\+|git@|\.git\b)/i;

function lineHasUrl(line) {
    return URL_LIKE_RE.test(line);
}

// WLEDs pio-scripts/load_usermods.py mischt custom_usermods-Einträge, die wie eine externe
// Referenz aussehen (URL, "owner/Name", "Name = spec", git@...), direkt in lib_deps - aber erst
// als pre:-extra_script während des echten "pio run", NICHT während des vorgelagerten
// "pio pkg install"-Fetches, auf dem unser Post-Fetch-Scan (libScanner) aufsetzt. Externe
// custom_usermods-Einträge würden den Scan also umgehen, wenn man sie nur im Ini-Text beließe.
// Lösung: wir erkennen externe Einträge (dieselbe Heuristik wie load_usermods.py's
// _is_external_entry) und geben sie als eigene Liste zurück, damit buildRunner sie VORAB per
// "pio pkg install -l <spec>" fetcht - dieselbe Route wie lib_deps, inkl. Post-Fetch-Scan, bevor
// überhaupt kompiliert (und damit potenziell ein Build-Hook ausgeführt) wird.
const CUSTOM_USERMODS_KEY = 'custom_usermods';
const SAFE_BARE_TOKEN_RE = /^(\*|[A-Za-z0-9_-]+)$/;
const MAX_EXTERNAL_USERMOD_SPEC_LENGTH = 300;

// Spiegelt load_usermods.py: _NAME_EQ_RE, _URL_SCHEME_RE, _SSH_URL_RE, sowie die "owner/Name"-
// und "enthält @"-Fälle.
const EXTERNAL_NAME_EQ_RE = /^[A-Za-z0-9_.-]+\s*=\s*\S/;
const EXTERNAL_URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const EXTERNAL_SSH_URL_RE = /^[^@\s]+@[^@:\s]+:[^:\s]/;
const EXTERNAL_OWNER_NAME_RE = /^[^/\s]+\/[^/\s]+$/;

function isExternalUsermodEntry(value) {
    if (EXTERNAL_NAME_EQ_RE.test(value)) return true;
    if (EXTERNAL_URL_SCHEME_RE.test(value)) return true;
    if (EXTERNAL_SSH_URL_RE.test(value)) return true;
    if (value.includes('@')) return true;
    if (EXTERNAL_OWNER_NAME_RE.test(value)) return true;
    return false;
}

function externalUsermodEntryIsSafe(value) {
    if (value.length === 0 || value.length > MAX_EXTERNAL_USERMOD_SPEC_LENGTH) return false;
    if (value.startsWith('-')) return false; // könnte sonst als pio-CLI-Flag fehlinterpretiert werden
    if (/[\x00-\x1f]/.test(value)) return false; // keine Steuerzeichen
    return true;
}

function customUsermodsValuePortion(line, isKeyLine) {
    let value = line;
    if (isKeyLine) {
        value = line.replace(/^\s*[A-Za-z0-9_.]+\s*=\s*/, '');
    }
    const commentIdx = value.search(/[;#]/);
    if (commentIdx !== -1) value = value.slice(0, commentIdx);
    return value.trim();
}

// Klassifiziert eine custom_usermods-Zeile (Key- oder Fortsetzungszeile) analog zu
// load_usermods.py: sieht die GESAMTE Zeile wie eine externe Referenz aus, zählt sie als EIN
// externer Eintrag; sonst wird auf Leerzeichen in Bare-Namen aufgeteilt. Bare-Namen (inkl. "*")
// werden zusätzlich zurückgegeben, damit buildRunner die zugehörigen, bereits im Repo
// vorhandenen usermods/-Ordner als vertrauenswürdig markieren kann (der Post-Fetch-Scan soll
// legitime, maintainer-shipped Usermods wie "audioreactive" - die selbst ein extraScript
// mitbringen dürfen - nicht fälschlich blockieren).
function classifyCustomUsermodsLine(line, isKeyLine) {
    const value = customUsermodsValuePortion(line, isKeyLine);
    if (value === '') return { externalEntries: [], bareTokens: [], invalidReason: null };

    if (isExternalUsermodEntry(value)) {
        if (!externalUsermodEntryIsSafe(value)) {
            return { externalEntries: [], bareTokens: [], invalidReason: `External custom_usermods reference '${value}' is invalid (empty, too long, starts with '-', or contains control characters).` };
        }
        return { externalEntries: [value], bareTokens: [], invalidReason: null };
    }

    const tokens = value.split(/\s+/);
    const badToken = tokens.find((token) => !SAFE_BARE_TOKEN_RE.test(token));
    if (badToken) {
        return { externalEntries: [], bareTokens: [], invalidReason: `Invalid custom_usermods entry '${badToken}'.` };
    }
    return { externalEntries: [], bareTokens: tokens, invalidReason: null };
}

function extractEnvName(rawText) {
    const match = (rawText || '').match(ENV_HEADER_RE);
    if (!match) {
        return { envName: null, error: 'Could not find an environment name. Expected a header like "[env:my_env]" (letters, digits, "_" and "-" only, max. 64 characters).' };
    }
    return { envName: match[1], error: null };
}

function getIndent(line) {
    const match = line.match(/^[ \t]*/);
    return match ? match[0].length : 0;
}

function sanitizePlatformioEnv({ rawText, envName }) {
    const lines = (rawText || '').split(/\r\n|\r|\n/);
    const violations = [];
    const outputLines = [];
    const externalCustomUsermods = [];
    const bareCustomUsermods = [];

    let currentSection = null;
    let sectionAllowed = false;
    let inKeyContext = false;
    let currentKeyAllowed = false;
    let currentKeyName = null;
    let currentKeyIndent = -1;

    lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        const trimmed = line.trim();

        if (trimmed === '' || /^[;#]/.test(trimmed)) {
            if (sectionAllowed) {
                outputLines.push(line);
            }
            return;
        }

        const sectionMatch = line.match(SECTION_HEADER_RE);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            sectionAllowed = currentSection === `env:${envName}`;
            inKeyContext = false;
            currentKeyAllowed = false;
            currentKeyName = null;
            currentKeyIndent = -1;
            if (!sectionAllowed) {
                violations.push({ line: lineNo, text: line, reason: `Section '[${currentSection}]' is not allowed. Only '[env:${envName}]' is accepted.` });
            } else {
                outputLines.push(line);
            }
            return;
        }

        if (currentSection === null) {
            violations.push({ line: lineNo, text: line, reason: 'Content outside of a section is not allowed.' });
            return;
        }

        if (!sectionAllowed) {
            // Gesamte Sektion wurde bereits am Header abgelehnt, keine Einzelzeilen-Meldung nötig.
            return;
        }

        const indent = getIndent(line);
        const keyMatch = trimmed.match(KEY_RE);
        const isNewKey = keyMatch && (!inKeyContext || indent <= currentKeyIndent);

        if (isNewKey) {
            const key = keyMatch[1].toLowerCase();
            currentKeyIndent = indent;
            currentKeyName = key;
            inKeyContext = true;
            if (!ALLOWED_KEYS.has(key)) {
                currentKeyAllowed = false;
                violations.push({ line: lineNo, text: line, reason: `Key '${key}' is not allowed.` });
            } else if (URL_RESTRICTED_KEYS.has(key) && lineHasUrl(line)) {
                currentKeyAllowed = false;
                violations.push({ line: lineNo, text: line, reason: `Key '${key}' may not contain a remote URL. Only registry names (e.g. 'espressif32') or \${section.key} variable references into the base platformio.ini are allowed.` });
            } else if (key === CUSTOM_USERMODS_KEY) {
                const { externalEntries, bareTokens, invalidReason } = classifyCustomUsermodsLine(line, true);
                if (invalidReason) {
                    currentKeyAllowed = false;
                    violations.push({ line: lineNo, text: line, reason: invalidReason });
                } else {
                    currentKeyAllowed = true;
                    externalCustomUsermods.push(...externalEntries);
                    bareCustomUsermods.push(...bareTokens);
                    outputLines.push(line);
                }
            } else {
                currentKeyAllowed = true;
                outputLines.push(line);
            }
            return;
        }

        if (!inKeyContext) {
            violations.push({ line: lineNo, text: line, reason: 'Line outside of a valid key context.' });
            return;
        }

        if (!currentKeyAllowed) {
            violations.push({ line: lineNo, text: line, reason: 'Continuation line of a disallowed key.' });
            return;
        }

        if (URL_RESTRICTED_KEYS.has(currentKeyName) && lineHasUrl(line)) {
            violations.push({ line: lineNo, text: line, reason: `Continuation line of '${currentKeyName}' may not contain a remote URL.` });
            return;
        }

        if (currentKeyName === CUSTOM_USERMODS_KEY) {
            const { externalEntries, bareTokens, invalidReason } = classifyCustomUsermodsLine(line, false);
            if (invalidReason) {
                violations.push({ line: lineNo, text: line, reason: invalidReason });
                return;
            }
            externalCustomUsermods.push(...externalEntries);
            bareCustomUsermods.push(...bareTokens);
        }

        outputLines.push(line);
    });

    if (violations.length > 0) {
        return { ok: false, sanitizedIni: null, violations, externalCustomUsermods: [], bareCustomUsermods: [] };
    }
    return {
        ok: true,
        sanitizedIni: outputLines.join('\n'),
        violations: [],
        externalCustomUsermods: Array.from(new Set(externalCustomUsermods)),
        bareCustomUsermods: Array.from(new Set(bareCustomUsermods)),
    };
}

module.exports = { extractEnvName, sanitizePlatformioEnv, ALLOWED_KEYS, ENV_HEADER_RE };
