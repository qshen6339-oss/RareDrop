const db = require("../../database");
const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
    }),
  );
const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))),
  );
const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))),
  );
// The supplied database creates its four tables asynchronously on first connection.
const ready = (async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = await get(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('users','items','bids','questions')",
    );
    if (row.n === 4) break;
    if (attempt === 99) throw new Error("Database initialization timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await run("PRAGMA busy_timeout = 5000");
  await run("PRAGMA foreign_keys = ON");
  await run(
    "CREATE TABLE IF NOT EXISTS categories (category_id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)",
  );
  await run(
    "CREATE TABLE IF NOT EXISTS item_categories (item_id INTEGER REFERENCES items(item_id) ON DELETE CASCADE, category_id INTEGER REFERENCES categories(category_id), PRIMARY KEY(item_id,category_id))",
  );
  await run(
    "CREATE TABLE IF NOT EXISTS item_media (item_id INTEGER PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE, image_key TEXT NOT NULL)",
  );
  await run(
    "CREATE TABLE IF NOT EXISTS item_photos (item_id INTEGER PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE, data BLOB NOT NULL)",
  );
  await run(
    "CREATE TABLE IF NOT EXISTS item_cancellations (item_id INTEGER PRIMARY KEY REFERENCES items(item_id) ON DELETE CASCADE, cancelled_at INTEGER NOT NULL)",
  );
  await run(
    "CREATE TRIGGER IF NOT EXISTS cleanup_item_cancellations AFTER DELETE ON items BEGIN DELETE FROM item_cancellations WHERE item_id=OLD.item_id; END",
  );
  await run(
    "CREATE TRIGGER IF NOT EXISTS cleanup_item_photos AFTER DELETE ON items BEGIN DELETE FROM item_photos WHERE item_id=OLD.item_id; END",
  );
  // The teaching wipe script opens a separate connection without foreign_keys enabled.
  // A trigger keeps extension records consistent even when that script clears items.
  await run(
    "CREATE TRIGGER IF NOT EXISTS cleanup_item_extensions AFTER DELETE ON items BEGIN DELETE FROM item_categories WHERE item_id=OLD.item_id; DELETE FROM item_media WHERE item_id=OLD.item_id; END",
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_items_creator_end ON items(creator_id,end_date)",
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_bids_user_item ON bids(user_id,item_id)",
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_questions_item ON questions(item_id,question_id)",
  );
  for (const [id, name] of [
    [1, "Trading cards"],
    [2, "Designer figures"],
    [3, "Mecha"],
    [4, "Limited editions"],
    [5, "Blind boxes"],
    [6, "Plush toys"],
    [7, "Model cars"],
    [8, "Model kits"],
    [9, "Building blocks"],
    [10, "Comics & manga"],
    [11, "Art books"],
    [12, "Badges & pins"],
    [13, "Keychains & charms"],
    [14, "Acrylic stands"],
  ])
    await run(
      "INSERT OR IGNORE INTO categories(category_id,name) VALUES (?,?)",
      [id, name],
    );
})();
// Serialize whole write transactions, including awaited reads, on this connection.
let tail = Promise.resolve();
function write(action) {
  const next = tail.then(async () => {
    await ready;
    await run("BEGIN IMMEDIATE");
    try {
      const result = await action();
      await run("COMMIT");
      return result;
    } catch (err) {
      await run("ROLLBACK");
      throw err;
    }
  });
  tail = next.catch(() => {});
  return next;
}
module.exports = { db, run, get, all, ready, write };
