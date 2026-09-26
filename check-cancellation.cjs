// Real API checks use a temporary database; --browser keeps an isolated UI demo open.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const root = __dirname;
const backend = path.join(root, "backend-server");
const originalCwd = process.cwd();
const scratch = fs.mkdtempSync(
  path.join(os.tmpdir(), "raredrop-cancellation-"),
);
process.chdir(scratch);
const express = require(path.join(backend, "node_modules/express"));
const store = require(path.join(backend, "app/models/db"));
const checks = [];
let server,
  base,
  seller,
  buyer,
  listed,
  closing = false;
const image = fs.readFileSync(
  path.join(root, "verification/fixtures/cover-test.jpg"),
);
async function api(method, url, token, body, photo = false) {
  const r = await fetch(base + url, {
    method,
    headers: {
      ...(token ? { "X-Authorization": token } : {}),
      ...(body
        ? {
            "Content-Type": photo
              ? "application/vnd.raredrop.item+json"
              : "application/json",
          }
        : {}),
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
  const email = `${label}@cancel-test.example`;
  const created = await api("POST", "/users", null, {
    first_name: label,
    last_name: "Tester",
    email,
    password: "RareDrop2026!",
  });
  assert.equal(created.status, 201);
  const login = await api("POST", "/login", null, {
    email,
    password: "RareDrop2026!",
  });
  assert.equal(login.status, 200);
  return { id: created.body.user_id, token: login.body.session_token };
}
async function create(
  name = "Cancellation test collectible",
  withPhoto = false,
) {
  const r = await api(
    "POST",
    withPhoto ? "/item-with-photo" : "/item",
    seller.token,
    {
      name,
      description:
        "A fictional collectible used only in a temporary verification database.",
      starting_bid: 80,
      end_date: Date.now() + 86400000,
      category_ids: [1, 4],
      ...(withPhoto
        ? { photo: "data:image/jpeg;base64," + image.toString("base64") }
        : {}),
    },
    withPhoto,
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.item_id;
}
async function main() {
  await store.ready;
  const app = express();
  const routes = express.Router();
  routes.use(express.urlencoded({ extended: false }));
  routes.use(express.json());
  for (const name of ["user", "core", "question"])
    require(path.join(backend, `app/routes/${name}.server.routes`))(routes);
  routes.use((req, res) => res.sendStatus(404));
  app.use("/api", routes);
  app.use(express.static(path.join(root, "frontend-app/dist")));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
  seller = await account("seller");
  buyer = await account("buyer");
  listed = await create(undefined, true);
  const original = await store.get("SELECT * FROM items WHERE item_id=?", [
    listed,
  ]);
  await check(
    "Only the authenticated seller can cancel an existing listing",
    async () => {
      assert.equal((await api("POST", `/item/${listed}/cancel`)).status, 401);
      assert.equal(
        (await api("POST", `/item/${listed}/cancel`, buyer.token)).status,
        403,
      );
      for (const id of ["99999", "0", "abc"])
        assert.equal(
          (await api("POST", `/item/${id}/cancel`, seller.token)).status,
          404,
        );
      assert.equal((await api("GET", "/item/99999/status")).status, 404);
      assert.equal(
        (await store.get("SELECT COUNT(*) n FROM item_cancellations")).n,
        0,
      );
    },
  );
  await check(
    "Normal auctions and existing item response fields stay compatible",
    async () => {
      assert.deepEqual((await api("GET", `/item/${listed}/status`)).body, {
        status: "OPEN",
        cancelled_at: null,
      });
      const detail = (await api("GET", `/item/${listed}`)).body;
      assert.equal("status" in detail, false);
      assert.equal("cancelled_at" in detail, false);
      assert.equal(
        (await api("POST", `/item/${listed}/bid`, seller.token, { amount: 81 }))
          .status,
        403,
      );
      assert.equal(
        (await api("POST", `/item/${listed}/bid`, buyer.token, { amount: 80 }))
          .status,
        400,
      );
      assert.equal(
        (await api("POST", `/item/${listed}/bid`, buyer.token, { amount: 90 }))
          .status,
        201,
      );
      assert.equal(
        (
          await api("POST", `/item/${listed}/question`, buyer.token, {
            question_text: "Is the sleeve included?",
          })
        ).status,
        200,
      );
    },
  );
  let cancelledAt;
  await check(
    "Cancellation retains the listing, deadline, bids, questions, categories and photo",
    async () => {
      const response = await api(
        "POST",
        `/item/${listed}/cancel`,
        seller.token,
      );
      assert.equal(response.status, 200);
      assert.equal(response.body.status, "CANCELLED");
      cancelledAt = response.body.cancelled_at;
      assert.ok(Number.isSafeInteger(cancelledAt));
      assert.deepEqual(
        await store.get("SELECT * FROM items WHERE item_id=?", [listed]),
        original,
      );
      assert.equal((await api("GET", `/item/${listed}/bid`)).body.length, 1);
      assert.equal(
        (await api("GET", `/item/${listed}/question`)).body.length,
        1,
      );
      assert.equal(
        (await api("GET", `/item/${listed}/categories`)).body.length,
        2,
      );
      const r = await fetch(base + `/item/${listed}/photo`);
      assert.equal(r.status, 200);
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(image));
    },
  );
  await check(
    "Repeated cancellation is idempotent and non-owners remain forbidden",
    async () => {
      assert.deepEqual(
        (await api("POST", `/item/${listed}/cancel`, seller.token)).body,
        { status: "CANCELLED", cancelled_at: cancelledAt },
      );
      assert.deepEqual((await api("GET", `/item/${listed}/status`)).body, {
        status: "CANCELLED",
        cancelled_at: cancelledAt,
      });
      assert.equal(
        (await api("POST", `/item/${listed}/cancel`, buyer.token)).status,
        403,
      );
      assert.equal(
        (
          await store.get(
            "SELECT COUNT(*) n FROM item_cancellations WHERE item_id=?",
            [listed],
          )
        ).n,
        1,
      );
    },
  );
  await check(
    "Cancelled auctions reject new bids and questions while answers remain available",
    async () => {
      assert.equal(
        (await api("POST", `/item/${listed}/bid`, buyer.token, { amount: 100 }))
          .status,
        409,
      );
      assert.equal(
        (
          await api("POST", `/item/${listed}/question`, buyer.token, {
            question_text: "Can I still buy it?",
          })
        ).status,
        409,
      );
      const q = (await api("GET", `/item/${listed}/question`)).body[0];
      assert.equal(
        (
          await api("POST", `/question/${q.question_id}`, seller.token, {
            answer_text: "The listing was withdrawn.",
          })
        ).status,
        200,
      );
      assert.equal(
        (await api("GET", `/item/${listed}/question`)).body.length,
        1,
      );
      assert.equal((await api("GET", `/item/${listed}/bid`)).body.length, 1);
    },
  );
  await check(
    "Cancelled listings leave discovery and selling, but remain in archive and bidder history",
    async () => {
      const includes = (r) => r.body.some((i) => i.item_id === listed);
      for (const query of [
        "",
        "?category_id=1",
        "?q=Cancellation",
        "?status=OPEN",
      ])
        assert.equal(
          includes(await api("GET", "/search" + query, seller.token)),
          false,
        );
      assert.equal(
        includes(
          await api(
            "GET",
            "/search?status=ARCHIVE&category_id=4",
            seller.token,
          ),
        ),
        true,
      );
      assert.equal(
        includes(await api("GET", "/search?status=BID", buyer.token)),
        true,
      );
      const profile = (await api("GET", `/users/${seller.id}`)).body;
      assert.equal(
        profile.selling.some((i) => i.item_id === listed),
        false,
      );
      assert.equal(
        profile.auctions_ended.some((i) => i.item_id === listed),
        true,
      );
      assert.equal(
        (await api("GET", `/users/${buyer.id}`)).body.bidding_on.some(
          (i) => i.item_id === listed,
        ),
        true,
      );
    },
  );
  await check(
    "Naturally ended auctions cannot be cancelled or accept bids",
    async () => {
      const itemId = await create("Ended test collectible");
      await store.run("UPDATE items SET end_date=? WHERE item_id=?", [
        Date.now() - 1000,
        itemId,
      ]);
      assert.deepEqual((await api("GET", `/item/${itemId}/status`)).body, {
        status: "ENDED",
        cancelled_at: null,
      });
      assert.equal(
        (await api("POST", `/item/${itemId}/cancel`, seller.token)).status,
        409,
      );
      assert.equal(
        (await api("POST", `/item/${itemId}/bid`, buyer.token, { amount: 100 }))
          .status,
        400,
      );
    },
  );
  await check(
    "Storage failure rolls back cancellation and leaves the auction open",
    async () => {
      const itemId = await create("Rollback test collectible");
      await store.run(
        "CREATE TRIGGER fail_cancel BEFORE INSERT ON item_cancellations BEGIN SELECT RAISE(ABORT, 'intentional cancellation failure'); END",
      );
      try {
        assert.equal(
          (await api("POST", `/item/${itemId}/cancel`, seller.token)).status,
          500,
        );
      } finally {
        await store.run("DROP TRIGGER fail_cancel");
      }
      assert.equal(
        (await api("GET", `/item/${itemId}/status`)).body.status,
        "OPEN",
      );
      assert.equal(
        (await api("POST", `/item/${itemId}/bid`, buyer.token, { amount: 100 }))
          .status,
        201,
      );
    },
  );
  await check(
    "Concurrent cancellation and bidding never accept a bid after cancellation",
    async () => {
      const itemId = await create("Race test collectible");
      const [cancel, bid] = await Promise.all([
        api("POST", `/item/${itemId}/cancel`, seller.token),
        api("POST", `/item/${itemId}/bid`, buyer.token, { amount: 100 }),
      ]);
      assert.equal(cancel.status, 200);
      assert.ok([201, 409].includes(bid.status));
      const history = (await api("GET", `/item/${itemId}/bid`)).body;
      assert.equal(history.length, bid.status === 201 ? 1 : 0);
      assert.ok(history.every((b) => b.timestamp <= cancel.body.cancelled_at));
      assert.equal(
        (await api("POST", `/item/${itemId}/bid`, buyer.token, { amount: 101 }))
          .status,
        409,
      );
    },
  );
  await check(
    "Teaching-style database cleanup also removes cancellation metadata",
    async () => {
      const itemId = await create("Cleanup test collectible");
      assert.equal(
        (await api("POST", `/item/${itemId}/cancel`, seller.token)).status,
        200,
      );
      await store.run("PRAGMA foreign_keys=OFF");
      try {
        await store.run("DELETE FROM items WHERE item_id=?", [itemId]);
      } finally {
        await store.run("PRAGMA foreign_keys=ON");
      }
      assert.equal(
        await store.get("SELECT * FROM item_cancellations WHERE item_id=?", [
          itemId,
        ]),
        undefined,
      );
    },
  );
}
async function cleanup() {
  if (closing) return;
  closing = true;
  if (server) await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => store.db.close(resolve));
  process.chdir(originalCwd);
  const resolved = fs.realpathSync(scratch);
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("raredrop-cancellation-")
  )
    throw new Error("Unexpected test directory; cleanup cancelled.");
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
      path.join(root, "verification/cancellation-tests.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (process.argv.includes("--browser") && !process.exitCode) {
      const itemId = await create("Cancellation UI demo");
      await store.run("INSERT INTO item_media VALUES (?,?)", [
        itemId,
        "dragon",
      ]);
      await api("POST", `/item/${itemId}/bid`, buyer.token, { amount: 95 });
      console.log(
        `ISOLATED_BROWSER_URL=${base.replace(/\/api$/, "")}/#/item/${itemId}`,
      );
      console.log(
        "Seller: seller@cancel-test.example / RareDrop2026! (temporary database only)",
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
