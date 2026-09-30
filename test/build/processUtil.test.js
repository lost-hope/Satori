const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveCommand, spawnWithTimeout } = require('../../commands/build/lib/processUtil');

function withPlatform(platform, fn) {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
        return fn();
    } finally {
        Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
}

// resolveCommand cached bereits aufgelöste Namen prozessweit - für die POSIX-Tests brauchen wir
// daher garantiert einmalige, noch nie zuvor abgefragte Kommandonamen.
let uniqueCounter = 0;
function uniqueCmdName(prefix) {
    uniqueCounter += 1;
    return `${prefix}-${process.pid}-${uniqueCounter}`;
}

test('resolveCommand: lässt Namen mit Extension unverändert', () => {
    assert.equal(resolveCommand('pio.exe'), 'pio.exe');
    assert.equal(resolveCommand('npm.cmd'), 'npm.cmd');
});

test('resolveCommand: lässt Pfade mit Separator unverändert (kein PATH-Lookup nötig)', () => {
    assert.equal(resolveCommand('./tools/pio'), './tools/pio');
    assert.equal(resolveCommand('C:\\some\\dir\\pio'), 'C:\\some\\dir\\pio');
});

test('resolveCommand: fällt bei unbekanntem Kommando auf den Originalnamen zurück', () => {
    const result = resolveCommand('dieser-befehl-existiert-garantiert-nicht-xyz123');
    assert.equal(result, 'dieser-befehl-existiert-garantiert-nicht-xyz123');
});

test('spawnWithTimeout: liefert error statt Exception bei nicht existierendem Kommando', async () => {
    const result = await spawnWithTimeout('dieser-befehl-existiert-garantiert-nicht-xyz123', [], {}, 5000);
    assert.ok(result.error);
    assert.equal(result.code, null);
});

test('resolveCommand (POSIX-Zweig, simuliert): findet Kommando über ein PATH-Verzeichnis', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolvecmd-'));
    const cmdName = uniqueCmdName('mytool');
    const cmdPath = path.join(tmpDir, cmdName);
    fs.writeFileSync(cmdPath, '#!/bin/sh\necho hi\n');
    fs.chmodSync(cmdPath, 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = tmpDir;
    try {
        const result = withPlatform('linux', () => resolveCommand(cmdName));
        assert.equal(result, cmdPath);
    } finally {
        process.env.PATH = originalPath;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('resolveCommand (POSIX-Zweig, simuliert): findet Kommando unter ~/.platformio/penv/bin (pio-Installationsort)', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'resolvecmd-home-'));
    const pioDir = path.join(fakeHome, '.platformio', 'penv', 'bin');
    fs.mkdirSync(pioDir, { recursive: true });
    const cmdName = uniqueCmdName('pio');
    const cmdPath = path.join(pioDir, cmdName);
    fs.writeFileSync(cmdPath, '#!/bin/sh\necho hi\n');
    fs.chmodSync(cmdPath, 0o755);

    const originalHomedir = os.homedir;
    const originalPath = process.env.PATH;
    os.homedir = () => fakeHome;
    // PATH bewusst leer, damit dieser Test wirklich den ~/.platformio/penv/bin-Fallback prüft,
    // nicht einen zufälligen Treffer über PATH selbst.
    process.env.PATH = '';
    try {
        const result = withPlatform('linux', () => resolveCommand(cmdName));
        assert.equal(result, cmdPath);
    } finally {
        os.homedir = originalHomedir;
        process.env.PATH = originalPath;
        fs.rmSync(fakeHome, { recursive: true, force: true });
    }
});

test('resolveCommand (POSIX-Zweig, simuliert): unbekanntes Kommando mit leerem PATH fällt auf Originalnamen zurück', () => {
    const cmdName = uniqueCmdName('doesnotexist');
    const originalPath = process.env.PATH;
    process.env.PATH = '';
    try {
        const result = withPlatform('linux', () => resolveCommand(cmdName));
        // weder PATH (leer) noch die Standard-Systemverzeichnisse (COMMON_POSIX_BIN_DIRS)
        // enthalten ein derart eindeutiges, frei erfundenes Kommando
        assert.equal(result, cmdName);
    } finally {
        process.env.PATH = originalPath;
    }
});
