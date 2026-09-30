const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { extractEnvName, sanitizePlatformioEnv } = require('./iniSanitizer');
const { scanFetchedLibs, resolveTrustedUsermodNames } = require('./libScanner');
const { spawnWithTimeout } = require('./processUtil');
const { cloneBranch, isValidBranchName } = require('./gitOps');

const WLED_REPO_URL = process.env.WLED_REPO_URL || 'https://github.com/wled/WLED.git';
const WORK_DIR = process.env.BUILD_WORK_DIR || '/tmp/wled';
const INPUT_DIR = process.env.BUILD_INPUT_DIR || '/input';
const OUTPUT_DIR = process.env.BUILD_OUTPUT_DIR || '/output';

const GIT_TIMEOUT_MS = Number(process.env.GIT_TIMEOUT_MS) || 5 * 60 * 1000;
const LIB_FETCH_TIMEOUT_MS = Number(process.env.LIB_FETCH_TIMEOUT_MS) || 5 * 60 * 1000;
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS) || 20 * 60 * 1000;
const PIO_JOBS = Number(process.env.PIO_JOBS) || 1;

function progress(message) {
    // Von der Orchestrator-Seite per Präfix erkannt und als Discord-Statusupdate weitergereicht
    // (siehe commands/build/lib/dockerRunner.js) - alles andere landet nur im Build-Log.
    console.log(`::progress::${message}`);
}

function pipeToStdio(child) {
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
}

async function writeResult(result) {
    await fsp.mkdir(OUTPUT_DIR, { recursive: true });
    await fsp.writeFile(path.join(OUTPUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
}

function findFirmwarePath(envName) {
    const candidates = [
        path.join(WORK_DIR, '.pio', 'build', envName, 'firmware.bin'),
        path.join(WORK_DIR, 'build_output', 'firmware', `${envName}.bin`),
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
}

async function copyToOutput(srcPath, destName) {
    await fsp.mkdir(OUTPUT_DIR, { recursive: true });
    await fsp.copyFile(srcPath, path.join(OUTPUT_DIR, destName));
}

async function run() {
    let job;
    try {
        job = JSON.parse(await fsp.readFile(path.join(INPUT_DIR, 'job.json'), 'utf8'));
    } catch (err) {
        await writeResult({ status: 'internal_error', message: `Could not read job input: ${err.message}` });
        process.exitCode = 1;
        return;
    }

    const { envInput, branch } = job;

    const { envName, error: envError } = extractEnvName(envInput);
    if (envError) {
        await writeResult({ status: 'sanitize_rejected', violations: [{ line: 0, text: '', reason: envError }] });
        return;
    }

    if (!isValidBranchName(branch)) {
        await writeResult({ status: 'internal_error', message: `Invalid branch/tag name: '${branch}'.` });
        return;
    }

    const { ok, sanitizedIni, violations, externalCustomUsermods, bareCustomUsermods } = sanitizePlatformioEnv({ rawText: envInput, envName });
    if (!ok) {
        await writeResult({ status: 'sanitize_rejected', envName, violations });
        return;
    }

    progress(`Fetching branch '${branch}'...`);
    const checkout = await cloneBranch({ repoUrl: WLED_REPO_URL, branch, destDir: WORK_DIR, timeoutMs: GIT_TIMEOUT_MS, onSpawn: pipeToStdio });
    if (!checkout.ok) {
        await writeResult({ status: 'build_failed', envName, message: checkout.message });
        return;
    }

    const overridePath = path.join(WORK_DIR, 'platformio_override.ini');
    const environmentConfig = `[platformio]\ndefault_envs = ${envName}\n\n${sanitizedIni}\n`;
    await fsp.writeFile(overridePath, environmentConfig);
    await copyToOutput(overridePath, 'platformio_override.ini');

    progress('Fetching library dependencies...');
    const pkgInstallArgs = ['pkg', 'install', '-d', WORK_DIR, '-e', envName];
    for (const spec of externalCustomUsermods) {
        pkgInstallArgs.push('-l', spec);
    }
    const libFetch = await spawnWithTimeout('pio', pkgInstallArgs, { onSpawn: pipeToStdio }, LIB_FETCH_TIMEOUT_MS);
    if (libFetch.error || libFetch.timedOut || libFetch.code !== 0) {
        await writeResult({ status: 'build_failed', envName, message: 'Failed to fetch library dependencies.' });
        return;
    }

    const trustedUsermodNames = resolveTrustedUsermodNames(WORK_DIR, bareCustomUsermods);
    const { ok: scanOk, findings } = await scanFetchedLibs(WORK_DIR, envName, trustedUsermodNames);
    if (!scanOk) {
        await writeResult({ status: 'scan_rejected', envName, findings });
        return;
    }

    progress('Building firmware...');
    const build = await spawnWithTimeout('pio', ['run', '-j', String(PIO_JOBS), '-d', WORK_DIR], { onSpawn: pipeToStdio }, BUILD_TIMEOUT_MS);

    if (build.timedOut) {
        await writeResult({ status: 'build_timeout', envName, timeoutMinutes: Math.round(BUILD_TIMEOUT_MS / 60000) });
        return;
    }
    if (build.error || build.code !== 0) {
        await writeResult({ status: 'build_failed', envName, message: 'pio run failed.' });
        return;
    }

    const firmwarePath = findFirmwarePath(envName);
    if (!firmwarePath) {
        await writeResult({ status: 'build_failed', envName, message: 'Build reported success, but firmware.bin was not found at any expected location.' });
        return;
    }

    await copyToOutput(firmwarePath, 'firmware.bin');
    await writeResult({ status: 'success', envName });
}

module.exports = { run };
