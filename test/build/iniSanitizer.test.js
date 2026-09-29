const test = require('node:test');
const assert = require('node:assert/strict');
const { extractEnvName, sanitizePlatformioEnv } = require('../../commands/build/lib/iniSanitizer');

test('extractEnvName: findet gültigen Header', () => {
    const { envName, error } = extractEnvName('[env:esp32dev]\nextends = env:esp32dev');
    assert.equal(error, null);
    assert.equal(envName, 'esp32dev');
});

test('extractEnvName: akzeptiert Unterstrich und Bindestrich', () => {
    const { envName, error } = extractEnvName('[env:esp32-eth_v2]\nboard = esp32dev');
    assert.equal(error, null);
    assert.equal(envName, 'esp32-eth_v2');
});

test('extractEnvName: lehnt fehlenden Header ab', () => {
    const { envName, error } = extractEnvName('board = esp32dev');
    assert.equal(envName, null);
    assert.ok(error);
});

test('extractEnvName: lehnt Path-Traversal-artigen Namen ab (kein Match wegen ungültiger Zeichen)', () => {
    const { envName, error } = extractEnvName('[env:../../etc]\nboard = esp32dev');
    assert.equal(envName, null);
    assert.ok(error);
});

test('sanitizePlatformioEnv: erlaubte Keys passieren unverändert', () => {
    const rawText = [
        '[env:esp32dev]',
        'extends = env:esp32dev',
        'board = esp32dev',
        'build_flags = -DFOO=1',
        '    -DBAR=2',
    ].join('\n');
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.equal(result.violations.length, 0);
    assert.match(result.sanitizedIni, /build_flags = -DFOO=1/);
    assert.match(result.sanitizedIni, /-DBAR=2/);
});

test('sanitizePlatformioEnv: lehnt extra_scripts ab', () => {
    const rawText = '[env:esp32dev]\nextra_scripts = pre:evil.py';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].reason, /extra_scripts/);
});

test('sanitizePlatformioEnv: lehnt fremde Sektionen ab (z.B. [platformio])', () => {
    const rawText = '[platformio]\ndefault_envs = esp32dev\n\n[env:esp32dev]\nboard = esp32dev';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((v) => /Section/.test(v.reason)));
});

test('sanitizePlatformioEnv: lehnt eine zweite [env:...] Sektion ab', () => {
    const rawText = '[env:esp32dev]\nboard = esp32dev\n\n[env:other]\nextra_scripts = pre:evil.py';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((v) => /env:other/.test(v.reason)));
});

test('sanitizePlatformioEnv: mehrzeilige Fortsetzung eines verbotenen Keys bleibt verboten', () => {
    const rawText = '[env:esp32dev]\nupload_command = evil\n    --flag';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
    assert.ok(result.violations.length >= 2);
});

test('sanitizePlatformioEnv: erlaubt lib_deps inkl. Git-URL (URL-Policy liegt bei libScanner, nicht hier)', () => {
    const rawText = '[env:esp32dev]\nlib_deps = https://github.com/example/usermod.git';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
});

test('sanitizePlatformioEnv: erlaubt platform_packages als ${...}-Variablenreferenz', () => {
    const rawText = [
        '[env:xiao_esp32s3_sense_audioreactive]',
        'extends = env:esp32s3dev_8MB_opi',
        'platform = ${esp32_idf_V5.platform_pioarduino}',
        'platform_packages = ${esp32_idf_V5.platform_packages_pioarduino}',
    ].join('\n');
    const result = sanitizePlatformioEnv({ rawText, envName: 'xiao_esp32s3_sense_audioreactive' });
    assert.equal(result.ok, true);
    assert.match(result.sanitizedIni, /platform_packages = \$\{esp32_idf_V5\.platform_packages_pioarduino\}/);
});

test('sanitizePlatformioEnv: lehnt literale URL in platform_packages ab', () => {
    const rawText = '[env:esp32dev]\nplatform_packages = https://github.com/evil/toolchain.git';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
    assert.match(result.violations[0].reason, /remote URL/);
});

test('sanitizePlatformioEnv: lehnt literale URL in platform ab', () => {
    const rawText = '[env:esp32dev]\nplatform = git@github.com:evil/toolchain.git';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
    assert.match(result.violations[0].reason, /remote URL/);
});

test('sanitizePlatformioEnv: erlaubt normale Registry-Plattformnamen', () => {
    const rawText = '[env:esp32dev]\nplatform = espressif32@6.5.0';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
});

test('sanitizePlatformioEnv: lehnt URL in Fortsetzungszeile von platform_packages ab', () => {
    const rawText = [
        '[env:esp32dev]',
        'platform_packages =',
        '    toolchain-xtensa-esp32 @ https://github.com/evil/toolchain.git',
    ].join('\n');
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
});

test('sanitizePlatformioEnv: erlaubt custom_usermods mit Bare-Namen und Wildcard, keine externalCustomUsermods', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = RF433 audioreactive *';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, []);
    assert.deepEqual(result.bareCustomUsermods.sort(), ['*', 'RF433', 'audioreactive'].sort());
});

test('sanitizePlatformioEnv: erlaubt custom_usermods mit Inline-Kommentar', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = RF433 ;; enable rf433 support';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, []);
});

test('sanitizePlatformioEnv: erlaubt custom_usermods mit URL, meldet sie als externalCustomUsermods', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = https://github.com/someuser/some-usermod.git';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, ['https://github.com/someuser/some-usermod.git']);
    assert.match(result.sanitizedIni, /custom_usermods = https:\/\/github\.com\/someuser\/some-usermod\.git/);
});

test('sanitizePlatformioEnv: erkennt custom_usermods mit owner/Name-Form als externalCustomUsermods', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = someuser/some-repo';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, ['someuser/some-repo']);
});

test('sanitizePlatformioEnv: erkennt custom_usermods mit "Name = spec"-Form als externalCustomUsermods', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = MyLib = https://github.com/someuser/lib.git';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, ['MyLib = https://github.com/someuser/lib.git']);
});

test('sanitizePlatformioEnv: erkennt externe Referenz in Fortsetzungszeile von custom_usermods', () => {
    const rawText = [
        '[env:esp32dev]',
        'custom_usermods = RF433',
        '  https://github.com/someuser/some-usermod.git',
    ].join('\n');
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, ['https://github.com/someuser/some-usermod.git']);
});

test('sanitizePlatformioEnv: dedupliziert identische externalCustomUsermods-Einträge', () => {
    const rawText = [
        '[env:esp32dev]',
        'custom_usermods = someuser/repo-a',
        '  someuser/repo-a',
    ].join('\n');
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.externalCustomUsermods, ['someuser/repo-a']);
});

test('sanitizePlatformioEnv: lehnt custom_usermods-Eintrag mit führendem "-" ab (CLI-Flag-Risiko)', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = -evil@github.com:x/y';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
});

test('sanitizePlatformioEnv: lehnt unklassifizierbaren custom_usermods-Token ab', () => {
    const rawText = '[env:esp32dev]\ncustom_usermods = foo!bar';
    const result = sanitizePlatformioEnv({ rawText, envName: 'esp32dev' });
    assert.equal(result.ok, false);
});
