const state = require('./state.js');
const { terminateTrackedChildren } = require('./utils.js');

const MPV_DISPOSE_TIMEOUT_MS = 2_500;

function withCleanupTimeout(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
    }),
  ]);
}

function cleanupApp() {
  if (state.cleanupPromise) return state.cleanupPromise;
  state.isQuitting = true;
  state.exitConfirmed = true;
  if (state.quitPromptTimer) {
    clearTimeout(state.quitPromptTimer);
    state.quitPromptTimer = null;
  }
  if (state.warmupTimer) {
    clearTimeout(state.warmupTimer);
    state.warmupTimer = null;
  }

  state.cleanupPromise = (async () => {
    if (state.currentJob) state.currentJob.cancel();

    const mpv = state.mpv;
    state.mpv = null;
    if (mpv) {
      await withCleanupTimeout(mpv.dispose(), MPV_DISPOSE_TIMEOUT_MS).catch(() => {});
    }

    await terminateTrackedChildren();
    await withCleanupTimeout(
      Promise.allSettled([...state.activeOperations]),
      3_000,
    );
    // An already-accepted coalesced operation may have released while the first
    // drain was running. The shutdown gate prevents any new renderer work.
    await terminateTrackedChildren();
    state.cleanupComplete = true;
  })();

  return state.cleanupPromise;
}

module.exports = { cleanupApp };
