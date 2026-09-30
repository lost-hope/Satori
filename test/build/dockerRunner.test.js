const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { runBuildContainer, WORKSPACE_ROOT } = require('../../commands/build/lib/dockerRunner');

// Docker ist in dieser Dev-Umgebung nicht installiert - die Tests hier verifizieren daher bewusst
// nur das Drumherum (Job-Workspace anlegen, job.json-Inhalt, sauberer Fehlerpfad statt Crash,
// Cleanup), nicht den eigentlichen Container-Lauf. Das ist ein ehrlicher, aber echter Check: auch
// ohne docker-Binary muss runBuildContainer() ein verwertbares Ergebnis (dockerError) statt einer
// Exception liefern - dieselbe Absicherung greift in Produktion, falls der Docker-Daemon mal nicht
// erreichbar ist.

test('runBuildContainer: legt Job-Workspace mit korrektem job.json an und liefert dockerError statt zu werfen, wenn docker fehlt', async () => {
    const result = await runBuildContainer({
        envInput: '[env:esp32dev]\nboard = esp32dev',
        branch: 'main',
        onProgress: () => {},
        onLogChunk: () => {},
    });

    assert.ok(result.dockerError, 'erwartet einen dockerError, da kein docker-Binary vorhanden ist');
    assert.equal(result.jobResult, null);
    assert.equal(result.firmwarePath, null);
    assert.equal(result.overridePath, null);
    assert.equal(typeof result.cleanup, 'function');

    await result.cleanup();
});

test('runBuildContainer: schreibt envInput/branch unverändert in input/job.json (vor dem docker-Aufruf)', async () => {
    const jobDirsBefore = new Set(fsSync.existsSync(WORKSPACE_ROOT) ? fsSync.readdirSync(WORKSPACE_ROOT) : []);

    const result = await runBuildContainer({
        envInput: '[env:esp32dev]\ncustom_usermods = RF433',
        branch: 'feature-branch',
    });

    const jobDirsAfter = fsSync.readdirSync(WORKSPACE_ROOT);
    const newJobId = jobDirsAfter.find((id) => !jobDirsBefore.has(id));
    assert.ok(newJobId, 'es sollte ein neuer Job-Ordner angelegt worden sein');

    // cleanup() räumt den Ordner auf - daher den Inhalt VOR dem cleanup lesen
    const jobJsonPath = path.join(WORKSPACE_ROOT, newJobId, 'input', 'job.json');
    const job = JSON.parse(await fs.readFile(jobJsonPath, 'utf8'));
    assert.equal(job.envInput, '[env:esp32dev]\ncustom_usermods = RF433');
    assert.equal(job.branch, 'feature-branch');

    await result.cleanup();
    assert.equal(fsSync.existsSync(path.join(WORKSPACE_ROOT, newJobId)), false);
});

test('runBuildContainer: macht das output-Verzeichnis für den non-root Container-User beschreibbar (0o777)', { skip: process.platform === 'win32' && 'fs.chmod setzt Unix-Rechte-Bits unter Windows nicht zuverlässig' }, async () => {
    const jobDirsBefore = new Set(fsSync.existsSync(WORKSPACE_ROOT) ? fsSync.readdirSync(WORKSPACE_ROOT) : []);

    const result = await runBuildContainer({
        envInput: '[env:esp32dev]\nboard = esp32dev',
        branch: 'main',
    });

    const jobDirsAfter = fsSync.readdirSync(WORKSPACE_ROOT);
    const newJobId = jobDirsAfter.find((id) => !jobDirsBefore.has(id));

    const outputDir = path.join(WORKSPACE_ROOT, newJobId, 'output');
    const mode = (await fs.stat(outputDir)).mode & 0o777;
    assert.equal(mode, 0o777, `Bind-Mount-Output muss für eine fremde UID im Container beschreibbar sein, war aber ${mode.toString(8)}`);

    await result.cleanup();
});
