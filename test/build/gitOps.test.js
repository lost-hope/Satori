const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { fetchAndCheckout, listRemoteRefs, getDefaultBranch, isValidBranchName, checkRepoExists } = require('../../commands/build/lib/gitOps');

const TIMEOUT_MS = 15000;

// Laufzeit-Check statt process.platform-Annahme: NTFS (Windows) und die Standard-Konfiguration
// von APFS/HFS+ (macOS) sind case-insensitiv, das Produktivsystem (Linux) ist es normalerweise
// nicht - aber das ist in allen drei Fällen konfigurierbar, daher lieber direkt prüfen.
const FS_IS_CASE_SENSITIVE = (() => {
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'case-probe-'));
    const lower = path.join(probeDir, 'probe');
    fs.mkdirSync(lower);
    const isSensitive = !fs.existsSync(path.join(probeDir, 'PROBE'));
    fs.rmSync(probeDir, { recursive: true, force: true });
    return isSensitive;
})();

test('isValidBranchName: gültige Namen', () => {
    assert.equal(isValidBranchName('main'), true);
    assert.equal(isValidBranchName('release/0.15'), true);
    assert.equal(isValidBranchName('v1.2.3-beta'), true);
    assert.equal(isValidBranchName('feature_x'), true);
});

test('isValidBranchName: ungültige Namen', () => {
    assert.equal(isValidBranchName('../evil'), false);
    assert.equal(isValidBranchName('-x'), false);
    assert.equal(isValidBranchName('a..b'), false);
    assert.equal(isValidBranchName('foo;rm -rf /'), false);
    assert.equal(isValidBranchName('foo bar'), false);
    assert.equal(isValidBranchName('a@{1}'), false);
    assert.equal(isValidBranchName(''), false);
    assert.equal(isValidBranchName(null), false);
});

function git(cwd, args) {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

test('gitOps: fetchAndCheckout gegen ein lokales Wegwerf-Repo', async (t) => {
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-origin-'));
    const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-clone-'));

    git(originDir, ['init', '-q', '-b', 'main']);
    git(originDir, ['config', 'user.email', 'test@example.com']);
    git(originDir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(originDir, 'file.txt'), 'v1');
    git(originDir, ['add', '.']);
    git(originDir, ['commit', '-q', '-m', 'init']);
    git(originDir, ['branch', 'feature-branch']);
    git(originDir, ['tag', '-a', 'v1.0.0', '-m', 'annotated tag']);

    git(os.tmpdir(), ['clone', '-q', originDir, cloneDir]);

    t.after(() => {
        fs.rmSync(originDir, { recursive: true, force: true });
        fs.rmSync(cloneDir, { recursive: true, force: true });
    });

    const defaultBranch = await getDefaultBranch(cloneDir, TIMEOUT_MS);
    assert.equal(defaultBranch, 'main');

    const refs = await listRemoteRefs(cloneDir, TIMEOUT_MS);
    assert.ok(refs.includes('main'));
    assert.ok(refs.includes('feature-branch'));
    assert.ok(refs.includes('v1.0.0'));
    assert.ok(!refs.some((r) => r.endsWith('^{}')), 'dereferenzierte Tag-Zeilen (^{}) dürfen nicht als eigener Ref auftauchen');

    // Neuer Commit auf origin, um zu prüfen dass fetchAndCheckout wirklich aktualisiert
    fs.writeFileSync(path.join(originDir, 'file.txt'), 'v2');
    git(originDir, ['add', '.']);
    git(originDir, ['commit', '-q', '-m', 'update']);

    const result = await fetchAndCheckout({ gitPath: cloneDir, branch: 'main', timeoutMs: TIMEOUT_MS });
    assert.equal(result.ok, true);
    assert.equal(fs.readFileSync(path.join(cloneDir, 'file.txt'), 'utf8'), 'v2');

    const branchResult = await fetchAndCheckout({ gitPath: cloneDir, branch: 'feature-branch', timeoutMs: TIMEOUT_MS });
    assert.equal(branchResult.ok, true);
});

test('gitOps: fetchAndCheckout lehnt ungültigen Branch-Namen vor jedem git-Aufruf ab', async () => {
    const result = await fetchAndCheckout({ gitPath: '/nonexistent', branch: '../evil', timeoutMs: TIMEOUT_MS });
    assert.equal(result.ok, false);
    assert.match(result.message, /Invalid branch/);
});

test('gitOps: fetchAndCheckout meldet sauber, wenn Branch nicht auf dem Remote existiert', async (t) => {
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-origin2-'));
    const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-clone2-'));

    git(originDir, ['init', '-q', '-b', 'main']);
    git(originDir, ['config', 'user.email', 'test@example.com']);
    git(originDir, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(originDir, 'file.txt'), 'v1');
    git(originDir, ['add', '.']);
    git(originDir, ['commit', '-q', '-m', 'init']);
    git(os.tmpdir(), ['clone', '-q', originDir, cloneDir]);

    t.after(() => {
        fs.rmSync(originDir, { recursive: true, force: true });
        fs.rmSync(cloneDir, { recursive: true, force: true });
    });

    const result = await fetchAndCheckout({ gitPath: cloneDir, branch: 'does-not-exist', timeoutMs: TIMEOUT_MS });
    assert.equal(result.ok, false);
    assert.match(result.message, /not found on the remote/);
});

test('checkRepoExists: ok, wenn ein .git-Ordner vorhanden ist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkrepo-'));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    try {
        assert.equal(checkRepoExists(tmpDir).ok, true);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('checkRepoExists: klare Fehlermeldung, wenn der Ordner schlicht fehlt', () => {
    const result = checkRepoExists('/this/path/really/should/not/exist/anywhere');
    assert.equal(result.ok, false);
    assert.match(result.message, /WLED checkout not found/);
});

test('checkRepoExists: erkennt Case-Mismatch-Geschwister und weist explizit darauf hin (z.B. "WLED" statt "wled")', { skip: !FS_IS_CASE_SENSITIVE && 'braucht ein case-sensitives Dateisystem (Produktivsystem: Linux) - hier (Windows/NTFS) ist "WLED" === "wled"' }, () => {
    // Reproduziert genau den realen Vorfall: "git clone <url>" ohne Zielverzeichnis-Argument
    // benennt den Ordner nach dem Repo-Namen in der URL ("WLED"), nicht nach dem von uns
    // erwarteten lowercase "wled" - auf Linux (case-sensitiv) sind das zwei verschiedene Pfade.
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkrepo-parent-'));
    const wrongCaseDir = path.join(parentDir, 'WLED');
    fs.mkdirSync(path.join(wrongCaseDir, '.git'), { recursive: true });

    try {
        const result = checkRepoExists(path.join(parentDir, 'wled'));
        assert.equal(result.ok, false);
        assert.match(result.message, /Found 'WLED'/);
        assert.match(result.message, /case mismatch/);
    } finally {
        fs.rmSync(parentDir, { recursive: true, force: true });
    }
});
