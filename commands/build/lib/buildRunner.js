const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');

const { extractEnvName, sanitizePlatformioEnv } = require('./iniSanitizer');
const { scanFetchedLibs, resolveTrustedUsermodNames } = require('./libScanner');
const { spawnWithTimeout } = require('./processUtil');
const { fetchAndCheckout, listRemoteRefs, getDefaultBranch, isValidBranchName } = require('./gitOps');
const buildQueue = require('./buildQueue');

let config = {};
try {
    config = require('../../../config.json');
} catch {
    config = {};
}

const GIT_PATH = path.join(__dirname, '..', 'wled');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const MODAL_CUSTOM_ID = 'buildModal';
const MAX_LOG_FILES = 20;

const BUILD_TIMEOUT_MS = config.buildTimeoutMs ?? 20 * 60 * 1000;
const GIT_TIMEOUT_MS = config.gitTimeoutMs ?? 60 * 1000;
const LIB_FETCH_TIMEOUT_MS = config.libFetchTimeoutMs ?? 5 * 60 * 1000;
const MAX_LOG_BYTES = config.maxLogBytes ?? 5 * 1024 * 1024;
const BRANCH_CACHE_TTL_MS = config.branchCacheTtlMs ?? 60 * 1000;
const PIO_JOBS = config.pioJobs ?? 1;
const DEFAULT_BRANCH_LOOKUP_TIMEOUT_MS = 2000;
const PENDING_BRANCH_TTL_MS = 10 * 60 * 1000;
const PROGRESS_UPDATE_INTERVAL_MS = 90 * 1000;

let branchCache = { refs: [], fetchedAt: 0, refreshing: false };
const pendingBranchByUser = new Map();

function errorEmbed(title, fields) {
    return new EmbedBuilder().setTitle(title).setFields(fields.length ? fields : [{ name: '-', value: '-' }]);
}

async function safeEditReply(interaction, payload) {
    try {
        await interaction.editReply(payload);
    } catch (err) {
        console.error('Konnte Discord-Antwort nicht aktualisieren:', err);
    }
}

function rememberBranch(userId, branch) {
    pendingBranchByUser.set(userId, { branch, expiresAt: Date.now() + PENDING_BRANCH_TTL_MS });
}

function consumeBranch(userId) {
    const entry = pendingBranchByUser.get(userId);
    pendingBranchByUser.delete(userId);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.branch;
}

async function refreshBranchCache() {
    if (branchCache.refreshing) return;
    branchCache.refreshing = true;
    try {
        const refs = await listRemoteRefs(GIT_PATH, GIT_TIMEOUT_MS);
        branchCache = { refs, fetchedAt: Date.now(), refreshing: false };
    } catch (err) {
        console.error('Branch-Cache-Refresh fehlgeschlagen:', err);
        branchCache.refreshing = false;
    }
}

async function ensureLogDir() {
    await fsp.mkdir(LOG_DIR, { recursive: true });
}

async function pruneOldLogs() {
    try {
        const names = (await fsp.readdir(LOG_DIR)).filter((f) => f.endsWith('.log'));
        const withStats = await Promise.all(names.map(async (name) => {
            const filePath = path.join(LOG_DIR, name);
            const stat = await fsp.stat(filePath);
            return { filePath, mtime: stat.mtimeMs };
        }));
        withStats.sort((a, b) => b.mtime - a.mtime);
        await Promise.all(withStats.slice(MAX_LOG_FILES).map((f) => fsp.rm(f.filePath, { force: true })));
    } catch (err) {
        console.error('Log-Bereinigung fehlgeschlagen:', err);
    }
}

async function pruneStaleBuildDirs(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const candidateDirs = [
        path.join(GIT_PATH, '.pio', 'build'),
        path.join(GIT_PATH, 'build_output', 'firmware'),
    ];
    for (const dir of candidateDirs) {
        try {
            const entries = await fsp.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                const stat = await fsp.stat(full);
                if (Date.now() - stat.mtimeMs > maxAgeMs) {
                    await fsp.rm(full, { recursive: true, force: true });
                }
            }
        } catch {
            // Verzeichnis existiert (noch) nicht - nichts zu tun
        }
    }
}

async function cleanEnvOutput(envName) {
    const targets = [
        path.join(GIT_PATH, '.pio', 'build', envName),
        path.join(GIT_PATH, 'build_output', 'firmware', `${envName}.bin`),
        // .pio/libdeps/<env> MUSS vor jedem Build weg, nicht nur build/: sonst kann ein per Name
        // (z.B. "audioreactive") symlink-gefetchtes Usermod aus einem FRÜHEREN, möglicherweise
        // unabhängigen Build unter demselben Env-Namen liegen bleiben. Unser Scan lief bislang
        // gegen genau so einen Altbestand und blockte ein legitimes, bereits gescanntes/vertrautes
        // Usermod fälschlich. Wichtiger noch: ein liegen gebliebener, bereits als "clean" bewerteter
        // Ordner aus einem alten Request könnte einen neuen, böswilligen Request mit demselben
        // Env-Namen sonst unbemerkt am Scan vorbeischleusen. Kostet etwas Rebuild-Zeit für
        // Bibliotheken, ist der Sicherheit aber wert.
        path.join(GIT_PATH, '.pio', 'libdeps', envName),
    ];
    await Promise.all(targets.map((t) => fsp.rm(t, { recursive: true, force: true }).catch(() => {})));
}

