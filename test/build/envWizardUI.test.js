const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../../commands/build/lib/envWizardUI');
const catalog = require('../../commands/build/lib/envWizardCatalog');

test('buildBoardCategoryRow: one option per catalog category', () => {
  const json = ui.buildBoardCategoryRow().toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'envWizard:boardCategory');
  assert.equal(menu.options.length, catalog.getBoardCategories().length);
});

test('buildBoardRow: options match the boards of the given category', () => {
  const json = ui.buildBoardRow('esp8266').toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'envWizard:board');
  assert.deepEqual(menu.options.map((o) => o.value).sort(), catalog.getBoardsByCategory('esp8266').map((b) => b.id).sort());
});

test('buildFeatureRow: all 16 flags present, selected ones marked default', () => {
  const json = ui.buildFeatureRow(['WLED_DISABLE_MQTT']).toJSON();
  const menu = json.components[0];
  assert.equal(menu.custom_id, 'envWizard:features');
  assert.equal(menu.options.length, 16);
  const mqtt = menu.options.find((o) => o.value === 'WLED_DISABLE_MQTT');
  assert.equal(mqtt.default, true);
  const other = menu.options.find((o) => o.value !== 'WLED_DISABLE_MQTT');
  assert.ok(!other.default);
});

test('buildUsermodRows: one row per usermod category, pre-selected ids marked default', () => {
  const rows = ui.buildUsermodRows(['audioreactive']).map((r) => r.toJSON());
  assert.equal(rows.length, catalog.getUsermodCategories().length);
  const networkMenu = rows.map((r) => r.components[0]).find((m) => m.custom_id === 'envWizard:usermods:network_misc');
  const audioreactive = networkMenu.options.find((o) => o.value === 'audioreactive');
  assert.equal(audioreactive.default, true);
});

test('buildUsermodsNextRow: "Weiter" and "eigenes UserMod hinzufügen" buttons, in that order', () => {
  const json = ui.buildUsermodsNextRow().toJSON();
  assert.equal(json.components[0].custom_id, 'envWizard:usermodsNext');
  assert.equal(json.components[1].custom_id, 'envWizard:addUsermod');
});

test('buildAddUsermodModal: a modal with one paragraph text input for external usermod specs', () => {
  const json = ui.buildAddUsermodModal().toJSON();
  assert.equal(json.custom_id, 'envWizard:addUsermodModal');
  const textInput = json.components[0].components[0];
  assert.equal(textInput.custom_id, 'envWizard:externalUsermodsInput');
  assert.equal(textInput.style, 2); // TextInputStyle.Paragraph
  assert.equal(textInput.required, false);
});

test('buildReviewComponents: embed contains the ini, row has confirm/restart/cancel buttons', () => {
  const { embed, row } = ui.buildReviewComponents('[env:custom_build]\nextends = env:esp32dev\n');
  const embedJson = embed.toJSON();
  assert.ok(embedJson.description.includes('extends = env:esp32dev'));
  const customIds = row.toJSON().components.map((b) => b.custom_id);
  assert.deepEqual(customIds, ['envWizard:confirm', 'envWizard:restart', 'envWizard:cancel']);
});
