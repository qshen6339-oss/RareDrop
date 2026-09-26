const { Joi, store, route, validate, integer } = require("./helpers");
const groups = [
  {
    id: "cards-books",
    name: "Cards & books",
    description: "Cards, comics & art books",
    category_ids: [1, 10, 11],
    image_key: "dragon",
  },
  {
    id: "figures-toys",
    name: "Figures & toys",
    description: "Figures, blind boxes & plush",
    category_ids: [2, 5, 6],
    image_key: "rabbit",
  },
  {
    id: "models-building",
    name: "Models & building",
    description: "Mecha, cars, kits & blocks",
    category_ids: [3, 7, 8, 9],
    image_key: "mecha",
  },
  {
    id: "extras-editions",
    name: "Extras & editions",
    description: "Limited editions, accessories & more",
    category_ids: [4, 12, 13, 14],
    image_key: "limited",
  },
];
const knownCategories = new Set(groups.flatMap((group) => group.category_ids));
function belongs(item, group) {
  return (
    item.categories.some((c) => group.category_ids.includes(c.category_id)) ||
    (group.id === "extras-editions" &&
      !item.categories.some((c) => knownCategories.has(c.category_id)))
  );
}
// Supply card details, counts and carousel media together instead of N+1 HTTP requests.
exports.discover = route(async (req, res) => {
  const value = validate(
    {
      q: Joi.string().trim().allow(""),
      group: Joi.string().valid(...groups.map((g) => g.id)),
      category_id: integer(1),
      limit: integer(1).max(100).default(12),
      offset: integer().default(0),
    },
    req.query,
  );
  const [rows, categories, associations] = await Promise.all([
    store.all(
      `SELECT i.*,u.first_name,u.last_name,m.image_key,
      COALESCE((SELECT MAX(b.amount) FROM bids b WHERE b.item_id=i.item_id),i.starting_bid) AS current_bid,
      EXISTS(SELECT 1 FROM item_photos p WHERE p.item_id=i.item_id) AS has_photo
      FROM items i JOIN users u ON u.user_id=i.creator_id LEFT JOIN item_media m ON m.item_id=i.item_id
      WHERE i.end_date > ? AND NOT EXISTS(SELECT 1 FROM item_cancellations c WHERE c.item_id=i.item_id) ORDER BY i.item_id DESC`,
      [Date.now()],
    ),
    store.all("SELECT category_id,name FROM categories ORDER BY category_id"),
    store.all("SELECT item_id,category_id FROM item_categories"),
  ]);
  const byId = new Map(categories.map((c) => [c.category_id, c])),
    byItem = new Map();
  for (const link of associations) {
    if (!byId.has(link.category_id)) continue;
    if (!byItem.has(link.item_id)) byItem.set(link.item_id, []);
    byItem.get(link.item_id).push(byId.get(link.category_id));
  }
  const now = Date.now();
  const all = rows
    .filter((item) => item.end_date > now)
    .map(({ has_photo, ...item }) => ({
      ...item,
      photo_url: has_photo ? `/item/${item.item_id}/photo` : null,
      categories: (byItem.get(item.item_id) || []).sort(
        (a, b) => a.category_id - b.category_id,
      ),
      status: "OPEN",
    }));
  const groupData = groups.map((g) => ({
    ...g,
    count: all.filter((item) => belongs(item, g)).length,
  }));
  const collections = categories.map((c) => ({
    ...c,
    count: all.filter((item) =>
      item.categories.some((x) => x.category_id === c.category_id),
    ).length,
  }));
  const selectedGroup = groups.find((g) => g.id === value.group);
  const filtered = all.filter(
    (item) =>
      (!value.q || item.name.toLowerCase().includes(value.q.toLowerCase())) &&
      (!value.category_id ||
        item.categories.some((c) => c.category_id === value.category_id)) &&
      (!selectedGroup || belongs(item, selectedGroup)),
  );
  const candidates = all.filter(
    (item) => item.status === "OPEN" && (item.photo_url || item.image_key),
  );
  const featured = [];
  for (const g of groups) {
    const item = candidates.find(
      (candidate) => belongs(candidate, g) && !featured.includes(candidate),
    );
    if (item) featured.push(item);
  }
  for (const item of candidates)
    if (featured.length < 6 && !featured.includes(item)) featured.push(item);
  res.set("Cache-Control", "no-store");
  res.json({
    server_time: now,
    next_expiry: all.length
      ? all.reduce(
          (earliest, item) => Math.min(earliest, item.end_date),
          all[0].end_date,
        )
      : null,
    items: filtered.slice(value.offset, value.offset + value.limit),
    total: filtered.length,
    total_items: all.length,
    collections,
    groups: groupData,
    featured,
  });
});
