import assert from "node:assert/strict";
import fs from "node:fs";
import { createLiveRefresh, announceDataChange } from "./src/liveRefresh.mjs";
const checks = [];
const flush = () => new Promise((resolve) => setImmediate(resolve));
function environment() {
  const window = new EventTarget(),
    document = new EventTarget();
  document.hidden = false;
  let interval,
    duration,
    cleared = false;
  return {
    window,
    document,
    setInterval(fn, ms) {
      interval = fn;
      duration = ms;
      return 1;
    },
    clearInterval() {
      cleared = true;
    },
    tick() {
      if (!cleared) interval();
    },
    get duration() {
      return duration;
    },
    get cleared() {
      return cleared;
    },
  };
}
function emit(target, type, values = {}) {
  const event = new Event(type);
  Object.assign(event, values);
  target.dispatchEvent(event);
}
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.stack });
    process.exitCode = 1;
  }
}
await check(
  "Visible clients refresh every five seconds; hidden tabs suspend and refresh on return",
  async () => {
    const env = environment();
    let calls = 0;
    const live = createLiveRefresh(
      async () => {
        calls++;
      },
      undefined,
      env,
    );
    assert.equal(env.duration, 5000);
    env.tick();
    await flush();
    assert.equal(calls, 1);
    env.document.hidden = true;
    env.tick();
    emit(env.document, "visibilitychange");
    await flush();
    assert.equal(calls, 1);
    env.document.hidden = false;
    emit(env.document, "visibilitychange");
    await flush();
    assert.equal(calls, 2);
    live.stop();
  },
);
await check(
  "Focus, connection recovery and relevant publication signals refresh immediately",
  async () => {
    const env = environment();
    let calls = 0;
    const live = createLiveRefresh(
      async () => {
        calls++;
      },
      undefined,
      env,
    );
    for (const type of ["focus", "online", "raredrop-data-changed"]) {
      emit(env.window, type);
      await flush();
    }
    emit(env.window, "storage", { key: "raredrop-language" });
    await flush();
    assert.equal(calls, 3);
    emit(env.window, "storage", { key: "raredrop-data-revision" });
    await flush();
    assert.equal(calls, 4);
    live.stop();
  },
);
await check(
  "Slow requests do not overlap; multiple publication signals coalesce into one follow-up",
  async () => {
    const env = environment();
    let calls = 0,
      finish;
    const live = createLiveRefresh(
      () => {
        calls++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      undefined,
      env,
    );
    env.tick();
    env.tick();
    emit(env.window, "raredrop-data-changed");
    emit(env.window, "raredrop-data-changed");
    assert.equal(calls, 1);
    finish();
    await flush();
    assert.equal(calls, 2);
    live.stop();
    finish();
    await flush();
    assert.equal(calls, 2);
  },
);
await check(
  "Foreground work can suppress refresh; network errors do not stop subsequent attempts",
  async () => {
    const env = environment();
    let enabled = false,
      calls = 0;
    const live = createLiveRefresh(
      async () => {
        calls++;
        throw Error("Offline");
      },
      () => enabled,
      env,
    );
    env.tick();
    emit(env.window, "online");
    await flush();
    assert.equal(calls, 0);
    enabled = true;
    env.tick();
    await flush();
    env.tick();
    await flush();
    assert.equal(calls, 2);
    live.stop();
  },
);
await check(
  "Unmount clears timers and listeners and discards queued work",
  async () => {
    const env = environment();
    let calls = 0,
      finish;
    const live = createLiveRefresh(
      () => {
        calls++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      undefined,
      env,
    );
    live.refresh();
    live.refresh();
    live.stop();
    finish();
    await flush();
    env.tick();
    emit(env.window, "online");
    emit(env.window, "focus");
    emit(env.window, "raredrop-data-changed");
    emit(env.window, "storage", { key: "raredrop-data-revision" });
    emit(env.document, "visibilitychange");
    await flush();
    assert(env.cleared);
    assert.equal(calls, 1);
  },
);
await check(
  "Mutation signals contain no account data and still work when browser storage is blocked",
  async () => {
    globalThis.window = new EventTarget();
    let events = 0,
      saved;
    window.addEventListener("raredrop-data-changed", () => events++);
    globalThis.localStorage = {
      setItem(key, value) {
        saved = [key, value];
      },
    };
    announceDataChange();
    assert.equal(events, 1);
    assert.equal(saved[0], "raredrop-data-revision");
    assert.match(saved[1], /^\d+-0\.\d+$/);
    globalThis.localStorage = {
      setItem() {
        throw Error("Blocked");
      },
    };
    announceDataChange();
    assert.equal(events, 2);
    delete globalThis.window;
    delete globalThis.localStorage;
  },
);
const report = {
  date: new Date().toISOString(),
  passed: checks.filter((c) => c.passed).length,
  total: checks.length,
  checks,
};
fs.writeFileSync(
  new URL("../verification/live-refresh-tests.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
