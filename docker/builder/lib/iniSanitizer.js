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

function valuePortion(line, isKeyLine) {
    let value = line;
    if (isKeyLine) {
        value = line.replace(/^\s*[A-Za-z0-9_.]+\s*=\s*/, '');
    }
    const commentIdx = value.search(/[;#]/);
    if (commentIdx !== -1) value = value.slice(0, commentIdx);
    return value.trim();
}

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

// lib_deps/custom_usermods-externe Einträge dürfen zwar auf Remote-URLs zeigen (vom Nutzer
// bewusst akzeptiertes Risiko, abgesichert durch den Post-Fetch-Scan in libScanner), aber NICHT
// auf lokale Pfade: PlatformIOs Library-Spec-Syntax unterstützt "file://" und "symlink://" für
// LOKALE Verzeichnisse - z.B. "custom_usermods = symlink:///home/builder/.platformio" oder ein
// absoluter Pfad würde Host-/Container-interne Dateien in den Build-Abhängigkeitsbaum ziehen,
// ganz ohne Netzwerk-Fetch und damit auch ohne dass es wie eine "externe Referenz" aussieht, die
// man prüfen würde. Da es in unserem Kontext (Wegwerf-Container, keine lokalen Dev-Libraries)
// keinen legitimen Anwendungsfall für lokale Pfade gibt, werden sie komplett geblockt.
const LOCAL_FILE_SCHEME_RE = /^(file|symlink):\/\//i;
const ABSOLUTE_PATH_RE = /^(\/|~|[A-Za-z]:[\\/]|\\\\)/;

function looksLikeLocalFileReference(value) {
    return LOCAL_FILE_SCHEME_RE.test(value) || ABSOLUTE_PATH_RE.test(value);
}

const LOCAL_FILE_RESTRICTED_KEYS = new Set(['lib_deps']);

function lineHasLocalFileReference(line, isKeyLine) {
    return looksLikeLocalFileReference(valuePortion(line, isKeyLine));
}

// Bestimmte Compiler-Flags sind eigenständige Codeausführungs-Primitiven, unabhängig vom übrigen
// Sanitizing: -fplugin lädt eine beliebige .so als GCC-Plugin zur Compile-Zeit, -wrapper ersetzt
// den kompletten Compiler-Aufruf durch ein beliebiges Programm, -B/--sysroot/-specs lassen GCC
// nach seinen eigenen internen Tools (cc1/as/ld) in einem angegebenen Verzeichnis suchen (das
// z.B. über einen lib_deps-Fetch präpariert sein könnte), @-Response-Dateien laden zusätzliche
// Flags aus einer beliebigen Datei und würden diese Prüfung komplett umgehen. Das ist bewusst
// eine Deny-List statt einer Allow-List wie bei den Ini-Keys selbst: build_flags braucht zu viele
// legitime, toolchain-/architekturspezifische Flags (-mXXX, -fXXX, ...), um sie vollständig
// aufzuzählen. Bekannte gefährliche Muster werden geblockt, alles andere bleibt erlaubt - das ist
// eine schwächere Garantie als die Key-Allow-List und schließt nicht jeden denkbaren Compiler-
// Flag-Missbrauch aus (siehe docs/build-repo-setup.md).
const DANGEROUS_FLAG_PREFIXES = ['-fplugin', '-wrapper', '--sysroot', '-specs', '-iplugindir'];
const FLAG_RESTRICTED_KEYS = new Set(['build_flags', 'build_unflags']);
// "-Bstatic"/"-Bdynamic"/etc. sind legitime Linker-Pass-Through-Keywords (kein Pfad) - nur davon
// abweichende "-B..."-Tokens nutzen GCCs eigentlichen (gefährlichen) Verzeichnis-Präfix-Mechanismus.
const SAFE_B_FLAG_SUFFIXES = new Set(['static', 'dynamic', 'symbolic', 'symbolic-functions', 'group', 'no-symbolic']);

function isDangerousToken(token) {
    if (token.startsWith('@')) return true;
    if (token.startsWith('-B') && !SAFE_B_FLAG_SUFFIXES.has(token.slice(2))) return true;
    return DANGEROUS_FLAG_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function lineHasDangerousFlag(line) {
    return line.trim().split(/\s+/).some(isDangerousToken);
}

// build_src_filter/board_build.ldscript/board nehmen Pfade entgegen - ohne Prüfung könnte ".."
// oder ein absoluter Pfad genutzt werden, um Dateien außerhalb des Projekts zu referenzieren
// (Informationsleck über Compile-Fehler/Log-Inhalt, eher als direkte Codeausführung).
const PATH_TRAVERSAL_RESTRICTED_KEYS = new Set(['build_src_filter', 'board_build.ldscript', 'board']);

function lineHasPathTraversal(line, isKeyLine) {
    if (line.includes('..')) return true;
    return ABSOLUTE_PATH_RE.test(valuePortion(line, isKeyLine));
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

function externalUsermodEntryInvalidReason(value) {
    if (value.length === 0 || value.length > MAX_EXTERNAL_USERMOD_SPEC_LENGTH) {
        return `External custom_usermods reference '${value}' is invalid (empty or too long).`;
    }
    if (value.startsWith('-')) {
        return `External custom_usermods reference '${value}' may not start with '-' (could be misinterpreted as a pio CLI flag).`;
    }
    if (/[\x00-\x1f]/.test(value)) {
        return `External custom_usermods reference '${value}' contains control characters.`;
    }
    if (looksLikeLocalFileReference(value)) {
        return `External custom_usermods reference '${value}' may not point to a local path (file://, symlink://, or an absolute path). Only remote sources are allowed.`;
    }
    return null;
}

function customUsermodsValuePortion(line, isKeyLine) {
    return valuePortion(line, isKeyLine);
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
        const invalidReason = externalUsermodEntryInvalidReason(value);
        if (invalidReason) {
            return { externalEntries: [], bareTokens: [], invalidReason };
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

// Zusätzliche, keyspezifische Prüfungen jenseits der reinen Allow-List. Jede liefert entweder
// null (ok) oder einen Ablehnungsgrund. Wird sowohl für die Key-Zeile als auch für
// Fortsetzungszeilen desselben Keys aufgerufen.
function extraKeyChecks(key, line, isKeyLine) {
    if (URL_RESTRICTED_KEYS.has(key) && lineHasUrl(line)) {
        return `Key '${key}' may not contain a remote URL. Only registry names (e.g. 'espressif32') or \${section.key} variable references into the base platformio.ini are allowed.`;
    }
    if (LOCAL_FILE_RESTRICTED_KEYS.has(key) && lineHasLocalFileReference(line, isKeyLine)) {
        return `Key '${key}' may not reference a local path (file://, symlink://, or an absolute path). Only remote sources are allowed.`;
    }
    if (FLAG_RESTRICTED_KEYS.has(key) && lineHasDangerousFlag(line)) {
        return `Key '${key}' contains a disallowed compiler flag (e.g. -fplugin, -wrapper, -B, --sysroot, -specs, -iplugindir, or an @response-file) - these can execute arbitrary code at compile time.`;
    }
    if (PATH_TRAVERSAL_RESTRICTED_KEYS.has(key) && lineHasPathTraversal(line, isKeyLine)) {
        return `Key '${key}' may not contain '..' or an absolute path.`;
    }
    return null;
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
                return;
            }

            const extraReason = extraKeyChecks(key, line, true);
            if (extraReason) {
                currentKeyAllowed = false;
                violations.push({ line: lineNo, text: line, reason: extraReason });
                return;
            }

            if (key === CUSTOM_USERMODS_KEY) {
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
                return;
            }

            currentKeyAllowed = true;
            outputLines.push(line);
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

        const extraReason = extraKeyChecks(currentKeyName, line, false);
        if (extraReason) {
            violations.push({ line: lineNo, text: line, reason: `Continuation line of '${currentKeyName}': ${extraReason}` });
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
