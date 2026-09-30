const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { listRemoteRefs, getDefaultBranch, isValidBranchName } = require('../../commands/build/lib/branchLookup');

const TIMEOUT_MS = 15000;

test('isValidBranchName: gültige Namen', () => {
    assert.equal(isValidBranchName('main'), true);
    assert.equal(isValidBranchName('release/0.15'), true);
    assert.equal(isValidBranchName('v1.2.3-beta'), true);
});

test('isValidBranchName: ungültige Namen', () => {
    assert.equal(isValidBranchName('../evil'), false);
    assert.equal(isValidBranchName('-x'), false);
    assert.equal(isValidBranchName('a..b'), false);
    assert.equal(isValidBranchName('foo;rm -rf /'), false);
    assert.equal(isValidBranchName(''), false);
    assert.equal(isValidBranchName(null), false);
});

function git(cwd, args) {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('branchLookup: listRemoteRefs/getDefaultBranch funktionieren ohne lokalen Checkout', async (t) => {
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'branchlookup-origin-'));

    git(originDir, ['init', '-q', '-b', 'main']);
    git(originDir, ['config', 'user.email', 'test@example.com']);
    git(originDir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(originDir, 'file.txt'), 'v1');
    git(originDir, ['add', '.']);
    git(originDir, ['commit', '-q', '-m', 'init']);
    git(originDir, ['branch', 'feature-branch']);
    git(originDir, ['tag', '-a', 'v1.0.0', '-m', 'annotated tag']);

    t.after(() => {
        fs.rmSync(originDir, { recursive: true, force: true });
    });

    // Wichtig: hier wird NUR die Remote-URL übergeben, kein gitPath/lokaler Checkout -
    // genau der Punkt dieses Moduls (Orchestrator braucht keinen WLED-Checkout mehr).
    const defaultBranch = await getDefaultBranch(originDir, TIMEOUT_MS);
    assert.equal(defaultBranch, 'main');

    const refs = await listRemoteRefs(originDir, TIMEOUT_MS);
    assert.ok(refs.includes('main'));
    assert.ok(refs.includes('feature-branch'));
    assert.ok(refs.includes('v1.0.0'));
    assert.ok(!refs.some((r) => r.endsWith('^{}')));
});

test('branchLookup: liefert leere/null-Ergebnisse statt zu werfen, wenn die Remote nicht existiert', async () => {
    const refs = await listRemoteRefs('/nonexistent/path', TIMEOUT_MS);
    assert.deepEqual(refs, []);

    const defaultBranch = await getDefaultBranch('/nonexistent/path', TIMEOUT_MS);
    assert.equal(defaultBranch, null);
});
