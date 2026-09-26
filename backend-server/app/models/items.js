const { get, all } = require("./db");
const listSQL =
  "SELECT i.item_id,i.name,i.description,i.end_date,i.creator_id,u.first_name,u.last_name FROM items i JOIN users u ON u.user_id=i.creator_id";
const cancelledSQL =
  "EXISTS(SELECT 1 FROM item_cancellations cancelled WHERE cancelled.item_id=i.item_id)";
const openSQL = `i.end_date>? AND NOT ${cancelledSQL}`;
const endedSQL = `(i.end_date<=? OR ${cancelledSQL})`;
const cancellation = (itemId) =>
  get("SELECT cancelled_at FROM item_cancellations WHERE item_id=?", [itemId]);
async function list(where = "1=1", params = [], limit = 100, offset = 0) {
  return all(
    `${listSQL} WHERE ${where} ORDER BY i.item_id ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}
async function find(itemId) {
  return get(
    "SELECT i.*,u.first_name,u.last_name FROM items i JOIN users u ON u.user_id=i.creator_id WHERE i.item_id=?",
    [itemId],
  );
}
async function detail(itemId) {
  const item = await find(itemId);
  if (!item) return null;
  const bid = await get(
    "SELECT b.amount,u.user_id,u.first_name,u.last_name FROM bids b JOIN users u ON u.user_id=b.user_id WHERE b.item_id=? ORDER BY b.amount DESC LIMIT 1",
    [itemId],
  );
  return {
    ...item,
    current_bid: bid ? bid.amount : item.starting_bid,
    current_bid_holder: bid
      ? {
          user_id: bid.user_id,
          first_name: bid.first_name,
          last_name: bid.last_name,
        }
      : null,
  };
}
module.exports = {
  list,
  find,
  detail,
  cancellation,
  cancelledSQL,
  openSQL,
  endedSQL,
};
