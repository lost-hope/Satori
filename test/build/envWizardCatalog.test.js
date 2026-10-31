const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../commands/build/lib/envWizardCatalog');

test('catalog: board categories and boards are consistent', () => {
  const categories = catalog.getBoardCategories();
  assert.equal(categories.length, 4);
  const boards = catalog.getBoards();
  assert.equal(boards.length, 27);
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const board of boards) assert.ok(categoryIds.has(board.category), `${board.id} has unknown category`);
});

test('catalog: getBoardsByCategory partitions boards without exceeding 25 per category', () => {
  for (const { id } of catalog.getBoardCategories()) {
    const boards = catalog.getBoardsByCategory(id);
    assert.ok(boards.length > 0 && boards.length <= 25);
  }
  assert.equal(catalog.getBoardsByCategory('does-not-exist').length, 0);
});

test('catalog: no hub75/matrix boards are present (non-goal exclusion)', () => {
  const ids = catalog.getBoards().map((b) => b.id);
  assert.ok(!ids.some((id) => /hub75/i.test(id)));
  assert.ok(!ids.includes('adafruit_matrixportal_esp32s3'));
});

test('catalog: board default usermods match the known WLED main data', () => {
  assert.deepEqual(catalog.getBoardById('esp32dev').defaultUsermods, ['audioreactive']);
  assert.deepEqual(catalog.getBoardById('esp01_1m_full').defaultUsermods, []);
  assert.equal(catalog.getBoardById('does-not-exist'), undefined);
});

test('catalog: exactly 16 WLED_DISABLE_* feature flags', () => {
  const features = catalog.getFeatures();
  assert.equal(features.length, 16);
  for (const f of features) assert.ok(f.flag.startsWith('WLED_DISABLE_'));
});

test('catalog: usermod categories partition all 72 usermods without exceeding 25 per category', () => {
  const usermods = catalog.getUsermodsByCategory ? catalog.getUsermodCategories().flatMap((c) => catalog.getUsermodsByCategory(c.id)) : [];
  assert.equal(usermods.length, 72);
  for (const { id } of catalog.getUsermodCategories()) {
    assert.ok(catalog.getUsermodsByCategory(id).length <= 25);
  }
  assert.ok(catalog.getUsermodById('audioreactive'));
  assert.equal(catalog.getUsermodById('does-not-exist'), undefined);
});
