const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { scanFetchedLibs, resolveTrustedUsermodNames } = require('../lib/libScanner');

async function makeTempGitPath() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'libscan-'));
}

test('scanFetchedLibs: ok wenn libdeps-Ordner nicht existiert', async () => {
    const gitPath = await makeTempGitPath();
    const result = await scanFetchedLibs(gitPath, 'esp32dev');
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('scanFetchedLibs: ok bei harmloser library.json', async () => {
    const gitPath = await makeTempGitPath();
    const libDir = path.join(gitPath, '.pio', 'libdeps', 'esp32dev', 'FastLED');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(path.join(libDir, 'library.json'), JSON.stringify({ name: 'FastLED', version: '3.6.0' }));

    const result = await scanFetchedLibs(gitPath, 'esp32dev');
    assert.equal(result.ok, true);
    assert.deepEqual(result.findings, []);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('scanFetchedLibs: erkennt build.extraScript in library.json', async () => {
    const gitPath = await makeTempGitPath();
    const libDir = path.join(gitPath, '.pio', 'libdeps', 'esp32dev', 'EvilLib');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(
        path.join(libDir, 'library.json'),
        JSON.stringify({ name: 'EvilLib', build: { extraScript: 'evil_hook.py' } })
    );

    const result = await scanFetchedLibs(gitPath, 'esp32dev');
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].library, 'EvilLib');
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('scanFetchedLibs: erkennt extra_scripts in verschachtelter platformio.ini', async () => {
    const gitPath = await makeTempGitPath();
    const libDir = path.join(gitPath, '.pio', 'libdeps', 'esp32dev', 'EvilLib2');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(path.join(libDir, 'platformio.ini'), '[env]\nextra_scripts = pre:evil.py\n');

    const result = await scanFetchedLibs(gitPath, 'esp32dev');
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('scanFetchedLibs: ignoriert unparsable library.json statt zu werfen', async () => {
    const gitPath = await makeTempGitPath();
    const libDir = path.join(gitPath, '.pio', 'libdeps', 'esp32dev', 'BrokenLib');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(path.join(libDir, 'library.json'), '{ not valid json');

    const result = await scanFetchedLibs(gitPath, 'esp32dev');
    assert.equal(result.ok, true);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('scanFetchedLibs: trustedNames überspringt vertrauenswürdige Usermods trotz extraScript', async () => {
    const gitPath = await makeTempGitPath();
    const libDir = path.join(gitPath, '.pio', 'libdeps', 'esp32dev', 'audioreactive');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(
        path.join(libDir, 'library.json'),
        JSON.stringify({ name: 'audioreactive', build: { extraScript: 'override_sqrt.py' } })
    );

    const untrusted = await scanFetchedLibs(gitPath, 'esp32dev');
    assert.equal(untrusted.ok, false, 'ohne trustedNames muss weiterhin geblockt werden');

    const trusted = await scanFetchedLibs(gitPath, 'esp32dev', new Set(['audioreactive']));
    assert.equal(trusted.ok, true, 'mit trustedNames darf der vertrauenswürdige Ordner nicht blockieren');
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('scanFetchedLibs: trustedNames blockiert weiterhin andere, nicht gelistete Libs', async () => {
    const gitPath = await makeTempGitPath();
    const evilDir = path.join(gitPath, '.pio', 'libdeps', 'esp32dev', 'EvilLib');
    await fs.mkdir(evilDir, { recursive: true });
    await fs.writeFile(
        path.join(evilDir, 'library.json'),
        JSON.stringify({ name: 'EvilLib', build: { extraScript: 'evil.py' } })
    );

    const result = await scanFetchedLibs(gitPath, 'esp32dev', new Set(['audioreactive']));
    assert.equal(result.ok, false);
    assert.equal(result.findings.length, 1);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('resolveTrustedUsermodNames: löst Bare-Token auf usermod_v2_-Präfix auf', async () => {
    const gitPath = await makeTempGitPath();
    const usermodDir = path.join(gitPath, 'usermods', 'usermod_v2_RF433');
    await fs.mkdir(usermodDir, { recursive: true });

    const trusted = resolveTrustedUsermodNames(gitPath, ['RF433']);
    assert.deepEqual(Array.from(trusted), ['usermod_v2_RF433']);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('resolveTrustedUsermodNames: "*" nimmt alle Usermods mit library.json auf', async () => {
    const gitPath = await makeTempGitPath();
    await fs.mkdir(path.join(gitPath, 'usermods', 'modA'), { recursive: true });
    await fs.writeFile(path.join(gitPath, 'usermods', 'modA', 'library.json'), '{}');
    await fs.mkdir(path.join(gitPath, 'usermods', 'modB_no_manifest'), { recursive: true });

    const trusted = resolveTrustedUsermodNames(gitPath, ['*']);
    assert.deepEqual(Array.from(trusted), ['modA']);
    await fs.rm(gitPath, { recursive: true, force: true });
});

test('resolveTrustedUsermodNames: ignoriert Token ohne passenden usermods-Ordner', async () => {
    const gitPath = await makeTempGitPath();
    const trusted = resolveTrustedUsermodNames(gitPath, ['doesnotexist']);
    assert.deepEqual(Array.from(trusted), []);
    await fs.rm(gitPath, { recursive: true, force: true });
});
