const { spawnWithTimeout } = require('./processUtil');

const BRANCH_NAME_RE = /^[A-Za-z0-9_.\/-]{1,100}$/;

function isValidBranchName(branch) {
    if (typeof branch !== 'string' || branch.length === 0) return false;
    if (!BRANCH_NAME_RE.test(branch)) return false;
    if (branch.startsWith('-')) return false;
    if (branch.includes('..')) return false;
    if (branch.includes('@{')) return false;
    return true;
}

// Läuft ausschließlich gegen die feste, vertrauenswürdige Remote-URL - braucht dafür KEINEN
// lokalen WLED-Checkout mehr auf dem Orchestrator-Host (anders als früher). Das hält den
// Orchestrator absichtlich "dünn": er soll nichts vom eigentlichen WLED-Quellcode berühren,
// das passiert ausschließlich im sandboxed Builder-Container (siehe docker/builder/).
async function captureStdout(args, timeoutMs) {
    let stdout = '';
    const result = await spawnWithTimeout('git', args, {
        onSpawn: (child) => {
            child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        },
    }, timeoutMs);
    return { ...result, stdout };
}

async function listRemoteRefs(repoUrl, timeoutMs) {
    const result = await captureStdout(['ls-remote', '--heads', '--tags', repoUrl], timeoutMs);
    if (result.error || result.timedOut || result.code !== 0) {
        return [];
    }
    const refs = new Set();
    for (const line of result.stdout.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        if (parts[1].endsWith('^{}')) continue; // dereferenzierter Commit eines annotierten Tags, kein eigener Ref-Name
        const match = parts[1].match(/^refs\/(?:heads|tags)\/(.+)$/);
        if (match) refs.add(match[1]);
    }
    return Array.from(refs).sort();
}

async function getDefaultBranch(repoUrl, timeoutMs) {
    const result = await captureStdout(['ls-remote', '--symref', repoUrl, 'HEAD'], timeoutMs);
    if (result.error || result.timedOut || result.code !== 0) return null;
    const match = result.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m);
    return match ? match[1] : null;
}

module.exports = { listRemoteRefs, getDefaultBranch, isValidBranchName, BRANCH_NAME_RE };
