// Runs the unmodified teaching tests and separate contract/edge-case checks.
// Each suite gets a new temporary SQLite database. The demo database is never touched.
const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert/strict");
const { spawn } = require("child_process");
const root = __dirname,
  backend = path.join(root, "backend-server"),
  reports = path.join(root, "verification");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(reports, { recursive: true });
let child;
async function start(name) {
  try {
    await fetch("http://127.0.0.1:3333/", { signal: AbortSignal.timeout(800) });
    throw new Error(
      "Port 3333 is in use. Stop your auction backend before running verification.",
    );
  } catch (error) {
    if (error.message.startsWith("Port 3333")) throw error;
  }
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `raredrop-${name}-`));
  child = spawn(process.execPath, [path.join(backend, "server.js")], {
    cwd,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  child.once("exit", () =>
    fs.writeFileSync(path.join(reports, `${name}-server.log`), output),
  );
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const r = await fetch("http://127.0.0.1:3333/categories");
      if (r.ok) return cwd;
    } catch {}
    await delay(100);
  }
  throw new Error("Backend did not start. " + output);
}
async function stop() {
  if (child && child.exitCode === null) {
    const done = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await done;
  }
  child = null;
}
async function original() {
  const cwd = await start("original");
  try {
    const files = fs
      .readdirSync(path.join(backend, "tests"))
      .filter((f) => /^test\..+\.js$/.test(f))
      .sort()
      .map((f) => path.join(backend, "tests", f));
    const result = await new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [
          path.join(backend, "node_modules/mocha/bin/mocha.js"),
          ...files,
          "--reporter",
          "json",
          "--timeout",
          "10000",
        ],
        { cwd, windowsHide: true },
      );
      let stdout = "",
        stderr = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.once("error", reject);
      p.once("exit", (code) => resolve({ code, stdout, stderr }));
    });
    fs.writeFileSync(
      path.join(reports, "original-tests.log"),
      result.stdout + result.stderr,
    );
    const startIndex = result.stdout.indexOf('{\n  "stats"');
    if (startIndex < 0)
      throw new Error("Could not read original test report: " + result.stderr);
    const report = JSON.parse(result.stdout.slice(startIndex));
    fs.writeFileSync(
      path.join(reports, "original-tests.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("Original teaching suite:", JSON.stringify(report.stats));
    for (const f of report.failures)
      console.log("  FAIL:", f.fullTitle, "—", f.err.message);
    return report;
  } finally {
    await stop();
  }
}
async function api(method, url, body, token) {
  const r = await fetch("http://127.0.0.1:3333" + url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Authorization": token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const result = r.headers.get("content-type")?.includes("application/json")
    ? await r.json()
    : await r.text();
  return { status: r.status, body: result };
}
async function advanced() {
  const cwd = await start("contract");
  const checks = [];
  const check = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, passed: true });
    } catch (e) {
      checks.push({ name, passed: false, error: e.message });
      console.log("  FAIL:", name, e.message);
    }
  };
  try {
    const users = [
      {
        first_name: "Seller",
        last_name: "One",
        email: "seller@example.com",
        password: "RareDrop2026!",
      },
      {
        first_name: "Buyer",
        last_name: "Two",
        email: "buyer@example.com",
        password: "RareDrop2026!",
      },
      {
        first_name: "Bidder",
        last_name: "Three",
        email: "bidder@example.com",
        password: "RareDrop2026!",
      },
    ];
    const sessions = [];
    await check(
      "Register three independent users; reject duplicate and unknown fields",
      async () => {
        for (const u of users)
          assert.equal((await api("POST", "/users", u)).status, 201);
        assert.equal((await api("POST", "/users", users[0])).status, 400);
        assert.equal(
          (
            await api("POST", "/users", {
              ...users[0],
              email: "new@example.com",
              admin: true,
            })
          ).status,
          400,
        );
      },
    );
    await check(
      "Authenticate and preserve a session token across concurrent logins",
      async () => {
        for (const u of users) {
          const r = await api("POST", "/login", {
            email: u.email,
            password: u.password,
          });
          assert.equal(r.status, 200);
          sessions.push(r.body.session_token);
        }
        const results = await Promise.all(
          Array.from({ length: 4 }, () =>
            api("POST", "/login", {
              email: users[0].email,
              password: users[0].password,
            }),
          ),
        );
        assert(results.every((r) => r.body.session_token === sessions[0]));
        assert.equal(
          (
            await api("POST", "/login", {
              email: users[0].email,
              password: "wrong",
            })
          ).status,
          400,
        );
      },
    );
    await check(
      "Account response never exposes password, salt or session token",
      async () => {
        const r = await api("GET", "/users/1");
        assert.equal(r.status, 200);
        assert.deepEqual(
          Object.keys(r.body).sort(),
          [
            "user_id",
            "first_name",
            "last_name",
            "selling",
            "bidding_on",
            "auctions_ended",
          ].sort(),
        );
      },
    );
    const base = {
      name: "Astral Dragon test collectible",
      description: "Mint condition, protective sleeve included.",
      starting_bid: 100,
      end_date: Date.now() + 86400000,
    };
    let itemId;
    await check("Authentication and item input validation", async () => {
      assert.equal((await api("POST", "/item", base)).status, 401);
      for (const body of [
        { ...base, end_date: Date.now() - 1000 },
        { ...base, starting_bid: -1 },
        { ...base, starting_bid: 10.5 },
        { ...base, name: "   " },
        { ...base, extra: 1 },
      ])
        assert.equal(
          (await api("POST", "/item", body, sessions[0])).status,
          400,
        );
    });
    await check("Create an auction with multiple categories", async () => {
      const r = await api(
        "POST",
        "/item",
        { ...base, category_ids: [1, 4] },
        sessions[0],
      );
      assert.equal(r.status, 201);
      itemId = r.body.item_id;
      const cats = await api("GET", `/item/${itemId}/categories`);
      assert.deepEqual(
        cats.body.map((c) => c.category_id),
        [1, 4],
      );
    });
    await check(
      "Reject unknown categories without leaving a partial listing",
      async () => {
        assert.equal(
          (
            await api(
              "POST",
              "/item",
              { ...base, category_ids: [999] },
              sessions[0],
            )
          ).status,
          400,
        );
        assert.equal((await api("GET", "/search")).body.length, 1);
      },
    );
    await check(
      "Filter by category and name; validate pagination and status",
      async () => {
        assert.equal(
          (await api("GET", "/search?category_id=1&q=Dragon")).body.length,
          1,
        );
        assert.equal(
          (await api("GET", "/search?category_id=2")).body.length,
          0,
        );
        for (const url of [
          "/search?limit=0",
          "/search?limit=101",
          "/search?offset=-1",
          "/search?limit=1.5",
          "/search?status=BAD",
          "/search?status=OPEN",
        ])
          assert.equal((await api("GET", url)).status, 400);
        assert.equal(
          (await api("GET", "/search?status=OPEN", undefined, sessions[0])).body
            .length,
          1,
        );
      },
    );
    await check(
      "Reject seller bids and bids at or below the starting price",
      async () => {
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/bid`,
              { amount: 200 },
              sessions[0],
            )
          ).status,
          403,
        );
        for (const amount of [99, 100, 1.2, -1])
          assert.equal(
            (await api("POST", `/item/${itemId}/bid`, { amount }, sessions[1]))
              .status,
            400,
          );
        assert.equal(
          (await api("POST", "/item/999/bid", { amount: 200 }, sessions[1]))
            .status,
          404,
        );
      },
    );
    await check("Concurrent equal bids accept only one winner", async () => {
      const results = await Promise.all([
        api("POST", `/item/${itemId}/bid`, { amount: 110 }, sessions[1]),
        api("POST", `/item/${itemId}/bid`, { amount: 110 }, sessions[2]),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
      assert.equal((await api("GET", `/item/${itemId}/bid`)).body.length, 1);
    });
    await check(
      "Higher bids update the holder and descending bid history",
      async () => {
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/bid`,
              { amount: 125 },
              sessions[2],
            )
          ).status,
          201,
        );
        const r = await api("GET", `/item/${itemId}`);
        assert.equal(r.body.current_bid, 125);
        assert.equal(r.body.current_bid_holder.user_id, 3);
        assert.deepEqual(
          (await api("GET", `/item/${itemId}/bid`)).body.map((b) => b.amount),
          [125, 110],
        );
        assert.equal(
          (await api("GET", "/search?status=BID", undefined, sessions[2])).body
            .length,
          1,
        );
      },
    );
    await check(
      "Questions require a buyer; only the seller can answer",
      async () => {
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/question`,
              { question_text: "Is the sleeve included?" },
              sessions[0],
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/question`,
              { question_text: "Is the sleeve included?" },
              sessions[1],
            )
          ).status,
          200,
        );
        const q = (await api("GET", `/item/${itemId}/question`)).body[0];
        assert.equal(q.answer_text, null);
        assert.equal(
          (
            await api(
              "POST",
              `/question/${q.question_id}`,
              { answer_text: "Yes" },
              sessions[1],
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await api(
              "POST",
              `/question/${q.question_id}`,
              { answer_text: "Yes, the sleeve is included." },
              sessions[0],
            )
          ).status,
          200,
        );
        assert.equal(
          (await api("GET", `/item/${itemId}/question`)).body[0].answer_text,
          "Yes, the sleeve is included.",
        );
      },
    );
    await check(
      "Profanity is blocked without matching innocent substrings",
      async () => {
        assert.equal(
          (
            await api(
              "POST",
              "/item",
              { ...base, name: "FUCKING card" },
              sessions[0],
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/question`,
              { question_text: "This is shit" },
              sessions[1],
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/question`,
              { question_text: "Can you send it to Scunthorpe?" },
              sessions[1],
            )
          ).status,
          200,
        );
      },
    );
    await check(
      "Category updates enforce ownership and validate all IDs atomically",
      async () => {
        assert.equal(
          (
            await api(
              "PUT",
              `/item/${itemId}/categories`,
              { category_ids: [2] },
              sessions[1],
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await api(
              "PUT",
              `/item/${itemId}/categories`,
              { category_ids: [2, 999] },
              sessions[0],
            )
          ).status,
          400,
        );
        assert.deepEqual(
          (await api("GET", `/item/${itemId}/categories`)).body.map(
            (c) => c.category_id,
          ),
          [1, 4],
        );
        assert.equal(
          (
            await api(
              "PUT",
              `/item/${itemId}/categories`,
              { category_ids: [1] },
              sessions[0],
            )
          ).status,
          200,
        );
      },
    );
    await check(
      "Search treats wildcard and SQL-looking input as literal text",
      async () => {
        assert.equal(
          (await api("GET", "/search?q=" + encodeURIComponent("%' OR 1=1 --")))
            .body.length,
          0,
        );
        assert.equal((await api("GET", "/search?q=%25")).body.length, 0);
        assert.equal((await api("GET", "/users/1")).status, 200);
      },
    );
    await check(
      "Closed auctions reject bids and appear in the seller archive",
      async () => {
        const sqlite = require(path.join(backend, "node_modules/sqlite3"));
        await new Promise((resolve, reject) => {
          const db = new sqlite.Database(path.join(cwd, "db.sqlite"));
          db.run(
            "UPDATE items SET end_date=? WHERE item_id=?",
            [Date.now() - 1000, itemId],
            (err) => db.close(() => (err ? reject(err) : resolve())),
          );
        });
        assert.equal(
          (
            await api(
              "POST",
              `/item/${itemId}/bid`,
              { amount: 150 },
              sessions[1],
            )
          ).status,
          400,
        );
        assert.equal(
          (await api("GET", "/search?status=ARCHIVE", undefined, sessions[0]))
            .body.length,
          1,
        );
        assert.equal(
          (await api("GET", "/users/1")).body.auctions_ended.length,
          1,
        );
      },
    );
    await check(
      "Teaching wipe compatibility: deleting an item cleans extension records",
      async () => {
        const result = await api(
          "POST",
          "/item",
          { ...base, category_ids: [1, 4] },
          sessions[0],
        );
        assert.equal(result.status, 201);
        const temporaryId = result.body.item_id;
        const sqlite = require(path.join(backend, "node_modules/sqlite3"));
        const counts = await new Promise((resolve, reject) => {
          const db = new sqlite.Database(path.join(cwd, "db.sqlite"));
          db.serialize(() => {
            db.run("INSERT INTO item_media VALUES (?,?)", [
              temporaryId,
              "dragon",
            ]);
            db.run("DELETE FROM items WHERE item_id=?", [temporaryId]);
            db.get(
              "SELECT (SELECT COUNT(*) FROM item_categories WHERE item_id=?) AS categories, (SELECT COUNT(*) FROM item_media WHERE item_id=?) AS media",
              [temporaryId, temporaryId],
              (err, row) => db.close(() => (err ? reject(err) : resolve(row))),
            );
          });
        });
        assert.deepEqual(counts, { categories: 0, media: 0 });
      },
    );
    await check("Malformed JSON gives the API error response", async () => {
      const r = await fetch("http://127.0.0.1:3333/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      });
      assert.equal(r.status, 400);
      assert.equal(typeof (await r.json()).error_message, "string");
    });
    await check(
      "Logout revokes the token and issues a fresh token on next login",
      async () => {
        assert.equal(
          (await api("POST", "/logout", undefined, sessions[1])).status,
          200,
        );
        assert.equal(
          (await api("POST", "/item", base, sessions[1])).status,
          401,
        );
        const r = await api("POST", "/login", {
          email: users[1].email,
          password: users[1].password,
        });
        assert.equal(r.status, 200);
        assert.notEqual(r.body.session_token, sessions[1]);
      },
    );
    const report = {
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
      checks,
    };
    fs.writeFileSync(
      path.join(reports, "contract-tests.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `Independent contract checks: ${report.passed}/${report.total}`,
    );
    return report;
  } finally {
    await stop();
  }
}
(async () => {
  const originalReport = await original();
  const contractReport = await advanced();
  fs.writeFileSync(
    path.join(reports, "summary.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        original: originalReport.stats,
        contract: {
          passed: contractReport.passed,
          total: contractReport.total,
        },
      },
      null,
      2,
    ),
  );
  if (contractReport.passed !== contractReport.total) process.exitCode = 1;
})().catch(async (e) => {
  console.error(e);
  await stop();
  process.exitCode = 1;
});
