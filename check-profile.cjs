// Name-edit checks use an isolated SQLite database, never the user's accounts.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const root = __dirname,
  backend = path.join(root, "backend-server"),
  previousCwd = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "raredrop-profile-"));
process.chdir(scratch);
const express = require(path.join(backend, "node_modules/express"));
const store = require(path.join(backend, "app/models/db"));
let server, base, seller, buyer, itemId;
const checks = [];
async function api(method, url, token, body) {
  const r = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { "X-Authorization": token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : await r.text(),
  };
}
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
    process.exitCode = 1;
  }
}
async function account(label) {
  const email = `${label}@name-test.example`;
  assert.equal(
    (
      await api("POST", "/users", null, {
        first_name: label,
        last_name: "Tester",
        email,
        password: "RareDrop2026!",
      })
    ).status,
    201,
  );
  return (
    await api("POST", "/login", null, { email, password: "RareDrop2026!" })
  ).body;
}
async function main() {
  await store.ready;
  const app = express(),
    routes = express.Router();
  routes.use(express.urlencoded({ extended: false }));
  routes.use(express.json());
  for (const name of ["user", "core", "question"])
    require(path.join(backend, `app/routes/${name}.server.routes`))(routes);
  app.use("/api", routes);
  app.use(express.static(path.join(root, "frontend-app/dist")));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
  seller = await account("seller");
  buyer = await account("buyer");
  const created = await api("POST", "/item", seller.session_token, {
    name: "Profile name demo",
    description: "Temporary profile editing check.",
    starting_bid: 80,
    end_date: Date.now() + 86400000,
    category_ids: [1],
  });
  assert.equal(created.status, 201);
  itemId = created.body.item_id;
  await store.run("INSERT INTO item_media VALUES (?,?)", [itemId, "dragon"]);
  assert.equal(
    (
      await api("POST", `/item/${itemId}/bid`, buyer.session_token, {
        amount: 95,
      })
    ).status,
    201,
  );
  const original = await store.get("SELECT * FROM users WHERE user_id=?", [
    seller.user_id,
  ]);
  const endpoint = `/users/${seller.user_id}`;
  await check(
    "Name editing requires authentication and ownership",
    async () => {
      const names = { first_name: "New", last_name: "Name" };
      assert.equal((await api("PATCH", endpoint, null, names)).status, 401);
      assert.equal(
        (await api("PATCH", endpoint, buyer.session_token, names)).status,
        403,
      );
      assert.equal(
        (await api("PATCH", "/users/0", seller.session_token, names)).status,
        404,
      );
      assert.deepEqual(
        await store.get("SELECT * FROM users WHERE user_id=?", [
          seller.user_id,
        ]),
        original,
      );
    },
  );
  await check(
    "Blank, missing, oversized and unexpected fields are rejected without modifying data",
    async () => {
      for (const value of [
        {},
        { first_name: "A" },
        { first_name: "", last_name: "B" },
        { first_name: "A", last_name: "   " },
        { first_name: "x".repeat(51), last_name: "B" },
        { first_name: "A", last_name: "x".repeat(51) },
        { first_name: 42, last_name: "B" },
        { first_name: "A", last_name: "B", email: "changed@example.com" },
        { first_name: "A", last_name: "B", user_id: buyer.user_id },
        { first_name: "A", last_name: "B", password: "Other2026!" },
      ])
        assert.equal(
          (await api("PATCH", endpoint, seller.session_token, value)).status,
          400,
        );
      assert.deepEqual(
        await store.get("SELECT * FROM users WHERE user_id=?", [
          seller.user_id,
        ]),
        original,
      );
    },
  );
  await check(
    "Chinese names are trimmed and returned without exposing private fields",
    async () => {
      const r = await api("PATCH", endpoint, seller.session_token, {
        first_name: "  星河  ",
        last_name: "  收藏家  ",
      });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, {
        user_id: seller.user_id,
        first_name: "星河",
        last_name: "收藏家",
      });
      const stored = await store.get("SELECT * FROM users WHERE user_id=?", [
        seller.user_id,
      ]);
      assert.deepEqual(stored, {
        ...original,
        first_name: "星河",
        last_name: "收藏家",
      });
    },
  );
  await check(
    "Profile, listings, search and seller details all use the new name",
    async () => {
      const profile = (await api("GET", endpoint)).body;
      assert.equal(profile.first_name, "星河");
      assert.equal(profile.last_name, "收藏家");
      assert.equal(profile.selling[0].first_name, "星河");
      const detail = (await api("GET", `/item/${itemId}`)).body;
      assert.equal(detail.first_name, "星河");
      assert.equal(detail.last_name, "收藏家");
      assert.equal((await api("GET", "/search")).body[0].first_name, "星河");
    },
  );
  await check(
    "Existing bids and current bid holder reflect a bidder's renamed profile",
    async () => {
      const r = await api(
        "PATCH",
        `/users/${buyer.user_id}`,
        buyer.session_token,
        { first_name: "Alex", last_name: "River" },
      );
      assert.equal(r.status, 200);
      const bids = (await api("GET", `/item/${itemId}/bid`)).body;
      assert.equal(bids[0].first_name, "Alex");
      assert.equal(bids[0].last_name, "River");
      assert.equal(bids[0].amount, 95);
      assert.deepEqual(
        (await api("GET", `/item/${itemId}`)).body.current_bid_holder,
        { user_id: buyer.user_id, first_name: "Alex", last_name: "River" },
      );
    },
  );
  await check(
    "Login credentials, session and existing auction ownership remain intact",
    async () => {
      assert.deepEqual(
        (
          await api("POST", "/login", null, {
            email: "seller@name-test.example",
            password: "RareDrop2026!",
          })
        ).body,
        seller,
      );
      const detail = (await api("GET", `/item/${itemId}`)).body;
      assert.equal(detail.creator_id, seller.user_id);
      assert.equal(detail.current_bid, 95);
      const sqlite = require(path.join(backend, "node_modules/sqlite3"));
      const persisted = await new Promise((resolve, reject) => {
        const db = new sqlite.Database(path.join(scratch, "db.sqlite"));
        db.get(
          "SELECT first_name,last_name FROM users WHERE user_id=?",
          [seller.user_id],
          (error, row) =>
            db.close(() => (error ? reject(error) : resolve(row))),
        );
      });
      assert.deepEqual(persisted, { first_name: "星河", last_name: "收藏家" });
    },
  );
}
let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  if (server) await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => store.db.close(resolve));
  process.chdir(previousCwd);
  const resolved = fs.realpathSync(scratch);
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("raredrop-profile-")
  )
    throw new Error("Unexpected cleanup path");
  fs.rmSync(resolved, { recursive: true, force: true });
}
main()
  .then(async () => {
    const report = {
      date: new Date().toISOString(),
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
      checks,
    };
    fs.writeFileSync(
      path.join(root, "verification/profile-tests.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (process.argv.includes("--browser") && !process.exitCode) {
      console.log(
        `ISOLATED_BROWSER_URL=${base.replace(/\/api$/, "")}/#/account`,
      );
      console.log(
        "Seller: seller@name-test.example / RareDrop2026! (temporary database only)",
      );
      process.on("SIGINT", () => cleanup());
      process.on("SIGTERM", () => cleanup());
    } else await cleanup();
  })
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await cleanup();
  });
