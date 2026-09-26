const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = __dirname,
  backend = path.join(root, "backend-server");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "raredrop-discover-"));
process.chdir(scratch);
const express = require(path.join(backend, "node_modules/express"));
const store = require(path.join(backend, "app/models/db"));
const db = require(path.join(backend, "database"));
const checks = [];
let server, base;
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
    process.exitCode = 1;
  }
}
async function get(query = "") {
  const response = await fetch(base + "/discover" + query);
  return { status: response.status, data: await response.json() };
}
(async () => {
  await store.ready;
  await store.run(
    "INSERT INTO users(user_id,first_name,last_name,email,session_token) VALUES(1,'Demo','Seller','private@example.test','private-token')",
  );
  await store.run(
    "INSERT INTO users(user_id,first_name,last_name) VALUES(2,'Demo','Bidder')",
  );
  const keys = [
    "dragon",
    "rabbit",
    "mecha",
    "limited",
    "blindbox",
    "plush",
    "car",
    "kit",
    "blocks",
    "comic",
    "artbook",
    "pins",
    "charm",
    "stand",
  ];
  async function item(name, categories, ended = false) {
    const record = await store.run(
      "INSERT INTO items(name,description,starting_bid,start_date,end_date,creator_id) VALUES(?,?,?,?,?,1)",
      [
        name,
        "A test collectible",
        80,
        Date.now() - 10000,
        Date.now() + (ended ? -1000 : 86400000),
      ],
    );
    for (const id of categories)
      await store.run("INSERT INTO item_categories VALUES(?,?)", [
        record.id,
        id,
      ]);
    await store.run("INSERT INTO item_media VALUES(?,?)", [
      record.id,
      keys[(categories[0] || 4) - 1],
    ]);
    return record.id;
  }
  const ids = [];
  for (let c = 1; c <= 14; c++) ids.push(await item(`Category ${c}`, [c]));
  for (let i = 0; i < 8; i++)
    await item(i === 0 ? "100%_special" : "Extra card " + i, [1]);
  const multi = await item("Cross-category collectible", [1, 2]);
  const uncategorized = await item("No category", []);
  const ended = await item("Ended collectible", [1], true);
  const cancelled = await item("Cancelled collectible", [1]);
  await store.run("INSERT INTO item_cancellations VALUES(?,?)", [
    cancelled,
    Date.now(),
  ]);
  await store.run("INSERT INTO bids VALUES(?,?,?,?)", [
    ids[0],
    2,
    95,
    Date.now(),
  ]);
  await store.run("INSERT INTO item_photos VALUES(?,?)", [
    ids[0],
    Buffer.from("temporary media fixture"),
  ]);
  const app = express();
  app.use(express.json());
  require(path.join(backend, "app/routes/core.server.routes"))(app);
  require(path.join(backend, "app/routes/user.server.routes"))(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  await check(
    "Catalogue pagination covers all public items without cancelled items or duplicates",
    async () => {
      const pages = await Promise.all(
        [0, 12, 24].map((offset) => get(`?offset=${offset}`)),
      );
      assert.deepEqual(
        pages.map((p) => p.data.items.length),
        [12, 12, 0],
      );
      const all = pages.flatMap((p) => p.data.items.map((i) => i.item_id));
      assert.equal(new Set(all).size, 24);
      assert(!all.includes(cancelled));
      assert(!all.includes(ended));
      for (const p of pages) assert.equal(p.data.total, 24);
    },
  );
  await check(
    "Four groups cover all fourteen categories and counts include items beyond the first page",
    async () => {
      const all = (await get()).data;
      assert.equal(all.groups.length, 4);
      assert.equal(all.collections.length, 14);
      assert.deepEqual(
        all.groups.map((g) => g.count),
        [12, 4, 4, 5],
      );
      const union = new Set();
      for (const group of all.groups) {
        const result = (await get(`?group=${group.id}&limit=100`)).data;
        assert.equal(result.total, group.count);
        result.items.forEach((i) => union.add(i.item_id));
      }
      assert.equal(union.size, 24);
    },
  );
  await check(
    "Multiple categories have inclusive membership; uncategorized goods remain discoverable",
    async () => {
      for (const group of ["cards-books", "figures-toys"])
        assert(
          (await get(`?group=${group}&limit=100`)).data.items.some(
            (i) => i.item_id === multi,
          ),
        );
      assert(
        (await get("?group=extras-editions&limit=100")).data.items.some(
          (i) => i.item_id === uncategorized,
        ),
      );
      const cards = (await get("?category_id=1&limit=100")).data;
      assert.equal(cards.total, 10);
      assert.equal(
        cards.collections.find((c) => c.category_id === 1).count,
        10,
      );
    },
  );
  await check(
    "Search combines with groups and categories, treats wildcards literally and reports no results",
    async () => {
      assert.equal(
        (await get("?q=category&group=models-building")).data.total,
        4,
      );
      assert.equal((await get("?q=category&category_id=3")).data.total, 1);
      assert.equal((await get("?q=%25_")).data.total, 1);
      assert.equal((await get("?q=absent")).data.total, 0);
      assert.equal((await get("?category_id=999")).data.items.length, 0);
    },
  );
  await check(
    "Featured slides are unique, live and illustrated, with no ended or cancelled auction",
    async () => {
      const { featured } = (await get()).data;
      assert.equal(featured.length, 6);
      assert.equal(new Set(featured.map((i) => i.item_id)).size, 6);
      assert(
        featured.every(
          (i) =>
            i.status === "OPEN" &&
            i.end_date > Date.now() &&
            (i.photo_url || i.image_key),
        ),
      );
      assert(!featured.some((i) => [ended, cancelled].includes(i.item_id)));
    },
  );
  await check(
    "Cards expose current prices and photo routes without private user data or binary images",
    async () => {
      const result = (await get("?limit=100")).data;
      const card = result.items.find((i) => i.item_id === ids[0]);
      assert.equal(card.current_bid, 95);
      assert.equal(card.photo_url, `/item/${ids[0]}/photo`);
      assert.equal(card.categories[0].name, "Trading cards");
      assert(!JSON.stringify(result).includes("private-token"));
      assert(!JSON.stringify(result).includes("private@example.test"));
      assert(!("data" in card));
      const legacy = await (await fetch(base + "/search?limit=1")).json();
      assert(!("photo_url" in legacy[0]));
      assert(!("categories" in legacy[0]));
    },
  );
  await check(
    "New publication updates lists, category/group counts and featured photos together",
    async () => {
      const before = (await get()).data;
      const photo =
        "data:image/jpeg;base64," +
        fs
          .readFileSync(path.join(root, "verification/fixtures/cover-test.jpg"))
          .toString("base64");
      const response = await fetch(base + "/item-with-photo", {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.raredrop.item+json",
          "X-Authorization": "private-token",
        },
        body: JSON.stringify({
          name: "Fresh collector photo",
          description: "Brand new test collectible",
          starting_bid: 30,
          end_date: Date.now() + 86400000,
          category_ids: [5, 6],
          photo,
        }),
      });
      assert.equal(response.status, 201);
      const { item_id } = await response.json();
      const after = (await get()).data;
      assert.equal(after.total_items, before.total_items + 1);
      assert.equal(after.items[0].item_id, item_id);
      assert(after.featured.some((i) => i.item_id === item_id && i.photo_url));
      for (const id of [5, 6])
        assert.equal(
          after.collections.find((c) => c.category_id === id).count,
          before.collections.find((c) => c.category_id === id).count + 1,
        );
      assert.equal(
        after.groups.find((g) => g.id === "figures-toys").count,
        before.groups.find((g) => g.id === "figures-toys").count + 1,
      );
      assert(
        (await get("?q=Fresh&category_id=5")).data.items.some(
          (i) => i.item_id === item_id,
        ),
      );
      const cancel = await fetch(base + `/item/${item_id}/cancel`, {
        method: "POST",
        headers: { "X-Authorization": "private-token" },
      });
      assert.equal(cancel.status, 200);
      const hidden = (await get("?limit=100")).data;
      assert.equal(hidden.total_items, before.total_items);
      assert.deepEqual(hidden.groups, before.groups);
      assert.deepEqual(hidden.collections, before.collections);
      assert(!hidden.items.some((i) => i.item_id === item_id));
      assert(!hidden.featured.some((i) => i.item_id === item_id));
      const profile = await (await fetch(base + "/users/1")).json();
      assert(profile.auctions_ended.some((i) => i.item_id === item_id));
    },
  );
  await check(
    "Expiry removes public listings and counters while preserving details, bids and account history",
    async () => {
      const before = (await get()).data;
      const soon = await item("Expiring collectible", [3]);
      await store.run("INSERT INTO bids VALUES(?,?,?,?)", [
        soon,
        2,
        90,
        Date.now(),
      ]);
      const boundary = Date.now() + 500;
      await store.run("UPDATE items SET end_date=? WHERE item_id=?", [
        boundary,
        soon,
      ]);
      const response = await fetch(base + "/discover?limit=100");
      assert.equal(response.headers.get("cache-control"), "no-store");
      const open = await response.json();
      assert.equal(open.next_expiry, boundary);
      assert(open.server_time < boundary);
      assert(open.items.some((i) => i.item_id === soon));
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, boundary - Date.now()) + 30),
      );
      const endedView = (await get("?limit=100")).data;
      assert.equal(endedView.total_items, before.total_items);
      assert.deepEqual(endedView.collections, before.collections);
      assert.deepEqual(endedView.groups, before.groups);
      assert(!endedView.items.some((i) => i.item_id === soon));
      assert(!endedView.featured.some((i) => i.item_id === soon));
      assert.equal((await fetch(base + `/item/${soon}`)).status, 200);
      assert.equal(
        (await (await fetch(base + `/item/${soon}/bid`)).json()).length,
        1,
      );
      const profile = await (await fetch(base + "/users/1")).json();
      assert(!profile.selling.some((i) => i.item_id === soon));
      assert(profile.auctions_ended.some((i) => i.item_id === soon));
      assert(
        await store.get("SELECT item_id FROM items WHERE item_id=?", [soon]),
      );
    },
  );
  await check(
    "Invalid filters fail safely and a catalogue with no items keeps all four navigation groups",
    async () => {
      for (const query of [
        "?group=invalid",
        "?limit=101",
        "?offset=-1",
        "?category_id=0",
      ])
        assert.equal((await get(query)).status, 400);
      await store.run("DELETE FROM bids");
      await store.run("DELETE FROM items");
      const empty = (await get()).data;
      assert.equal(empty.next_expiry, null);
      assert.equal(empty.total, 0);
      assert.equal(empty.items.length, 0);
      assert.equal(empty.featured.length, 0);
      assert.equal(empty.groups.length, 4);
      assert(empty.groups.every((g) => g.count === 0));
    },
  );
  const report = {
    date: new Date().toISOString(),
    passed: checks.filter((c) => c.passed).length,
    total: checks.length,
    checks,
  };
  fs.writeFileSync(
    path.join(root, "verification/discover-tests.json"),
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
    await new Promise((resolve) => db.close(resolve));
    process.chdir(root);
    const resolved = fs.realpathSync(scratch);
    if (
      path.dirname(resolved) === fs.realpathSync(os.tmpdir()) &&
      path.basename(resolved).startsWith("raredrop-discover-")
    )
      fs.rmSync(resolved, { recursive: true, force: true });
  });
