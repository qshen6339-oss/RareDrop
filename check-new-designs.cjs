const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const root = __dirname,
  backend = path.join(root, "backend-server");
const { assets } = require("./IMAGE_CREDITS_NEW_COLLECTIONS.json");
const mappings = require("./frontend-app/src/new-product-images.json");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "raredrop-new-designs-"));
process.chdir(scratch);
const store = require(path.join(backend, "app/models/db"));
const { seedNewDesigns } = require(
  path.join(backend, "app/tools/seed-new-designs"),
);
const express = require(path.join(backend, "node_modules/express"));
const checks = [];
let server;
async function check(name, test) {
  await test();
  checks.push({ name, passed: true });
}
(async () => {
  await store.ready;
  await store.run(
    "INSERT INTO users(user_id,first_name,last_name,email) VALUES(1,'Demo','Seller','sky@raredrop.example')",
  );
  await store.run(
    "INSERT INTO items(item_id,name,description,starting_bid,start_date,end_date,creator_id) VALUES(1,'Existing auction','Preserve this',20,1,2,1)",
  );
  const original = await store.get("SELECT * FROM items WHERE item_id=1");
  await check(
    "All 28 square artworks exist, are distinct and map to their frontend image keys",
    () => {
      assert.equal(assets.length, 28);
      const hashes = new Set();
      for (const item of assets) {
        assert.equal(
          mappings[item.image_key],
          item.path.replace("frontend-app/public", ""),
        );
        const data = fs.readFileSync(path.join(root, item.path));
        assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(data.readUInt32BE(16), data.readUInt32BE(20));
        assert(data.readUInt32BE(16) >= 1024);
        hashes.add(crypto.createHash("sha256").update(data).digest("hex"));
      }
      assert.equal(hashes.size, 28);
      const fresh = new Set(assets.map((p) => path.basename(p.path)));
      for (const file of fs.readdirSync(
        path.join(root, "frontend-app/public/images"),
      )) {
        if (fresh.has(file) || !file.endsWith(".png")) continue;
        const hash = crypto
          .createHash("sha256")
          .update(
            fs.readFileSync(
              path.join(root, "frontend-app/public/images", file),
            ),
          )
          .digest("hex");
        assert(
          !hashes.has(hash),
          "A new image must not reuse an old image file.",
        );
      }
    },
  );
  const added = await seedNewDesigns();
  await check(
    "Each of the fourteen categories receives exactly two separately named listings",
    () => {
      assert.equal(added.length, 28);
      assert.equal(new Set(added.map((i) => i.name)).size, 28);
      for (let id = 1; id <= 14; id++)
        assert.equal(added.filter((i) => i.category_id === id).length, 2);
    },
  );
  await check(
    "All end dates are distinct and fall within the next year",
    () => {
      const start = added[0].start_date,
        anniversary = new Date(start);
      anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
      assert(
        added.every(
          (i) => i.end_date > start && i.end_date <= anniversary.getTime(),
        ),
      );
      assert.equal(new Set(added.map((i) => i.end_date)).size, 28);
      assert.equal(
        Math.max(...added.map((i) => i.end_date)),
        anniversary.getTime(),
      );
    },
  );
  const app = express();
  require(path.join(backend, "app/routes/core.server.routes"))(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  await check(
    "Public catalogue, four groups and featured slides expose the matching new artwork",
    async () => {
      const data = await (await fetch(base + "/discover?limit=100")).json();
      assert.equal(data.total_items, 28);
      assert(data.collections.every((c) => c.count === 2));
      assert.deepEqual(
        data.groups.map((g) => g.count),
        [6, 6, 8, 8],
      );
      assert.equal(data.featured.length, 6);
      for (const item of data.items) {
        const spec = assets.find((a) => a.name === item.name);
        assert.equal(item.image_key, spec.image_key);
        assert.equal(item.categories[0].category_id, spec.category_id);
        assert(mappings[item.image_key]);
      }
    },
  );
  await check(
    "Repeat import creates no duplicates and preserves existing items and auction deadlines",
    async () => {
      const before = await store.all("SELECT * FROM items ORDER BY item_id");
      assert.equal((await seedNewDesigns()).length, 0);
      assert.deepEqual(
        await store.all("SELECT * FROM items ORDER BY item_id"),
        before,
      );
      assert.deepEqual(
        await store.get("SELECT * FROM items WHERE item_id=1"),
        original,
      );
    },
  );
  const report = {
    date: new Date().toISOString(),
    passed: checks.length,
    total: 5,
    checks,
  };
  fs.writeFileSync(
    path.join(root, "verification/new-designs-tests.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => store.db.close(resolve));
    process.chdir(root);
    const resolved = fs.realpathSync(scratch);
    if (
      path.dirname(resolved) === fs.realpathSync(os.tmpdir()) &&
      path.basename(resolved).startsWith("raredrop-new-designs-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  });
