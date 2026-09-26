const { ready, write, run, get, db } = require("../models/db");

// Each entry belongs to exactly one collection. Existing auctions are never reset.
const products = [
  [
    "Trading cards",
    "Astral Dragon · Starlight card",
    45,
    "dragon",
    "A sleeved Astral Archive fantasy trading card with violet and teal artwork. Near-mint card, intact corners; clear protective sleeve included.",
  ],
  [
    "Designer figures",
    "Lunar Courier · Studio figure",
    85,
    "rabbit",
    "A 16 cm astronaut rabbit vinyl figure in an orange and white suit. Excellent display condition; original box included with light shelf wear.",
  ],
  [
    "Mecha",
    "Aster MK-07 · Hangar display",
    140,
    "mecha",
    "An assembled cyan mecha with its round display base. Approximately 18 cm tall, complete accessories, no visible paint damage; original box included.",
  ],
  [
    "Limited editions",
    "Starfall · Numbered collector set",
    110,
    "limited",
    "A fictional numbered collector set, edition 027 of 200, containing an art print, enamel medallion and presentation box. Opened for inspection; all pieces and the edition certificate included.",
  ],
  [
    "Blind boxes",
    "Cloud Parade · Mystery mini",
    18,
    "blindbox",
    "One unopened Cloud Parade blind box from an original fictional six-character series. Factory seal intact with a small crease on the outer box. Character is random; no particular design or rare variant is guaranteed.",
  ],
  [
    "Plush toys",
    "Moonbean · Sleepy cloud plush",
    28,
    "plush",
    "A 25 cm pastel lavender cloud plush with embroidered sleepy eyes. Clean display condition, original hang tag attached; no stains or loose seams. Stored in a smoke-free home.",
  ],
  [
    "Model cars",
    "Neon Sprint · 1:64 die-cast coupe",
    32,
    "car",
    "An original fictional turquoise racing coupe with pink wheel rims at 1:64 scale. Die-cast body, free-rolling wheels and clear display case. Excellent condition; case has light surface scratches.",
  ],
  [
    "Model kits",
    "Orbit Scout · Space rover kit",
    42,
    "kit",
    "An unassembled fictional lunar rover plastic model kit with six wheels and a movable antenna. All runners remain sealed; illustrated instructions and decal sheet included. Outer box has minor corner wear.",
  ],
  [
    "Building blocks",
    "Pocket Galaxy · Observatory build",
    38,
    "blocks",
    "A 420-piece original observatory building set with a rotating telescope and opening dome. Previously assembled, carefully counted and bagged; printed instructions and spare pieces included. Small parts; suitable for ages 14 and up.",
  ],
  [
    "Comics & manga",
    "Neon City Dispatch · Volume 1",
    15,
    "comic",
    "Volume one of an original fictional science-fiction comic about bicycle couriers in a floating city. English-language paperback, 160 pages. Very good condition with a small spine crease; no missing pages or annotations.",
  ],
  [
    "Art books",
    "Worlds of Wonder · Concept art volume",
    48,
    "artbook",
    "A fictional hardcover collection of fantasy environments, character sketches and colour studies. 128 full-colour pages, dust jacket included. Excellent pages; slight shelf wear at the jacket corners.",
  ],
  [
    "Badges & pins",
    "Cosmic Club · Enamel pin trio",
    12,
    "pins",
    "Three original hard-enamel pins: a crescent moon, a shooting star and a tiny rocket. Each measures approximately 3 cm and includes a rubber clutch. Unworn, presented on the original backing card.",
  ],
  [
    "Keychains & charms",
    "Lucky Comet · Holographic charm",
    10,
    "charm",
    "A 6 cm original comet-shaped acrylic bag charm with a holographic finish and silver-tone clasp. Unused, with protective film still attached on both sides. Includes a small storage pouch.",
  ],
  [
    "Acrylic stands",
    "Starbound Cafe · Character stand",
    22,
    "stand",
    "An original illustrated space-barista acrylic stand, approximately 15 cm tall, with a matching crescent-shaped base. Clear print with no visible scratches; protective film and original sleeve included.",
  ],
];

async function seedCollections() {
  await ready;
  const result = await write(async () => {
    const seller = await get("SELECT user_id FROM users WHERE email = ?", [
      "sky@raredrop.example",
    ]);
    if (!seller) {
      console.log("No Sky demo account; collection demos skipped.");
      return [];
    }
    const now = Date.now();
    const added = [];
    for (const [
      index,
      [category, name, price, imageKey, details],
    ] of products.entries()) {
      const existing = await get(
        "SELECT item_id FROM items WHERE name = ? AND creator_id = ?",
        [name, seller.user_id],
      );
      if (existing) {
        // Backfill missing demo artwork, preserving uploaded photos and existing media.
        if (imageKey)
          await run(
            "INSERT OR IGNORE INTO item_media(item_id,image_key) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM item_photos WHERE item_id=?)",
            [existing.item_id, imageKey, existing.item_id],
          );
        continue;
      }
      const collection = await get(
        "SELECT category_id FROM categories WHERE name = ?",
        [category],
      );
      if (!collection) throw new Error(`Missing collection: ${category}`);
      const item = await run(
        "INSERT INTO items(name,description,starting_bid,start_date,end_date,creator_id) VALUES (?,?,?,?,?,?)",
        [
          name,
          `${details}\n\nFictional collectible for the RareDrop coursework demo. Any artwork is illustrative.`,
          price,
          now,
          now + (7 + index) * 86400000,
          seller.user_id,
        ],
      );
      await run(
        "INSERT INTO item_categories(item_id,category_id) VALUES (?,?)",
        [item.id, collection.category_id],
      );
      if (imageKey)
        await run("INSERT INTO item_media(item_id,image_key) VALUES (?,?)", [
          item.id,
          imageKey,
        ]);
      added.push({ item_id: item.id, category, name });
    }
    return added;
  });
  console.log(
    `Collection demos: ${result.length} added; existing auctions preserved.`,
  );
  return result;
}

module.exports = { seedCollections, products };
if (require.main === module) {
  seedCollections()
    .then(() => db.close())
    .catch((error) => {
      console.error(error);
      db.close();
      process.exitCode = 1;
    });
}
