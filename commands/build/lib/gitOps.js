const fs = require('node:fs');
const path = require('node:path');
const { spawnWithTimeout } = require('./processUtil');

const BRANCH_NAME_RE = /^[A-Za-z0-9_.\/-]{1,100}$/;

// spawn() wirft ENOENT sowohl wenn der Befehl selbst fehlt ALS AUCH wenn das übergebene cwd nicht
// existiert - Node unterscheidet das in der Fehlermeldung nicht ("spawn git ENOENT" sieht in
// beiden Fällen identisch aus). Ein fehlendes/falsch benanntes cwd (z.B. weil "git clone <url>"
// ohne Zielverzeichnis-Argument lief und dadurch nach dem Repo-Namen in der URL benennt - hier
// "WLED" statt des von uns erwarteten "wled", Linux ist case-sensitiv) ist ein sehr plausibler,
// leicht zu übersehender Fehler beim manuellen Setup. Diese Prüfung macht das explizit, statt es
// den Nutzer über einen kryptischen ENOENT selbst herausfinden zu lassen.
function checkRepoExists(gitPath) {
    if (fs.existsSync(path.join(gitPath, '.git'))) {
        return { ok: true };
    }

    let hint = '';
    try {
        const parentDir = path.dirname(gitPath);
        const expectedName = path.basename(gitPath);
        const siblings = fs.readdirSync(parentDir);
        const caseInsensitiveMatch = siblings.find((name) => name.toLowerCase() === expectedName.toLowerCase() && name !== expectedName);
        if (caseInsensitiveMatch) {
            hint = ` Found '${caseInsensitiveMatch}' in the same directory instead - likely a case mismatch (e.g. "git clone <url>" without an explicit destination directory names the folder after the repo, not necessarily matching the expected lowercase name).`;
        }
    } catch {
        // Eltern-Verzeichnis selbst nicht lesbar - kein zusätzlicher Hinweis möglich
    }

    return { ok: false, message: `WLED checkout not found at '${gitPath}' (no .git directory there).${hint} See docs/build-repo-setup.md.` };
}

function isValidBranchName(branch) {
    if (typeof branch !== 'string' || branch.length === 0) return false;
    if (!BRANCH_NAME_RE.test(branch)) return false;
    if (branch.startsWith('-')) return false;
    if (branch.includes('..')) return false;
    if (branch.includes('@{')) return false;
    return true;
}

async function captureStdout(args, gitPath, timeoutMs) {
    let stdout = '';
    const result = await spawnWithTimeout('git', args, {
        cwd: gitPath,
        onSpawn: (child) => {
            child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        },
    }, timeoutMs);
    return { ...result, stdout };
}

async function runGitStep(gitPath, args, timeoutMs) {
    const result = await spawnWithTimeout('git', args, { cwd: gitPath }, timeoutMs);
    if (result.error) {
        return { ok: false, message: `git ${args.join(' ')} could not be started: ${result.error.message}` };
    }
    if (result.timedOut) {
        return { ok: false, message: `git ${args.join(' ')} timed out.` };
    }
    if (result.code !== 0) {
        return { ok: false, message: `git ${args.join(' ')} failed with code ${result.code}.` };
    }
    return { ok: true };
}

// Nutzt fetch + checkout -B + reset --hard statt eines blinden "git pull", damit lokale Reste
// (z.B. platformio_override.ini oder .pio-Artefakte eines vorherigen Laufs) den Checkout nicht
// blockieren und jeder Build von einem garantiert sauberen, deterministischen Stand startet.
async function fetchAndCheckout({ gitPath, branch, timeoutMs }) {
    if (!isValidBranchName(branch)) {
        return { ok: false, message: `Invalid branch/tag name: '${branch}'.` };
    }

    const repoCheck = checkRepoExists(gitPath);
    if (!repoCheck.ok) return repoCheck;

    let step = await runGitStep(gitPath, ['fetch', 'origin', '--prune'], timeoutMs);
    if (!step.ok) return step;

    step = await runGitStep(gitPath, ['checkout', '-B', branch, `origin/${branch}`], timeoutMs);
    if (!step.ok) {
        return { ok: false, message: `Branch/tag '${branch}' was not found on the remote.` };
    }

    step = await runGitStep(gitPath, ['reset', '--hard', `origin/${branch}`], timeoutMs);
    if (!step.ok) return step;

    return { ok: true };
}

async function listRemoteRefs(gitPath, timeoutMs) {
    const repoCheck = checkRepoExists(gitPath);
    if (!repoCheck.ok) {
        console.error(repoCheck.message);
        return [];
    }

    const result = await captureStdout(['ls-remote', '--heads', '--tags', 'origin'], gitPath, timeoutMs);
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

// Liest den lokal bekannten Default-Branch des Remotes (kein Netzwerk-Call, nur ein lokaler
// Ref-Lookup) - sicher genug, um vor dem showModal-Aufruf (3s-Zeitlimit) awaited zu werden.
async function getDefaultBranch(gitPath, timeoutMs) {
    const repoCheck = checkRepoExists(gitPath);
    if (!repoCheck.ok) {
        console.error(repoCheck.message);
        return null;
    }

    const result = await captureStdout(['rev-parse', '--abbrev-ref', 'origin/HEAD'], gitPath, timeoutMs);
    if (result.error || result.timedOut || result.code !== 0) return null;
    const ref = result.stdout.trim();
    if (!ref) return null;
    return ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref;
}

module.exports = { fetchAndCheckout, listRemoteRefs, getDefaultBranch, isValidBranchName, checkRepoExists, BRANCH_NAME_RE };
