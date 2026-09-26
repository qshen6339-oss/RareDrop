const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = __dirname;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "raredrop-year-seed-"));
process.chdir(scratch);
const store = require(path.join(root, "backend-server/app/models/db"));
const { seedYearCollections } = require(
  path.join(root, "backend-server/app/tools/seed-year-collections"),
);
(async () => {
  await store.ready;
  await store.run(
    "INSERT INTO users(user_id,first_name,last_name,email) VALUES(1,'Demo','Seller','sky@raredrop.example')",
  );
  await store.run(
    "INSERT INTO items(item_id,name,description,starting_bid,start_date,end_date,creator_id) VALUES(1,'Existing auction','Keep this record',20,1,2,1)",
  );
  const existing = await store.get("SELECT * FROM items WHERE item_id=1");
  const added = await seedYearCollections();
  assert.equal(added.length, 42);
  assert.equal(new Set(added.map((i) => i.name)).size, 42);
  for (let category = 1; category <= 14; category++)
    assert.equal(added.filter((i) => i.category_id === category).length, 3);
  const start = added[0].start_date,
    anniversary = new Date(start);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  assert(
    added.every(
      (i) =>
        i.start_date === start &&
        i.end_date > start &&
        i.end_date <= anniversary.getTime(),
    ),
  );
  assert.equal(
    Math.max(...added.map((i) => i.end_date)),
    anniversary.getTime(),
  );
  assert.equal(new Set(added.map((i) => i.end_date)).size, 42);
  const source = fs.readFileSync(
    path.join(root, "frontend-app/src/state.js"),
    "utf8",
  );
  for (const key of new Set(added.map((i) => i.image_key))) {
    const match = source.match(new RegExp(key + ': "(/images/[^"\\n]+)"'));
    assert(match, `Image mapping missing: ${key}`);
    assert(fs.existsSync(path.join(root, "frontend-app/public", match[1])));
  }
  assert.equal((await store.get("SELECT COUNT(*) n FROM item_photos")).n, 0);
  const beforeRepeat = await store.all("SELECT * FROM items ORDER BY item_id");
  assert.equal((await seedYearCollections()).length, 0);
  assert.deepEqual(
    await store.all("SELECT * FROM items ORDER BY item_id"),
    beforeRepeat,
  );
  assert.deepEqual(
    await store.get("SELECT * FROM items WHERE item_id=1"),
    existing,
  );
  console.log(
    "PASS: 42 unique listings; 3 per category; 42 staggered end dates within one year; all 14 images reused; repeat run and existing records preserved.",
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise((resolve) => store.db.close(resolve));
    process.chdir(root);
    const resolved = fs.realpathSync(scratch);
    if (
      path.dirname(resolved) === fs.realpathSync(os.tmpdir()) &&
      path.basename(resolved).startsWith("raredrop-year-seed-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  });
