const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const {
  Joi,
  store,
  fail,
  route,
  text,
  validate,
  id,
  auth,
} = require("./helpers");
const items = require("../models/items");
const email = () =>
  Joi.string()
    .trim()
    .email({ tlds: { allow: false } })
    .required();
exports.create = route(async (req, res) => {
  const value = validate(
    {
      first_name: text(),
      last_name: text(),
      email: email(),
      password: Joi.string()
        .min(8)
        .max(30)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).+$/)
        .required(),
    },
    req.body,
  );
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(value.password, salt, 64)).toString("hex");
  try {
    const result = await store.write(() =>
      store.run(
        "INSERT INTO users(first_name,last_name,email,password,salt) VALUES (?,?,?,?,?)",
        [value.first_name, value.last_name, value.email, hash, salt],
      ),
    );
    res.status(201).json({ user_id: result.id });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT")
      fail(400, "An account with that email already exists.");
    throw err;
  }
});
exports.login = route(async (req, res) => {
  const value = validate(
    { email: email(), password: Joi.string().max(1024).required() },
    req.body,
  );
  const user = await store.get("SELECT * FROM users WHERE email=?", [
    value.email,
  ]);
  if (!user) fail(400, "Email or password is incorrect.");
  const hash = await scrypt(value.password, user.salt, 64);
  const expected = Buffer.from(user.password, "hex");
  if (
    hash.length !== expected.length ||
    !crypto.timingSafeEqual(hash, expected)
  )
    fail(400, "Email or password is incorrect.");
  const result = await store.write(async () => {
    await store.run(
      "UPDATE users SET session_token=COALESCE(session_token,?) WHERE user_id=?",
      [crypto.randomBytes(32).toString("hex"), user.user_id],
    );
    return store.get(
      "SELECT user_id,session_token FROM users WHERE user_id=?",
      [user.user_id],
    );
  });
  res.json(result);
});
exports.logout = route(async (req, res) => {
  const user = await auth(req);
  await store.write(() =>
    store.run("UPDATE users SET session_token=NULL WHERE user_id=?", [
      user.user_id,
    ]),
  );
  res.sendStatus(200);
});
exports.updateName = route(async (req, res) => {
  const user = await auth(req);
  const userId = id(req.params.user_id);
  if (userId !== user.user_id) fail(403, "You can only change your own name.");
  const value = validate(
    {
      first_name: text().max(50).label("First name"),
      last_name: text().max(50).label("Last name"),
    },
    req.body,
  );
  const updated = await store.write(async () => {
    await store.run(
      "UPDATE users SET first_name=?,last_name=? WHERE user_id=?",
      [value.first_name, value.last_name, userId],
    );
    return store.get(
      "SELECT user_id,first_name,last_name FROM users WHERE user_id=?",
      [userId],
    );
  });
  res.json(updated);
});
exports.profile = route(async (req, res) => {
  const userId = id(req.params.user_id);
  const user = await store.get(
    "SELECT user_id,first_name,last_name FROM users WHERE user_id=?",
    [userId],
  );
  if (!user) fail(404, "User not found.");
  const now = Date.now();
  const [selling, bidding_on, auctions_ended] = await Promise.all([
    items.list(`i.creator_id=? AND ${items.openSQL}`, [userId, now], -1),
    items.list(
      "EXISTS(SELECT 1 FROM bids b WHERE b.item_id=i.item_id AND b.user_id=?)",
      [userId],
      -1,
    ),
    items.list(`i.creator_id=? AND ${items.endedSQL}`, [userId, now], -1),
  ]);
  res.json({ ...user, selling, bidding_on, auctions_ended });
});
