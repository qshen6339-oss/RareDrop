const {
  Joi,
  store,
  fail,
  route,
  text,
  integer,
  validate,
  id,
  auth,
  cleanLanguage,
} = require("./helpers");
const items = require("../models/items");
const { decodePhoto, MAX_PHOTO_TEXT } = require("../models/photos");
function createListing(withPhoto = false) {
  return route(async (req, res) => {
    const user = await auth(req);
    const v = validate(
      {
        name: text(),
        description: text(),
        starting_bid: integer().required(),
        end_date: integer().greater(Date.now()).required(),
        category_ids: Joi.array().items(integer(1).required()).unique().max(20),
        ...(withPhoto
          ? { photo: Joi.string().max(MAX_PHOTO_TEXT).required() }
          : {}),
      },
      req.body,
    );
    cleanLanguage(v.name, v.description);
    const photo = withPhoto ? decodePhoto(v.photo) : null;
    const itemId = await store.write(async () => {
      for (const cid of v.category_ids || [])
        if (
          !(await store.get("SELECT 1 FROM categories WHERE category_id=?", [
            cid,
          ]))
        )
          fail(400, "Unknown category.");
      const result = await store.run(
        "INSERT INTO items(name,description,starting_bid,start_date,end_date,creator_id) VALUES (?,?,?,?,?,?)",
        [
          v.name,
          v.description,
          v.starting_bid,
          Date.now(),
          v.end_date,
          user.user_id,
        ],
      );
      for (const cid of v.category_ids || [])
        await store.run("INSERT INTO item_categories VALUES (?,?)", [
          result.id,
          cid,
        ]);
      if (photo)
        await store.run("INSERT INTO item_photos(item_id,data) VALUES (?,?)", [
          result.id,
          photo,
        ]);
      return result.id;
    });
    res.status(201).json({ item_id: itemId });
  });
}
exports.create = createListing();
exports.createWithPhoto = createListing(true);
exports.detail = route(async (req, res) => {
  const item = await items.detail(id(req.params.item_id));
  if (!item) fail(404, "Item not found.");
  res.json(item);
});
exports.status = route(async (req, res) => {
  const item = await items.find(id(req.params.item_id));
  if (!item) fail(404, "Item not found.");
  const cancelled = await items.cancellation(item.item_id);
  res.json({
    status: cancelled
      ? "CANCELLED"
      : item.end_date <= Date.now()
        ? "ENDED"
        : "OPEN",
    cancelled_at: cancelled?.cancelled_at ?? null,
  });
});
exports.cancel = route(async (req, res) => {
  const user = await auth(req);
  const itemId = id(req.params.item_id);
  const result = await store.write(async () => {
    const item = await items.find(itemId);
    if (!item) fail(404, "Item not found.");
    if (item.creator_id !== user.user_id)
      fail(403, "Only the seller can cancel this listing.");
    const existing = await items.cancellation(itemId);
    if (existing) return existing;
    const cancelled_at = Date.now();
    if (item.end_date <= cancelled_at)
      fail(409, "This auction has already ended and cannot be cancelled.");
    await store.run(
      "INSERT INTO item_cancellations(item_id,cancelled_at) VALUES (?,?)",
      [itemId, cancelled_at],
    );
    return { cancelled_at };
  });
  res.json({ status: "CANCELLED", ...result });
});
exports.bid = route(async (req, res) => {
  const user = await auth(req);
  const v = validate({ amount: integer().required() }, req.body);
  const itemId = id(req.params.item_id);
  await store.write(async () => {
    const item = await items.detail(itemId);
    if (!item) fail(404, "Item not found.");
    if (item.creator_id === user.user_id)
      fail(403, "You cannot bid on your own item.");
    if (await items.cancellation(itemId))
      fail(
        409,
        "This listing has been cancelled. Bids are no longer accepted.",
      );
    if (item.end_date <= Date.now()) fail(400, "This auction has ended.");
    if (v.amount <= item.current_bid)
      fail(400, `Your bid must be higher than ${item.current_bid}.`);
    await store.run(
      "INSERT INTO bids(item_id,user_id,amount,timestamp) VALUES (?,?,?,?)",
      [itemId, user.user_id, v.amount, Date.now()],
    );
  });
  res.sendStatus(201);
});
exports.bids = route(async (req, res) => {
  const itemId = id(req.params.item_id);
  if (!(await items.find(itemId))) fail(404, "Item not found.");
  res.json(
    await store.all(
      "SELECT b.item_id,b.amount,b.timestamp,b.user_id,u.first_name,u.last_name FROM bids b JOIN users u ON u.user_id=b.user_id WHERE b.item_id=? ORDER BY b.amount DESC",
      [itemId],
    ),
  );
});
exports.search = route(async (req, res) => {
  const v = validate(
    {
      q: Joi.string().allow(""),
      status: Joi.string().valid("BID", "OPEN", "ARCHIVE"),
      limit: integer(1).max(100).default(20),
      offset: integer().default(0),
      category_id: integer(1),
    },
    req.query,
  );
  const conditions = [],
    params = [];
  if (v.status) {
    let user;
    try {
      user = await auth(req);
    } catch {
      fail(400, "Sign in to search your auctions.");
    }
    if (v.status === "BID") {
      conditions.push(
        "EXISTS(SELECT 1 FROM bids b WHERE b.item_id=i.item_id AND b.user_id=?)",
      );
      params.push(user.user_id);
    } else {
      conditions.push(
        `i.creator_id=? AND ${v.status === "OPEN" ? items.openSQL : items.endedSQL}`,
      );
      params.push(user.user_id, Date.now());
    }
  }
  if (!v.status) conditions.push(`NOT ${items.cancelledSQL}`);
  if (v.q) {
    conditions.push("i.name LIKE ? ESCAPE '\\'");
    params.push("%" + v.q.replace(/[\\%_]/g, "\\$&") + "%");
  }
  if (v.category_id) {
    conditions.push(
      "EXISTS(SELECT 1 FROM item_categories ic WHERE ic.item_id=i.item_id AND ic.category_id=?)",
    );
    params.push(v.category_id);
  }
  res.json(
    await items.list(
      conditions.join(" AND ") || "1=1",
      params,
      v.limit,
      v.offset,
    ),
  );
});
exports.categories = route(async (req, res) =>
  res.json(
    await store.all(
      "SELECT category_id,name FROM categories ORDER BY category_id",
    ),
  ),
);
exports.itemCategories = route(async (req, res) => {
  const itemId = id(req.params.item_id);
  if (!(await items.find(itemId))) fail(404, "Item not found.");
  res.json(
    await store.all(
      "SELECT c.category_id,c.name FROM categories c JOIN item_categories ic ON c.category_id=ic.category_id WHERE ic.item_id=? ORDER BY c.category_id",
      [itemId],
    ),
  );
});
exports.setCategories = route(async (req, res) => {
  const user = await auth(req);
  const itemId = id(req.params.item_id);
  const { category_ids } = validate(
    {
      category_ids: Joi.array()
        .items(integer(1).required())
        .unique()
        .max(20)
        .required(),
    },
    req.body,
  );
  await store.write(async () => {
    const item = await items.find(itemId);
    if (!item) fail(404, "Item not found.");
    if (item.creator_id !== user.user_id)
      fail(403, "Only the seller can change categories.");
    for (const cid of category_ids)
      if (
        !(await store.get("SELECT 1 FROM categories WHERE category_id=?", [
          cid,
        ]))
      )
        fail(400, "Unknown category.");
    await store.run("DELETE FROM item_categories WHERE item_id=?", [itemId]);
    for (const cid of category_ids)
      await store.run("INSERT INTO item_categories VALUES (?,?)", [
        itemId,
        cid,
      ]);
  });
  res.sendStatus(200);
});
// Optional demo artwork is separate from the coursework's strict item responses.
exports.media = route(async (req, res) => {
  const itemId = id(req.params.item_id);
  if (!(await items.find(itemId))) fail(404, "Item not found.");
  if (
    await store.get("SELECT item_id FROM item_photos WHERE item_id=?", [itemId])
  )
    return res.json({ image_key: null, photo_url: `/item/${itemId}/photo` });
  res.json(
    (await store.get("SELECT image_key FROM item_media WHERE item_id=?", [
      itemId,
    ])) || { image_key: null },
  );
});
exports.photo = route(async (req, res) => {
  const photo = await store.get(
    "SELECT p.data FROM item_photos p JOIN items i ON i.item_id=p.item_id WHERE p.item_id=?",
    [id(req.params.item_id)],
  );
  if (!photo) fail(404, "Photo not found.");
  res
    .set({
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=3600",
    })
    .send(photo.data);
});
