const path = require("node:path");
if (require.main === module) process.chdir(path.resolve(__dirname, "../.."));
const { ready, write, run, get, db } = require("../models/db");
const { products } = require("./seed-collections");

const batch = "2026-27";
// This fixed batch name makes repeat runs safe: existing copies and dates stay intact.
async function seedYearCollections() {
  await ready;
  const added = await write(async () => {
    const seller = await get("SELECT user_id FROM users WHERE email=?", [
      "sky@raredrop.example",
    ]);
    if (!seller)
      throw new Error(
        "Run the demo account seed before adding the yearly collection batch.",
      );
    const now = Date.now();
    const anniversary = new Date(now);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    const duration = anniversary.getTime() - now;
    const created = [];
    for (let copy = 1; copy <= 3; copy++) {
      for (const [
        index,
        [category, originalName, price, imageKey, details],
      ] of products.entries()) {
        const name = `${originalName} · Collector copy ${copy} (${batch})`;
        if (
          await get("SELECT item_id FROM items WHERE name=? AND creator_id=?", [
            name,
            seller.user_id,
          ])
        )
          continue;
        const collection = await get(
          "SELECT category_id FROM categories WHERE name=?",
          [category],
        );
        if (!collection) throw new Error(`Missing collection: ${category}`);
        // Interleave categories across three rounds, with the final auction ending in one year.
        const position = (copy - 1) * products.length + index + 1;
        const end =
          now + Math.round((duration * position) / (products.length * 3));
        const item = await run(
          "INSERT INTO items(name,description,starting_bid,start_date,end_date,creator_id) VALUES(?,?,?,?,?,?)",
          [
            name,
            `${details}\n\nCollector copy ${copy} of the ${batch} RareDrop demo batch. The existing illustration is reused to represent this separate example listing. Fictional collectible for the coursework demo.`,
            Math.round(price * (1 + (copy - 1) * 0.1)),
            now,
            end,
            seller.user_id,
          ],
        );
        await run(
          "INSERT INTO item_categories(item_id,category_id) VALUES(?,?)",
          [item.id, collection.category_id],
        );
        await run("INSERT INTO item_media(item_id,image_key) VALUES(?,?)", [
          item.id,
          imageKey,
        ]);
        created.push({
          item_id: item.id,
          category_id: collection.category_id,
          name,
          image_key: imageKey,
          start_date: now,
          end_date: end,
        });
      }
    }
    return created;
  });
  console.log(
    `Yearly collection batch: ${added.length} added; existing auctions preserved.`,
  );
  return added;
}

module.exports = { seedYearCollections, batch };
if (require.main === module) {
  seedYearCollections()
    .then(() => db.close())
    .catch((error) => {
      console.error(error);
      db.close();
      process.exitCode = 1;
    });
}
