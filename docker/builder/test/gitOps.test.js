const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { cloneBranch, isValidBranchName } = require('../lib/gitOps');

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
});

function git(cwd, args) {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('gitOps: cloneBranch klont den angeforderten Branch frisch', async (t) => {
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-gitops-origin-'));
    const destDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'builder-gitops-dest-')), 'checkout');

    git(originDir, ['init', '-q', '-b', 'main']);
    git(originDir, ['config', 'user.email', 'test@example.com']);
    git(originDir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(originDir, 'file.txt'), 'v1');
    git(originDir, ['add', '.']);
    git(originDir, ['commit', '-q', '-m', 'init']);
    git(originDir, ['tag', 'v1.0.0']);
    git(originDir, ['branch', 'feature-branch']);

    t.after(() => {
        fs.rmSync(originDir, { recursive: true, force: true });
        fs.rmSync(path.dirname(destDir), { recursive: true, force: true });
    });

    const result = await cloneBranch({ repoUrl: originDir, branch: 'feature-branch', destDir, timeoutMs: TIMEOUT_MS });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(path.join(destDir, 'file.txt'), 'utf8'), 'v1');

    // volle Historie (kein --depth) - "git describe" muss funktionieren, das nutzt WLEDs
    // set_version.py für die Firmware-Versionskennung
    const describe = git(destDir, ['describe', '--tags']).trim();
    assert.equal(describe, 'v1.0.0');
});

test('gitOps: cloneBranch lehnt ungültigen Branch-Namen vor jedem git-Aufruf ab', async () => {
    const result = await cloneBranch({ repoUrl: '/nonexistent', branch: '../evil', destDir: '/tmp/should-not-be-created', timeoutMs: TIMEOUT_MS });
    assert.equal(result.ok, false);
    assert.match(result.message, /Invalid branch/);
});

test('gitOps: cloneBranch meldet sauber, wenn Branch nicht existiert', async (t) => {
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-gitops-origin2-'));
    const destDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'builder-gitops-dest2-')), 'checkout');

    git(originDir, ['init', '-q', '-b', 'main']);
    git(originDir, ['config', 'user.email', 'test@example.com']);
    git(originDir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(originDir, 'file.txt'), 'v1');
    git(originDir, ['add', '.']);
    git(originDir, ['commit', '-q', '-m', 'init']);

    t.after(() => {
        fs.rmSync(originDir, { recursive: true, force: true });
        fs.rmSync(path.dirname(destDir), { recursive: true, force: true });
    });

    const result = await cloneBranch({ repoUrl: originDir, branch: 'does-not-exist', destDir, timeoutMs: TIMEOUT_MS });
    assert.equal(result.ok, false);
});
