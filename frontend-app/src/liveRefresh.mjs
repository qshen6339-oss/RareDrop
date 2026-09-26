const changeEvent = "raredrop-data-changed";
const storageKey = "raredrop-data-revision";

// Only a change signal is shared between tabs, never account or listing data.
export function announceDataChange() {
  window.dispatchEvent(new Event(changeEvent));
  try {
    localStorage.setItem(storageKey, `${Date.now()}-${Math.random()}`);
  } catch {
    // Browsers blocking storage still receive the regular server refresh.
  }
}

export function createLiveRefresh(
  refresh,
  enabled = () => true,
  env = globalThis,
) {
  let stopped = false,
    running = false,
    queued = false;
  async function run(queue = false) {
    if (stopped || env.document.hidden || !enabled()) return;
    if (running) {
      if (queue) queued = true;
      return;
    }
    running = true;
    try {
      await refresh();
    } catch {
      // Pages render request errors; a failed refresh must not stop future attempts.
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void run();
      }
    }
  }
  const signal = () => void run(true);
  const storage = (event) => {
    if (event.key === storageKey) signal();
  };
  const interval = env.setInterval(() => void run(), 5000);
  env.window.addEventListener("focus", signal);
  env.window.addEventListener("online", signal);
  env.window.addEventListener(changeEvent, signal);
  env.window.addEventListener("storage", storage);
  env.document.addEventListener("visibilitychange", signal);
  return {
    refresh: signal,
    stop() {
      stopped = true;
      queued = false;
      env.clearInterval(interval);
      env.window.removeEventListener("focus", signal);
      env.window.removeEventListener("online", signal);
      env.window.removeEventListener(changeEvent, signal);
      env.window.removeEventListener("storage", storage);
      env.document.removeEventListener("visibilitychange", signal);
    },
  };
}
