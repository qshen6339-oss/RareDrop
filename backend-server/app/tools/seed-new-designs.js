const fs = require("node:fs");
const path = require("node:path");
if (require.main === module) process.chdir(path.resolve(__dirname, "../.."));
const { ready, write, run, get, db } = require("../models/db");
const { assets } = require("../../../IMAGE_CREDITS_NEW_COLLECTIONS.json");
const root = path.resolve(__dirname, "../../..");

async function seedNewDesigns() {
  await ready;
  // Never publish a new design before its final local artwork has been saved.
  for (const product of assets) {
    if (
      !/^frontend-app\/public\/images\/raredrop-[a-z0-9-]+\.png$/.test(
        product.path,
      ) ||
      !fs.existsSync(path.join(root, product.path))
    )
      throw new Error(`Missing product artwork: ${product.image_key}`);
  }
  const added = await write(async () => {
    const seller = await get("SELECT user_id FROM users WHERE email=?", [
      "sky@raredrop.example",
    ]);
    if (!seller)
      throw new Error(
        "The demo seller must be created before importing new designs.",
      );
    const now = Date.now(),
      anniversary = new Date(now);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    const created = [];
    for (const [index, product] of assets.entries()) {
      if (
        await get("SELECT item_id FROM items WHERE creator_id=? AND name=?", [
          seller.user_id,
          product.name,
        ])
      )
        continue;
      if (
        !(await get("SELECT category_id FROM categories WHERE category_id=?", [
          product.category_id,
        ]))
      )
        throw new Error("Unknown product category.");
      const end =
        now +
        Math.round(
          ((anniversary.getTime() - now) * (index + 1)) / assets.length,
        );
      const result = await run(
        "INSERT INTO items(name,description,starting_bid,start_date,end_date,creator_id) VALUES(?,?,?,?,?,?)",
        [
          product.name,
          `${product.description}\n\nOriginal fictional collectible for the RareDrop coursework demo. The image is original illustrative artwork.`,
          product.starting_bid,
          now,
          end,
          seller.user_id,
        ],
      );
      await run(
        "INSERT INTO item_categories(item_id,category_id) VALUES(?,?)",
        [result.id, product.category_id],
      );
      await run("INSERT INTO item_media(item_id,image_key) VALUES(?,?)", [
        result.id,
        product.image_key,
      ]);
      created.push({
        item_id: result.id,
        name: product.name,
        category_id: product.category_id,
        image_key: product.image_key,
        start_date: now,
        end_date: end,
      });
    }
    return created;
  });
  console.log(
    `New collectible designs: ${added.length} added; existing auctions preserved.`,
  );
  return added;
}
module.exports = { seedNewDesigns };
if (require.main === module)
  seedNewDesigns()
    .then(() => db.close())
    .catch((error) => {
      console.error(error);
      db.close();
      process.exitCode = 1;
    });
