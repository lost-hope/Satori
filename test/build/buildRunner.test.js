const test = require('node:test');
const assert = require('node:assert/strict');
const buildRunner = require('../../commands/build/lib/buildRunner');

test('buildRunner exports runOneBuild, errorEmbed, and resolveBranchOption for reuse by the env wizard', () => {
  assert.equal(typeof buildRunner.runOneBuild, 'function');
  assert.equal(typeof buildRunner.errorEmbed, 'function');
  assert.equal(typeof buildRunner.resolveBranchOption, 'function');
});

test('resolveBranchOption: rejects an invalid branch name without calling git', async () => {
  const fakeInteraction = { options: { getString: () => 'foo;rm -rf /' }, user: { id: 'u1' } };
  const result = await buildRunner.resolveBranchOption(fakeInteraction);
  assert.equal(result.branch, null);
  assert.match(result.error, /Invalid branch/);
});