function createLogStream(logPath) {
    const stream = fs.createWriteStream(logPath, { flags: 'w' });
    let bytesWritten = 0;
    let truncated = false;
    return {
        write(chunk) {
            if (truncated) return;
            bytesWritten += chunk.length;
            if (bytesWritten > MAX_LOG_BYTES) {
                truncated = true;
                stream.write('\n...[log truncated, limit reached]...\n');
                return;
            }
            stream.write(chunk);
        },
        end() {
            return new Promise((resolve) => stream.end(resolve));
        },
    };
}

function findFirmwarePath(envName) {
    const candidates = [
        path.join(GIT_PATH, '.pio', 'build', envName, 'firmware.bin'),
        path.join(GIT_PATH, 'build_output', 'firmware', `${envName}.bin`),
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function attachLogs(logPath, extraFiles = []) {
    const files = [];
    if (fs.existsSync(logPath)) files.push(new AttachmentBuilder(logPath));
    return [...files, ...extraFiles];
}

async function handleChatInput(interaction) {
    let branch = interaction.options.getString('branch');

    if (branch && !isValidBranchName(branch)) {
        await interaction.reply({
            embeds: [errorEmbed('❌', [{ name: 'Error', value: `Invalid branch/tag name: '${branch}'.` }])],
        });
        return;
    }

    if (!branch) {
        branch = (await getDefaultBranch(GIT_PATH, DEFAULT_BRANCH_LOOKUP_TIMEOUT_MS)) ?? 'main';
    }

    rememberBranch(interaction.user.id, branch);

    const envInput = new TextInputBuilder()
        .setCustomId('envInput')
        .setLabel('PlatformIO Environment Config')
        .setPlaceholder('[env:esp32]\nextends = env:esp32dev\n...')
        .setStyle(TextInputStyle.Paragraph);
    const actionRow = new ActionRowBuilder().addComponents(envInput);
    const modal = new ModalBuilder().setCustomId(MODAL_CUSTOM_ID).setTitle('WLED Builder Bot').addComponents(actionRow);

    await interaction.showModal(modal);
}

async function autocompleteBranch(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    if (Date.now() - branchCache.fetchedAt > BRANCH_CACHE_TTL_MS) {
        refreshBranchCache();
    }
    const choices = branchCache.refs
        .filter((ref) => ref.toLowerCase().includes(focused))
        .slice(0, 25)
        .map((ref) => ({ name: ref, value: ref }));
    await interaction.respond(choices);
}

async function handleModalSubmit(interaction) {
    const rawText = interaction.fields.getTextInputValue('envInput');

    const { envName, error: envError } = extractEnvName(rawText);
    if (envError) {
        await interaction.reply({
            embeds: [errorEmbed('❌', [
                { name: 'Error', value: envError },
                { name: 'Received input', value: (rawText || '(empty)').slice(0, 1000) },
            ])],
        });
        return;
    }

    const branch = consumeBranch(interaction.user.id);
    if (!branch) {
        await interaction.reply({
            embeds: [errorEmbed('❌', [{ name: 'Error', value: 'Could not match the selected branch anymore (timed out). Please run /build again.' }])],
        });
        return;
    }

    const { ok, sanitizedIni, violations, externalCustomUsermods, bareCustomUsermods } = sanitizePlatformioEnv({ rawText, envName });
    if (!ok) {
        const fields = violations.slice(0, 20).map((v) => ({
            name: `Line ${v.line}`,
            value: `\`${v.text.slice(0, 200)}\`\n${v.reason}`,
        }));
        await interaction.reply({ embeds: [errorEmbed('❌ Configuration rejected', fields)] });
        return;
    }

    await interaction.reply('Queued...');

    buildQueue.enqueue({
        label: `build:${envName}:${interaction.user.id}`,
        onQueued: (position) => {
            safeEditReply(interaction, `⏳ Queued (position ${position}).`);
        },
        onStart: () => {
            safeEditReply(interaction, '🔧 Build started...');
        },
        run: () => runOneBuild(interaction, envName, sanitizedIni, branch, externalCustomUsermods, bareCustomUsermods),
    });
}

async function runOneBuild(interaction, envName, sanitizedIni, branch, externalCustomUsermods = [], bareCustomUsermods = []) {
    await ensureLogDir();
    pruneOldLogs().catch(() => {});
    pruneStaleBuildDirs().catch(() => {});

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(LOG_DIR, `build-${timestamp}-${envName}.log`);
    const logStream = createLogStream(logPath);

    let progressTimer = null;
    const startedAt = Date.now();
    const startProgress = () => {
        progressTimer = setInterval(() => {
            const elapsedMin = Math.round((Date.now() - startedAt) / 60000);
            safeEditReply(interaction, `🔧 Build running for ${elapsedMin} minute(s)...⏳`);
        }, PROGRESS_UPDATE_INTERVAL_MS);
    };
    const stopProgress = () => {
        if (progressTimer) clearInterval(progressTimer);
        progressTimer = null;
    };

    const pipeToLog = (child) => {
        child.stdout.on('data', (d) => logStream.write(d));
        child.stderr.on('data', (d) => logStream.write(d));
    };

    try {
        await safeEditReply(interaction, `📥 Fetching branch '${branch}'...`);
        const checkout = await fetchAndCheckout({ gitPath: GIT_PATH, branch, timeoutMs: GIT_TIMEOUT_MS });
        if (!checkout.ok) {
            await safeEditReply(interaction, `❌ ${checkout.message}`);
            return;
        }

        await cleanEnvOutput(envName);

        // Kein manueller "npm ci"-Schritt hier: WLEDs eigene platformio.ini bindet
        // pio-scripts/build_ui.py als pre:-extra_script ein, das npm ci/npm run build bereits
        // selbst ausführt (via PlatformIOs env.Execute(), das korrekt shell-aufgelöst wird).
        // Ein zusätzlicher, eigener `spawn('npm', ...)`-Aufruf war nicht nur redundant, sondern
        // schlug auf Windows mit "spawn npm ENOENT" fehl (npm ist dort npm.cmd, kein direktes
        // Executable) - und zwar bevor irgendein stdout/stderr anfiel, daher ein leeres Logfile.

        const overridePath = path.join(GIT_PATH, 'platformio_override.ini');
        const environmentConfig = `[platformio]\ndefault_envs = ${envName}\n\n${sanitizedIni}\n`;
        await fsp.writeFile(overridePath, environmentConfig);

        await safeEditReply(interaction, '📚 Fetching library dependencies...');
        // custom_usermods-Einträge, die wie externe Referenzen aussehen (URL/owner-Name/etc.),
        // werden hier per -l explizit mitgefetcht - dieselbe Route wie lib_deps, damit sie vom
        // anschließenden libScanner erfasst werden, BEVOR pio-scripts/load_usermods.py sie während
        // des echten "pio run" erneut (und potenziell mit Build-Hook-Ausführung) verarbeitet.
        const pkgInstallArgs = ['pkg', 'install', '-d', GIT_PATH, '-e', envName];
        for (const spec of externalCustomUsermods) {
            pkgInstallArgs.push('-l', spec);
        }
        const libFetch = await spawnWithTimeout('pio', pkgInstallArgs, { onSpawn: pipeToLog }, LIB_FETCH_TIMEOUT_MS);
        if (libFetch.error || libFetch.timedOut || libFetch.code !== 0) {
            await logStream.end();
            await safeEditReply(interaction, { content: '❌ Failed to fetch library dependencies. See attached log.', files: attachLogs(logPath) });
            return;
        }

        const trustedUsermodNames = resolveTrustedUsermodNames(GIT_PATH, bareCustomUsermods);
        const { ok: scanOk, findings } = await scanFetchedLibs(GIT_PATH, envName, trustedUsermodNames);
        if (!scanOk) {
            await logStream.end();
            const fields = findings.slice(0, 10).map((f) => ({ name: f.library, value: `${f.detail}\n\`${f.file}\`` }));
            await safeEditReply(interaction, {
                content: '❌ Build aborted: a referenced library contains a build hook.',
                embeds: [errorEmbed('⚠️ Suspicious library found', fields)],
            });
            return;
        }

        startProgress();
        await safeEditReply(interaction, '🔧 Building firmware...⏳');
        const build = await spawnWithTimeout('pio', ['run', '-j', String(PIO_JOBS), '-d', GIT_PATH], { onSpawn: pipeToLog }, BUILD_TIMEOUT_MS);
        stopProgress();
        await logStream.end();

        if (build.timedOut) {
            await safeEditReply(interaction, { content: `❌ Build exceeded the time limit (${Math.round(BUILD_TIMEOUT_MS / 60000)} min) and was aborted.`, files: attachLogs(logPath) });
            return;
        }
        if (build.error || build.code !== 0) {
            await safeEditReply(interaction, {
                content: '❌ Build failed. Log file and environment file are attached below.',
                files: attachLogs(logPath, [new AttachmentBuilder(overridePath)]),
            });
            return;
        }

        const firmwarePath = findFirmwarePath(envName);
        if (!firmwarePath) {
            await safeEditReply(interaction, { content: '❌ Build reported success, but firmware.bin was not found at any of the expected locations.', files: attachLogs(logPath) });
            return;
        }

        await safeEditReply(interaction, {
            content: '✅ Build successful. Files are attached below.',
            files: [new AttachmentBuilder(firmwarePath), new AttachmentBuilder(overridePath)],
        });
    } catch (err) {
        console.error('Unexpected error in build job:', err);
        try { await logStream.end(); } catch { /* ignore */ }
        await safeEditReply(interaction, `❌ Unexpected error: ${err.message}`);
    } finally {
        stopProgress();
    }
}

module.exports = { handleChatInput, handleModalSubmit, autocompleteBranch };
