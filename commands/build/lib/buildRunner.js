const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');

const { listRemoteRefs, getDefaultBranch, isValidBranchName } = require('./branchLookup');
const { runBuildContainer } = require('./dockerRunner');
const buildQueue = require('./buildQueue');

let config = {};
try {
    config = require('../../../config.json');
} catch {
    config = {};
}

const WLED_REPO_URL = config.wledRepoUrl || 'https://github.com/wled/WLED.git';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const MODAL_CUSTOM_ID = 'buildModal';
const MAX_LOG_FILES = 20;
const MAX_LOG_BYTES = config.maxLogBytes ?? 5 * 1024 * 1024;
const GIT_TIMEOUT_MS = config.gitTimeoutMs ?? 60 * 1000;
const BRANCH_CACHE_TTL_MS = config.branchCacheTtlMs ?? 60 * 1000;
const DEFAULT_BRANCH_LOOKUP_TIMEOUT_MS = 2000;
const PENDING_BRANCH_TTL_MS = 10 * 60 * 1000;

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
        const refs = await listRemoteRefs(WLED_REPO_URL, GIT_TIMEOUT_MS);
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
        branch = (await getDefaultBranch(WLED_REPO_URL, DEFAULT_BRANCH_LOOKUP_TIMEOUT_MS)) ?? 'main';
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

    const branch = consumeBranch(interaction.user.id);
    if (!branch) {
        await interaction.reply({
            embeds: [errorEmbed('❌', [{ name: 'Error', value: 'Could not match the selected branch anymore (timed out). Please run /build again.' }])],
        });
        return;
    }

    await interaction.reply('Queued...');

    buildQueue.enqueue({
        label: `build:${interaction.user.id}:${Date.now()}`,
        onQueued: (position) => {
            safeEditReply(interaction, `⏳ Queued (position ${position}).`);
        },
        onStart: () => {
            safeEditReply(interaction, '🔧 Build started...');
        },
        run: () => runOneBuild(interaction, rawText, branch),
    });
}

async function runOneBuild(interaction, rawText, branch) {
    await ensureLogDir();
    pruneOldLogs().catch(() => {});

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(LOG_DIR, `build-${timestamp}.log`);
    const logStream = createLogStream(logPath);

    let progressTimer = null;
    let lastProgressMessage = '🔧 Build running...⏳';
    const startedAt = Date.now();
    const startProgress = () => {
        progressTimer = setInterval(() => {
            const elapsedMin = Math.round((Date.now() - startedAt) / 60000);
            safeEditReply(interaction, `${lastProgressMessage} (${elapsedMin} min)`);
        }, 90 * 1000);
    };
    const stopProgress = () => {
        if (progressTimer) clearInterval(progressTimer);
        progressTimer = null;
    };

    let container = null;
    try {
        startProgress();
        container = await runBuildContainer({
            envInput: rawText,
            branch,
            onProgress: (message) => {
                lastProgressMessage = `🔧 ${message}`;
                safeEditReply(interaction, lastProgressMessage);
            },
            onLogChunk: (chunk) => logStream.write(chunk),
        });
        stopProgress();
        await logStream.end();

        if (container.dockerTimedOut) {
            await safeEditReply(interaction, { content: '❌ Build exceeded the overall time limit and was aborted.', files: attachLogs(logPath) });
            return;
        }
        if (container.dockerError) {
            await safeEditReply(interaction, { content: `❌ Could not start the build container: ${container.dockerError.message}`, files: attachLogs(logPath) });
            return;
        }

        const result = container.jobResult;
        if (!result) {
            await safeEditReply(interaction, { content: '❌ Build container exited without a result. See attached log.', files: attachLogs(logPath) });
            return;
        }

        const overrideFile = container.overridePath ? [new AttachmentBuilder(container.overridePath, { name: 'platformio_override.ini' })] : [];

        if (result.status === 'sanitize_rejected') {
            const fields = (result.violations || []).slice(0, 20).map((v) => ({
                name: `Line ${v.line}`,
                value: `\`${(v.text || '').slice(0, 200)}\`\n${v.reason}`,
            }));
            await safeEditReply(interaction, { embeds: [errorEmbed('❌ Configuration rejected', fields)] });
            return;
        }

        if (result.status === 'scan_rejected') {
            const fields = (result.findings || []).slice(0, 10).map((f) => ({ name: f.library, value: `${f.detail}\n\`${f.file}\`` }));
            await safeEditReply(interaction, {
                content: '❌ Build aborted: a referenced library contains a build hook.',
                embeds: [errorEmbed('⚠️ Suspicious library found', fields)],
            });
            return;
        }

        if (result.status === 'build_timeout') {
            await safeEditReply(interaction, { content: `❌ Build exceeded the time limit (${result.timeoutMinutes} min) and was aborted.`, files: attachLogs(logPath, overrideFile) });
            return;
        }

        if (result.status === 'build_failed' || result.status === 'internal_error') {
            await safeEditReply(interaction, {
                content: `❌ Build failed. ${result.message || ''}`.trim(),
                files: attachLogs(logPath, overrideFile),
            });
            return;
        }

        if (result.status === 'success' && container.firmwarePath) {
            await safeEditReply(interaction, {
                content: '✅ Build successful. Files are attached below.',
                files: [new AttachmentBuilder(container.firmwarePath, { name: 'firmware.bin' }), ...overrideFile],
            });
            return;
        }

        await safeEditReply(interaction, { content: '❌ Build reported success, but firmware.bin was not found.', files: attachLogs(logPath, overrideFile) });
    } catch (err) {
        console.error('Unexpected error in build job:', err);
        try { await logStream.end(); } catch { /* ignore */ }
        await safeEditReply(interaction, `❌ Unexpected error: ${err.message}`);
    } finally {
        stopProgress();
        if (container) await container.cleanup();
    }
}

module.exports = { handleChatInput, handleModalSubmit, autocompleteBranch };
