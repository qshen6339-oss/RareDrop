const Joi = require("joi");
const store = require("../models/db");
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const route = (fn) => async (req, res) => {
  try {
    await store.ready;
    await fn(req, res);
  } catch (err) {
    if (!err.status) console.error(err);
    res
      .status(err.status || 500)
      .json({
        error_message: err.status
          ? err.message
          : "Something went wrong. Please try again.",
      });
  }
};
const text = () => Joi.string().trim().min(1).required();
const integer = (min = 0) =>
  Joi.number().integer().min(min).max(Number.MAX_SAFE_INTEGER);
function validate(schema, input) {
  const result = Joi.object(schema)
    .unknown(false)
    .validate(input || {}, { abortEarly: true });
  if (result.error) fail(400, result.error.details[0].message);
  return result.value;
}
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    fail(404, "Not found");
  return Number(value);
}
async function auth(req) {
  const token = req.get("X-Authorization");
  const user =
    typeof token === "string" && token
      ? await store.get(
          "SELECT user_id,first_name,last_name FROM users WHERE session_token=?",
          [token],
        )
      : null;
  if (!user) fail(401, "Please sign in to continue.");
  return user;
}
function cleanLanguage(...values) {
  // Whole-word matching avoids blocking innocent substrings such as "Scunthorpe".
  const pattern =
    /\b(?:fuck(?:ing|ed|er|s)?|shit(?:ty|ting|head|s)?|asshole(?:s)?|bitch(?:es|ing)?|cunt(?:s)?)\b/iu;
  if (values.some((value) => pattern.test(value.normalize("NFKC"))))
    fail(400, "Please remove offensive language before publishing.");
}
module.exports = {
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
};
