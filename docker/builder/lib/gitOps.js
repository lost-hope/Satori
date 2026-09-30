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

async function runGitStep(cwd, args, timeoutMs, onSpawn) {
    const result = await spawnWithTimeout('git', args, { cwd, onSpawn }, timeoutMs);
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

// Der Builder-Container ist pro Build frisch (docker run --rm) - es gibt daher keinen
// bestehenden Checkout, den man per "git reset --hard" bereinigen müsste. Ein einfacher,
// flacher Clone des angeforderten Branches ist sowohl einfacher als auch sicherer: kein Zustand
// kann zwischen Builds überleben (anders als bei einem wiederverwendeten, langlebigen Checkout).
async function cloneBranch({ repoUrl, branch, destDir, timeoutMs, onSpawn }) {
    if (!isValidBranchName(branch)) {
        return { ok: false, message: `Invalid branch/tag name: '${branch}'.` };
    }

    // Kein --depth: WLEDs eigene pio-scripts/set_version.py verwendet "git describe" für die
    // Versions-Zeichenkette im Firmware-Build - ein Shallow-Clone würde das brechen (describe
    // braucht Zugriff auf die Tag-Historie). --single-branch hält den Transfer trotzdem klein,
    // da nur der angeforderte Branch/Tag geholt wird, nicht alle Remote-Branches.
    return runGitStep(
        process.cwd(),
        ['clone', '--branch', branch, '--single-branch', repoUrl, destDir],
        timeoutMs,
        onSpawn,
    );
}

module.exports = { cloneBranch, isValidBranchName, BRANCH_NAME_RE };
