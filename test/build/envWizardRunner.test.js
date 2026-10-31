const test = require('node:test');
const assert = require('node:assert/strict');
const envWizardRunner = require('../../commands/build/lib/envWizardRunner');
const { createSession, getSession, clearSession } = require('../../commands/build/lib/envWizardState');

function fakeInteraction({ customId, values = [], userId = 'u1' }) {
  const calls = { update: null, reply: null };
  return {
    customId,
    values,
    user: { id: userId },
    isStringSelectMenu: () => true,
    isButton: () => customId === 'envWizard:usermodsNext' || ['envWizard:confirm', 'envWizard:restart', 'envWizard:cancel'].includes(customId),
    update: async (payload) => { calls.update = payload; },
    reply: async (payload) => { calls.reply = payload; },
    _calls: calls,
  };
}

test('handleComponent: picking a board category renders the board select for that category', async () => {
  createSession('u1', { branch: 'main' });
  const interaction = fakeInteraction({ customId: 'envWizard:boardCategory', values: ['esp8266'] });
  await envWizardRunner.handleComponent(interaction);
  assert.equal(getSession('u1').boardCategoryId, 'esp8266');
  assert.equal(interaction._calls.update.components[0].toJSON().components[0].custom_id, 'envWizard:board');
  clearSession('u1');
});

test('handleComponent: picking a board pre-selects its default usermods', async () => {
  createSession('u1', { branch: 'main' });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:board', values: ['esp32dev'] }));
  assert.deepEqual(getSession('u1').selectedUsermods, ['audioreactive']);
  clearSession('u1');
});

test('handleComponent: usermod selections from different category menus accumulate, not overwrite', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:usermods:sensors', values: ['BME280_v2'] }));
  assert.deepEqual(getSession('u1').selectedUsermods.sort(), ['BME280_v2', 'audioreactive'].sort());
  clearSession('u1');
});

test('handleComponent: deselecting a board-default usermod removes it from the session', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:usermods:network_misc', values: [] }));
  assert.deepEqual(getSession('u1').selectedUsermods, []);
  clearSession('u1');
});

test('handleComponent: an expired/missing session shows an error instead of throwing', async () => {
  const interaction = fakeInteraction({ customId: 'envWizard:board', values: ['esp32dev'] });
  await assert.doesNotReject(() => envWizardRunner.handleComponent(interaction));
  assert.ok(interaction._calls.update || interaction._calls.reply);
});

test('handleComponent: confirm enqueues a build via buildQueue.enqueue, running buildRunner.runOneBuild with the session\'s ini/branch, and clears the session', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'], generatedIni: '[env:custom_build]\nextends = env:esp32dev\n' });
  const buildQueue = require('../../commands/build/lib/buildQueue');
  const buildRunner = require('../../commands/build/lib/buildRunner');
  const originalEnqueue = buildQueue.enqueue;
  const originalRunOneBuild = buildRunner.runOneBuild;
  let enqueuedJob = null;
  let runOneBuildArgs = null;
  buildQueue.enqueue = (job) => { enqueuedJob = job; return { jobId: 'fake' }; };
  buildRunner.runOneBuild = async (interaction, rawText, branch) => { runOneBuildArgs = { rawText, branch }; };
  try {
    const interaction = fakeInteraction({ customId: 'envWizard:confirm' });
    await envWizardRunner.handleComponent(interaction);
    assert.ok(enqueuedJob, 'buildQueue.enqueue was not called');
    await enqueuedJob.run({ jobId: 'fake' });
    assert.deepEqual(runOneBuildArgs, { rawText: '[env:custom_build]\nextends = env:esp32dev\n', branch: 'main' });
  } finally {
    buildQueue.enqueue = originalEnqueue;
    buildRunner.runOneBuild = originalRunOneBuild;
  }
  assert.equal(getSession('u1'), null);
});

test('handleComponent: restart clears selections but keeps the branch, re-showing the board-category step', async () => {
  createSession('u1', { branch: 'main', boardId: 'esp32dev', selectedUsermods: ['audioreactive'] });
  const interaction = fakeInteraction({ customId: 'envWizard:restart' });
  await envWizardRunner.handleComponent(interaction);
  const session = getSession('u1');
  assert.equal(session.branch, 'main');
  assert.equal(session.boardId, null);
  assert.equal(interaction._calls.update.components[0].toJSON().components[0].custom_id, 'envWizard:boardCategory');
  clearSession('u1');
});

test('handleComponent: cancel clears the session', async () => {
  createSession('u1', { branch: 'main' });
  await envWizardRunner.handleComponent(fakeInteraction({ customId: 'envWizard:cancel' }));
  assert.equal(getSession('u1'), null);
});
