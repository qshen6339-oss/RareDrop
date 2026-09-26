const c = require("../controllers/user.server.controllers");
module.exports = (app) => {
  app.post("/users", c.create);
  app.post("/login", c.login);
  app.post("/logout", c.logout);
  app.get("/users/:user_id", c.profile);
  app.patch("/users/:user_id", c.updateName);
};
