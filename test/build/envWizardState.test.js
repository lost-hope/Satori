const test = require('node:test');
const assert = require('node:assert/strict');
const { createSession, getSession, updateSession, clearSession } = require('../../commands/build/lib/envWizardState');

test('createSession seeds defaults and getSession returns them', () => {
  createSession('u1', { branch: 'main' });
  const session = getSession('u1');
  assert.equal(session.branch, 'main');
  assert.equal(session.step, 'boardCategory');
  assert.deepEqual(session.selectedFeatureFlags, []);
  assert.deepEqual(session.selectedUsermods, []);
  clearSession('u1');
});

test('createSession overwrites any existing session for the same user', () => {
  createSession('u2', { branch: 'main' });
  updateSession('u2', { boardId: 'esp32dev' });
  createSession('u2', { branch: 'dev' });
  assert.equal(getSession('u2').boardId, null);
  clearSession('u2');
});

test('updateSession merges a partial patch without clobbering other fields', () => {
  createSession('u3', { branch: 'main' });
  updateSession('u3', { boardId: 'esp32dev' });
  updateSession('u3', { selectedUsermods: ['audioreactive'] });
  const session = getSession('u3');
  assert.equal(session.boardId, 'esp32dev');
  assert.deepEqual(session.selectedUsermods, ['audioreactive']);
  clearSession('u3');
});

test('getSession returns null, and the session is gone, once the TTL expires', async () => {
  createSession('u4', { branch: 'main' }, 20);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(getSession('u4'), null);
  assert.equal(updateSession('u4', { boardId: 'x' }), null);
});

test('clearSession removes the session', () => {
  createSession('u5', { branch: 'main' });
  clearSession('u5');
  assert.equal(getSession('u5'), null);
});
