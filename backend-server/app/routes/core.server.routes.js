const c = require("../controllers/core.server.controllers");
const express = require("express");
module.exports = (app) => {
  app.get("/search", c.search);
  app.get(
    "/discover",
    require("../controllers/discover.server.controllers").discover,
  );
  app.post("/item", c.create);
  // A separate media type leaves the supplied server's JSON limit and base API unchanged.
  app.post(
    "/item-with-photo",
    express.json({ type: "application/vnd.raredrop.item+json", limit: "2mb" }),
    c.createWithPhoto,
  );
  app.get("/item/:item_id", c.detail);
  app.get("/item/:item_id/status", c.status);
  app.post("/item/:item_id/cancel", c.cancel);
  app.post("/item/:item_id/bid", c.bid);
  app.get("/item/:item_id/bid", c.bids);
  app.get("/categories", c.categories);
  app.get("/item/:item_id/categories", c.itemCategories);
  app.put("/item/:item_id/categories", c.setCategories);
  app.get("/item/:item_id/media", c.media);
  app.get("/item/:item_id/photo", c.photo);
};
