const { ready, write, run, get, db } = require("../models/db");
const { scryptSync, randomBytes } = require("crypto");
async function seed() {
  await ready;
  if ((await get("SELECT COUNT(*) AS n FROM users")).n) {
    console.log("Existing accounts and auctions preserved.");
    return;
  }
  await write(async () => {
    for (const [first, last, email] of [
      ["Sky", "Chen", "sky@raredrop.example"],
      ["Alex", "Morgan", "alex@raredrop.example"],
      ["Jamie", "Park", "jamie@raredrop.example"],
    ]) {
      const salt = randomBytes(16).toString("hex");
      await run(
        "INSERT INTO users(first_name,last_name,email,password,salt) VALUES (?,?,?,?,?)",
        [
          first,
          last,
          email,
          scryptSync("RareDrop2026!", salt, 64).toString("hex"),
          salt,
        ],
      );
    }
    const now = Date.now();
    const products = [
      [
        "Astral Dragon · Holo edition",
        "Original fantasy trading card from the Astral Archive series.\n\nCondition: near mint; stored in a clear protective sleeve. Iridescent violet border and teal dragon artwork. Includes the sleeve.\n\nFictional collectible used for this coursework demo.",
        80,
        18,
        1,
        "dragon",
        [1, 4],
      ],
      [
        "Lunar Courier · Vinyl figure",
        "Original astronaut rabbit designer figure.\n\nCondition: displayed, excellent. Orange and white suit, glossy visor, freestanding design. Original box included. Approximately 16 cm tall.\n\nFictional collectible used for this coursework demo.",
        120,
        42,
        1,
        "rabbit",
        [2, 4],
      ],
      [
        "Aster MK-07 · Mecha collectible",
        "Cyan mecha miniature on a round display base.\n\nCondition: assembled and displayed; all parts included. Approximately 18 cm tall. Box included. No visible paint damage.\n\nFictional collectible used for this coursework demo.",
        180,
        9,
        3,
        "mecha",
        [2, 3],
      ],
      [
        "Astral Dragon · Collector copy",
        "A second collector’s copy of the Astral Dragon holographic card.\n\nCondition: excellent, sleeved. Light handling wear on the sleeve; card corners are intact. Includes protective sleeve.\n\nFictional collectible used for this coursework demo.",
        60,
        64,
        3,
        "dragon",
        [1],
      ],
      [
        "Lunar Courier · Display collection",
        "Astronaut rabbit figure from a personal display collection.\n\nCondition: very good. Includes original packaging. Slight box wear, figure in excellent condition.\n\nFictional collectible used for this coursework demo.",
        95,
        31,
        2,
        "rabbit",
        [2],
      ],
      [
        "Aster MK-07 · Archived find",
        "Cyan mecha collectible with display base.\n\nThis completed demo auction shows the archived-listing and winning-bid experience. All parts and original box included.\n\nFictional collectible used for this coursework demo.",
        150,
        -3,
        1,
        "mecha",
        [2, 3],
      ],
    ];
    for (const [
      name,
      description,
      price,
      hours,
      creator,
      key,
      categories,
    ] of products) {
      const r = await run(
        "INSERT INTO items(name,description,starting_bid,start_date,end_date,creator_id) VALUES (?,?,?,?,?,?)",
        [
          name,
          description,
          price,
          now - 5 * 86400000,
          now + hours * 3600000,
          creator,
        ],
      );
      await run("INSERT INTO item_media VALUES (?,?)", [r.id, key]);
      for (const cid of categories)
        await run("INSERT INTO item_categories VALUES (?,?)", [r.id, cid]);
    }
    for (const [item, user, amount, offset] of [
      [1, 2, 90, 300000],
      [1, 3, 105, 200000],
      [1, 2, 115, 100000],
      [2, 2, 135, 120000],
      [3, 2, 200, 80000],
      [6, 2, 175, 5 * 3600000],
    ])
      await run("INSERT INTO bids VALUES (?,?,?,?)", [
        item,
        user,
        amount,
        now - offset,
      ]);
    await run(
      "INSERT INTO questions(question,answer,asked_by,item_id) VALUES (?,?,?,?)",
      [
        "Does the protective sleeve come with the card?",
        "Yes, the clear sleeve shown is included.",
        2,
        1,
      ],
    );
    await run(
      "INSERT INTO questions(question,asked_by,item_id) VALUES (?,?,?)",
      ["Are there any marks on the back of the card?", 3, 1],
    );
  });
  console.log(
    "RareDrop demo data created. Buyer: alex@raredrop.example; seller: sky@raredrop.example; password: RareDrop2026!",
  );
}
seed()
  .then(() => require("./seed-collections").seedCollections())
  .then(() => require("./seed-year-collections").seedYearCollections())
  .then(() => require("./seed-new-designs").seedNewDesigns())
  .then(() => db.close())
  .catch((error) => {
    console.error(error);
    db.close();
    process.exitCode = 1;
  });
