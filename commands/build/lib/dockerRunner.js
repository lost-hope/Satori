const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

const { spawnWithTimeout } = require('./processUtil');

let config = {};
try {
    config = require('../../../config.json');
} catch {
    config = {};
}

const DOCKER_IMAGE = config.dockerImage || 'satori-builder:latest';
const DOCKER_NETWORK = config.dockerNetwork || 'satori-builder-net';
const DOCKER_PIO_VOLUME = config.dockerPioVolume || 'satori-pio-cache';
const DOCKER_MEMORY_LIMIT = config.dockerMemoryLimit || '3g';
const DOCKER_CPU_LIMIT = String(config.dockerCpuLimit ?? '2');
const DOCKER_PIDS_LIMIT = String(config.dockerPidsLimit ?? 512);
const DOCKER_TMPFS_SIZE = config.dockerTmpfsSize || '2g';
const WORKSPACE_ROOT = config.builderWorkspaceDir
    ? path.resolve(config.builderWorkspaceDir)
    : path.join(__dirname, '..', 'jobs');

const GIT_TIMEOUT_MS = config.gitTimeoutMs ?? 5 * 60 * 1000;
const LIB_FETCH_TIMEOUT_MS = config.libFetchTimeoutMs ?? 5 * 60 * 1000;
const BUILD_TIMEOUT_MS = config.buildTimeoutMs ?? 20 * 60 * 1000;
const PIO_JOBS = config.pioJobs ?? 1;
// Gesamt-Timeout für den "docker run"-Aufruf selbst: Summe der Phasen-Timeouts plus Puffer für
// Image-Start/Cleanup. Die einzelnen Phasen werden zusätzlich INNERHALB des Containers per
// eigenem Timeout begrenzt (siehe docker/builder/lib/buildJob.js) - das hier ist nur das äußere
// Sicherheitsnetz, falls der Container aus einem anderen Grund hängen bleibt.
const OVERALL_TIMEOUT_MS = GIT_TIMEOUT_MS + LIB_FETCH_TIMEOUT_MS + BUILD_TIMEOUT_MS + 60 * 1000;

let infraEnsured = false;

// Idempotent - "bereits vorhanden" wird ignoriert, alles andere wird nicht verschluckt, damit ein
// echtes Docker-Problem (z.B. Daemon nicht erreichbar) sichtbar bleibt statt still zu verpuffen.
async function ensureInfra() {
    if (infraEnsured) return;
    await spawnWithTimeout('docker', ['network', 'create', DOCKER_NETWORK], {}, 15000);
    await spawnWithTimeout('docker', ['volume', 'create', DOCKER_PIO_VOLUME], {}, 15000);
    infraEnsured = true;
}

function splitLines(handler) {
    let buffer = '';
    return (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) handler(line);
    };
}

async function runBuildContainer({ envInput, branch, onProgress, onLogChunk }) {
    await ensureInfra();

    const jobId = randomUUID();
    const jobDir = path.join(WORKSPACE_ROOT, jobId);
    const inputDir = path.join(jobDir, 'input');
    const outputDir = path.join(jobDir, 'output');
    await fsp.mkdir(inputDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(path.join(inputDir, 'job.json'), JSON.stringify({ envInput, branch }));

    const containerName = `satori-build-${jobId}`;
    const args = [
        'run', '--rm',
        '--name', containerName,
        '--network', DOCKER_NETWORK,
        '--cap-drop=ALL',
        '--security-opt', 'no-new-privileges',
        '--pids-limit', DOCKER_PIDS_LIMIT,
        '--memory', DOCKER_MEMORY_LIMIT,
        '--cpus', DOCKER_CPU_LIMIT,
        '--read-only',
        '--tmpfs', `/tmp:rw,size=${DOCKER_TMPFS_SIZE}`,
        '-v', `${inputDir}:/input:ro`,
        '-v', `${outputDir}:/output:rw`,
        '-v', `${DOCKER_PIO_VOLUME}:/home/builder/.platformio:rw`,
        '-e', `GIT_TIMEOUT_MS=${GIT_TIMEOUT_MS}`,
        '-e', `LIB_FETCH_TIMEOUT_MS=${LIB_FETCH_TIMEOUT_MS}`,
        '-e', `BUILD_TIMEOUT_MS=${BUILD_TIMEOUT_MS}`,
        '-e', `PIO_JOBS=${PIO_JOBS}`,
        DOCKER_IMAGE,
    ];

    const onStdoutLine = splitLines((line) => {
        const match = line.match(/^::progress::(.*)$/);
        if (match && typeof onProgress === 'function') {
            onProgress(match[1]);
            return;
        }
        if (typeof onLogChunk === 'function') onLogChunk(line + '\n');
    });
    const onStderrLine = splitLines((line) => {
        if (typeof onLogChunk === 'function') onLogChunk(line + '\n');
    });

    const result = await spawnWithTimeout('docker', args, {
        onSpawn: (child) => {
            child.stdout.on('data', onStdoutLine);
            child.stderr.on('data', onStderrLine);
        },
    }, OVERALL_TIMEOUT_MS);

    let jobResult = null;
    try {
        jobResult = JSON.parse(await fsp.readFile(path.join(outputDir, 'result.json'), 'utf8'));
    } catch {
        // Container hat kein result.json geschrieben (z.B. durch Timeout/Kill abgebrochen)
        jobResult = null;
    }

    const firmwarePath = path.join(outputDir, 'firmware.bin');
    const overridePath = path.join(outputDir, 'platformio_override.ini');

    return {
        dockerTimedOut: result.timedOut,
        dockerError: result.error,
        dockerExitCode: result.code,
        jobResult,
        firmwarePath: fs.existsSync(firmwarePath) ? firmwarePath : null,
        overridePath: fs.existsSync(overridePath) ? overridePath : null,
        cleanup: () => fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {}),
    };
}

module.exports = { runBuildContainer, ensureInfra, WORKSPACE_ROOT };
