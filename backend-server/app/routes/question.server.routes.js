const c = require("../controllers/question.server.controllers");
module.exports = (app) => {
  app.get("/item/:item_id/question", c.list);
  app.post("/item/:item_id/question", c.ask);
  app.post("/question/:question_id", c.answer);
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large")
      return res
        .status(413)
        .json({
          error_message:
            "This upload is too large. Choose a smaller photo and try again.",
        });
    if (err.type === "entity.parse.failed")
      return res
        .status(400)
        .json({ error_message: "Request body must be valid JSON." });
    next(err);
  });
};
