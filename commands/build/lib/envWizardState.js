const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

const sessionByUser = new Map();

function createSession(userId, initial, ttlMs) {
  const ttl = ttlMs !== undefined ? ttlMs : DEFAULT_TTL_MS;
  const session = {
    userId,
    branch: initial.branch,
    step: 'boardCategory',
    boardCategoryId: null,
    boardId: null,
    selectedFeatureFlags: [],
    selectedUsermods: [],
    externalUsermods: [],
    generatedIni: null,
    expiresAt: Date.now() + ttl,
  };
  sessionByUser.set(userId, session);
  return session;
}

function getSession(userId) {
  const entry = sessionByUser.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessionByUser.delete(userId);
    return null;
  }
  return entry;
}

function updateSession(userId, patch) {
  const entry = sessionByUser.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessionByUser.delete(userId);
    return null;
  }
  const updated = { ...entry, ...patch, expiresAt: Date.now() + DEFAULT_TTL_MS };
  sessionByUser.set(userId, updated);
  return updated;
}

function clearSession(userId) {
  sessionByUser.delete(userId);
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  clearSession,
  DEFAULT_TTL_MS,
};
