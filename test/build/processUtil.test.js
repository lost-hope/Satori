const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCommand, spawnWithTimeout } = require('../../commands/build/lib/processUtil');

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
