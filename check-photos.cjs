// Exercises real Express routes with an isolated database and an ephemeral port.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const root = __dirname;
const backend = path.join(root, "backend-server");
const originalCwd = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "raredrop-photos-"));
process.chdir(scratch);
const express = require(path.join(backend, "node_modules/express"));
const bodyParser = require(path.join(backend, "node_modules/body-parser"));
const store = require(path.join(backend, "app/models/db"));
const checks = [];
const image = fs.readFileSync(
  path.join(root, "verification/fixtures/cover-test.jpg"),
);
const photo = "data:image/jpeg;base64," + image.toString("base64");
const payload = {
  name: "Photo test collectible",
  description: "A fictional item in an isolated test database.",
  starting_bid: 80,
  end_date: Date.now() + 86400000,
  category_ids: [5, 14],
  photo,
};
let server, base, token, itemId;
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
  } catch (e) {
    checks.push({ name, passed: false, error: e.message });
    process.exitCode = 1;
  }
}
async function api(
  method,
  url,
  body,
  authenticated = true,
  mediaType = "application/vnd.raredrop.item+json",
) {
  const response = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": mediaType } : {}),
      ...(authenticated && token ? { "X-Authorization": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const content = response.headers.get("content-type") || "";
  return {
    status: response.status,
    headers: response.headers,
    body: content.includes("json")
      ? await response.json()
      : content.includes("image/jpeg")
        ? Buffer.from(await response.arrayBuffer())
        : await response.text(),
  };
}
async function main() {
  await store.ready;
  const app = express();
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  for (const name of ["user", "core", "question"])
    require(path.join(backend, `app/routes/${name}.server.routes`))(app);
  app.use((req, res) => res.sendStatus(404));
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  const user = {
    first_name: "Photo",
    last_name: "Tester",
    email: "photo@test.example",
    password: "RareDrop2026!",
  };
  assert.equal(
    (await api("POST", "/users", user, false, "application/json")).status,
    201,
  );
  token = (
    await api(
      "POST",
      "/login",
      { email: user.email, password: user.password },
      false,
      "application/json",
    )
  ).body.session_token;
  assert.ok(token);
  await check("Photo publishing requires authentication", async () => {
    assert.equal(
      (await api("POST", "/item-with-photo", payload, false)).status,
      401,
    );
    assert.equal((await store.get("SELECT COUNT(*) n FROM items")).n, 0);
  });
  await check(
    "Invalid formats and damaged files create no listing",
    async () => {
      for (const bad of [
        "data:image/svg+xml;base64,PHN2Zy8+",
        "data:image/jpeg;base64,YmFk",
        photo.slice(0, -8),
        photo.replace("base64,", "base64,!"),
      ])
        assert.equal(
          (await api("POST", "/item-with-photo", { ...payload, photo: bad }))
            .status,
          400,
        );
      assert.equal((await store.get("SELECT COUNT(*) n FROM items")).n, 0);
      assert.equal(
        (await store.get("SELECT COUNT(*) n FROM item_photos")).n,
        0,
      );
    },
  );
  await check(
    "Oversized requests and oversized image dimensions are rejected",
    async () => {
      assert.equal(
        (
          await api("POST", "/item-with-photo", {
            ...payload,
            photo: "x".repeat(2200000),
          })
        ).status,
        413,
      );
      const huge = Buffer.from(image);
      const frame = huge.indexOf(Buffer.from([0xff, 0xc0]));
      assert.ok(frame >= 0);
      huge.writeUInt16BE(9000, frame + 7);
      assert.equal(
        (
          await api("POST", "/item-with-photo", {
            ...payload,
            photo: "data:image/jpeg;base64," + huge.toString("base64"),
          })
        ).status,
        400,
      );
    },
  );
  await check(
    "Photo, item and multiple categories publish together",
    async () => {
      const response = await api("POST", "/item-with-photo", payload);
      assert.equal(response.status, 201, JSON.stringify(response.body));
      itemId = response.body.item_id;
      assert.deepEqual(
        (await api("GET", `/item/${itemId}/categories`)).body.map(
          (c) => c.category_id,
        ),
        [5, 14],
      );
      assert.equal(
        (await store.get("SELECT COUNT(*) n FROM item_photos")).n,
        1,
      );
    },
  );
  await check(
    "Public media points to exact stored JPEG bytes with safe response headers",
    async () => {
      const media = await api("GET", `/item/${itemId}/media`, undefined, false);
      assert.deepEqual(media.body, {
        image_key: null,
        photo_url: `/item/${itemId}/photo`,
      });
      const response = await api("GET", media.body.photo_url, undefined, false);
      assert.equal(response.status, 200);
      assert.ok(response.body.equals(image));
      assert.equal(response.headers.get("content-type"), "image/jpeg");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal((await api("GET", "/item/99999/photo")).status, 404);
    },
  );
  await check(
    "Filtering finds the photographed listing while base item fields stay unchanged",
    async () => {
      assert.equal(
        (await api("GET", "/search?category_id=14")).body[0].item_id,
        itemId,
      );
      const detail = (await api("GET", `/item/${itemId}`)).body;
      assert.equal(detail.current_bid, 80);
      assert.equal("photo" in detail, false);
      assert.equal("photo_url" in detail, false);
    },
  );
  await check(
    "Invalid categories and storage failures roll back the whole publication",
    async () => {
      const count = (await store.get("SELECT COUNT(*) n FROM items")).n;
      assert.equal(
        (
          await api("POST", "/item-with-photo", {
            ...payload,
            category_ids: [99999],
          })
        ).status,
        400,
      );
      await store.run(
        "CREATE TRIGGER fail_photo BEFORE INSERT ON item_photos BEGIN SELECT RAISE(ABORT, 'intentional photo storage failure'); END",
      );
      try {
        assert.equal(
          (await api("POST", "/item-with-photo", payload)).status,
          500,
        );
      } finally {
        await store.run("DROP TRIGGER fail_photo");
      }
      assert.equal((await store.get("SELECT COUNT(*) n FROM items")).n, count);
      assert.equal(
        (await store.get("SELECT COUNT(*) n FROM item_photos")).n,
        1,
      );
      assert.equal(
        (await store.get("SELECT COUNT(*) n FROM item_categories")).n,
        2,
      );
    },
  );
  await check(
    "Text-only creation and original demo artwork continue to work",
    async () => {
      assert.equal(
        (await api("POST", "/item", payload, true, "application/json")).status,
        400,
      );
      const { photo: ignored, ...textOnly } = payload;
      const response = await api(
        "POST",
        "/item",
        textOnly,
        true,
        "application/json",
      );
      assert.equal(response.status, 201);
      const id = response.body.item_id;
      assert.deepEqual((await api("GET", `/item/${id}/media`)).body, {
        image_key: null,
      });
      assert.equal((await api("GET", `/item/${id}/photo`)).status, 404);
      await store.run("INSERT INTO item_media VALUES (?,?)", [id, "dragon"]);
      assert.deepEqual((await api("GET", `/item/${id}/media`)).body, {
        image_key: "dragon",
      });
    },
  );
  await check(
    "Teaching-style deletion cleans up stored photos even with foreign keys disabled",
    async () => {
      await store.run("PRAGMA foreign_keys=OFF");
      await store.run("DELETE FROM items WHERE item_id=?", [itemId]);
      assert.equal(
        (await store.get("SELECT COUNT(*) n FROM item_photos")).n,
        0,
      );
      assert.equal((await api("GET", `/item/${itemId}/photo`)).status, 404);
    },
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => store.db.close(resolve));
    process.chdir(originalCwd);
    const report = {
      date: new Date().toISOString(),
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
      checks,
    };
    fs.writeFileSync(
      path.join(root, "verification/photo-tests.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    const resolved = fs.realpathSync(scratch);
    if (
      path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
      !path.basename(resolved).startsWith("raredrop-photos-")
    )
      throw new Error("Unexpected test directory; cleanup cancelled.");
    fs.rmSync(resolved, { recursive: true, force: true });
  });
