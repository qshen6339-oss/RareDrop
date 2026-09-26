const {
  store,
  fail,
  route,
  text,
  validate,
  id,
  auth,
  cleanLanguage,
} = require("./helpers");
const items = require("../models/items");
exports.list = route(async (req, res) => {
  const itemId = id(req.params.item_id);
  if (!(await items.find(itemId))) fail(404, "Item not found.");
  res.json(
    await store.all(
      "SELECT question_id,question AS question_text,answer AS answer_text FROM questions WHERE item_id=? ORDER BY question_id DESC",
      [itemId],
    ),
  );
});
exports.ask = route(async (req, res) => {
  const user = await auth(req);
  const { question_text } = validate({ question_text: text() }, req.body);
  cleanLanguage(question_text);
  const itemId = id(req.params.item_id);
  await store.write(async () => {
    const item = await items.find(itemId);
    if (!item) fail(404, "Item not found.");
    if (item.creator_id === user.user_id)
      fail(403, "Sellers cannot ask questions on their own items.");
    if (await items.cancellation(itemId))
      fail(409, "This listing has been cancelled. New questions are closed.");
    await store.run(
      "INSERT INTO questions(question,asked_by,item_id) VALUES (?,?,?)",
      [question_text, user.user_id, item.item_id],
    );
  });
  res.sendStatus(200);
});
exports.answer = route(async (req, res) => {
  const user = await auth(req);
  const { answer_text } = validate({ answer_text: text() }, req.body);
  const questionId = id(req.params.question_id);
  const question = await store.get(
    "SELECT q.question_id,i.creator_id FROM questions q JOIN items i ON i.item_id=q.item_id WHERE question_id=?",
    [questionId],
  );
  if (!question) fail(404, "Question not found.");
  if (question.creator_id !== user.user_id)
    fail(403, "Only the seller can answer this question.");
  await store.write(() =>
    store.run("UPDATE questions SET answer=? WHERE question_id=?", [
      answer_text,
      questionId,
    ]),
  );
  res.sendStatus(200);
});
