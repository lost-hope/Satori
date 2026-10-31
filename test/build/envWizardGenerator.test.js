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
    { boardId: 'esp32dev', externalUsermods: ['sensor-hub = https://github.com/lost-hope/sensor-hub.git'] },
  ];
  for (const combo of combos) {
    const ini = generateEnvIni(combo);
    const result = sanitizePlatformioEnv({ rawText: ini, envName: combo.envName || DEFAULT_ENV_NAME });
    assert.equal(result.ok, true, JSON.stringify(result.violations));
  }
});

test('generateEnvIni: an external usermod gets its own continuation line, after the bare-tokens line', () => {
  const ini = generateEnvIni({
    boardId: 'esp32dev',
    selectedUsermods: ['audioreactive'],
    externalUsermods: ['sensor-hub = https://github.com/lost-hope/sensor-hub.git'],
  });
  assert.equal(
    ini,
    `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\ncustom_usermods = audioreactive\n\tsensor-hub = https://github.com/lost-hope/sensor-hub.git\n`
  );
});

test('generateEnvIni: external usermods alone (no catalog usermods) still emit the key with an empty bare-tokens line', () => {
  const ini = generateEnvIni({
    boardId: 'esp32dev',
    externalUsermods: ['sensor-hub = https://github.com/lost-hope/sensor-hub.git'],
  });
  assert.equal(
    ini,
    `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\ncustom_usermods = \n\tsensor-hub = https://github.com/lost-hope/sensor-hub.git\n`
  );
});

test('generateEnvIni: external usermods are deduped (exact string match)', () => {
  const ini = generateEnvIni({
    boardId: 'esp32dev',
    externalUsermods: ['sensor-hub = https://github.com/x.git', 'sensor-hub = https://github.com/x.git'],
  });
  assert.equal(ini.split('\n').filter((l) => l.includes('sensor-hub')).length, 1);
});

test('generateEnvIni: multiple external usermods each get their own line, in sorted order', () => {
  const ini = generateEnvIni({
    boardId: 'esp32dev',
    externalUsermods: ['b-mod = https://github.com/x/b.git', 'a-mod = https://github.com/x/a.git'],
  });
  assert.equal(
    ini,
    `[env:${DEFAULT_ENV_NAME}]\nextends = env:esp32dev\ncustom_usermods = \n\ta-mod = https://github.com/x/a.git\n\tb-mod = https://github.com/x/b.git\n`
  );
});

test('generateEnvIni: neither bare nor external usermods -> no custom_usermods key at all (regression)', () => {
  const ini = generateEnvIni({ boardId: 'esp32dev', externalUsermods: [] });
  assert.ok(!ini.includes('custom_usermods'));
});
