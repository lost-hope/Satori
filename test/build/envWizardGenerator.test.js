const test = require('node:test');
const assert = require('node:assert/strict');
const { generateEnvIni, DEFAULT_ENV_NAME } = require('../../commands/build/lib/envWizardGenerator');
const { sanitizePlatformioEnv } = require('../../docker/builder/lib/iniSanitizer');

test('generateEnvIni: board only, no selections -> bare extends, no build_flags/custom_usermods', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev' });
  assert.equal(ini, `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\n`);
});

test('generateEnvIni: usermods are deduped and space-joined', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', selectedUsermods: ['multi_relay', 'audioreactive', 'audioreactive'] });
  assert.match(ini, /^custom_usermods = audioreactive multi_relay$/m);
});

test('generateEnvIni: feature flags always inherit the board build_flags first', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', selectedFeatureFlags: ['WLED_DISABLE_MQTT', 'WLED_DISABLE_ALEXA'] });
  assert.equal(
    ini,
    `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\nbuild_flags = \${env:esp32dev.build_flags}\n\t-D WLED_DISABLE_ALEXA\n\t-D WLED_DISABLE_MQTT\n`
  );
});

test('generateEnvIni: no feature flags selected -> no build_flags key at all, even with usermods set', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  assert.ok(!ini.includes('build_flags'));
});

test('generateEnvIni: custom envName is honored', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', envName: 'my_custom' });
  assert.ok(ini.startsWith('[env:my_custom]\n'));
});

test('generateEnvIni: throws on missing boardId', () => {
  assert.throws(() => generateEnvIni({}));
});

test('generateEnvIni output always passes the real sanitizer', () => {
  const combos = [
    { boardId: 'esp32dev' },
    { boardId: 'nodemcuv2', selectedUsermods: ['audioreactive', 'multi_relay'] },
    { boardId: 'esp32s3dev_8MB_opi', selectedFeatureFlags: ['WLED_DISABLE_MQTT', 'WLED_DISABLE_OTA'], selectedUsermods: ['sht'] },
  ];
  for (const combo of combos) {
    const ini = generateEnvIni(combo);
    const result = sanitizePlatformioEnv({ rawText: ini, envName: combo.envName || DEFAULT_ENV_NAME });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  }
});
