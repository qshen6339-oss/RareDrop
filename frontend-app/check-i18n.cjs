const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { effect, stop } = require("vue");
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { transform } = viteRequire("esbuild");

(async () => {
  const source = fs
    .readFileSync(path.join(__dirname, "src/i18n.js"), "utf8")
    .replace(
      'import zh from "./locales/zh-CN.json";',
      `const zh = ${fs.readFileSync(path.join(__dirname, "src/locales/zh-CN.json"), "utf8")};`,
    );
  const built = await transform(source, { format: "cjs", target: "node22" });
  function boot({ language = "en-GB", saved, blocked = false } = {}) {
    const data = new Map(saved ? [["raredrop-language", saved]] : []);
    const document = { documentElement: { lang: "" }, title: "" };
    const module = { exports: {} };
    vm.runInNewContext(built.code, {
      module,
      exports: module.exports,
      require,
      navigator: { language },
      document,
      localStorage: {
        getItem: (key) => {
          if (blocked) throw Error("Storage blocked");
          return data.get(key);
        },
        setItem: (key, value) => {
          if (blocked) throw Error("Storage blocked");
          data.set(key, value);
        },
      },
    });
    return { ...module.exports, data, document };
  }
  const checks = [];
  function check(name, fn) {
    try {
      fn();
      checks.push({ name, passed: true });
    } catch (error) {
      checks.push({ name, passed: false, error: error.message });
    }
  }
  check(
    "First visit follows Chinese browser preference and sets accessible document language",
    () => {
      const app = boot({ language: "zh-HK" });
      assert.equal(app.locale.value, "zh");
      app.updateDocumentLanguage();
      assert.equal(app.document.documentElement.lang, "zh-CN");
      assert.equal(app.t("Edit name"), "修改名称");
    },
  );
  check(
    "An explicit language survives a new session and overrides browser preference",
    () => {
      const app = boot({ language: "zh-CN" });
      app.setLocale("en");
      const reloaded = boot({
        language: "zh-CN",
        saved: app.data.get("raredrop-language"),
      });
      assert.equal(reloaded.t("Edit name"), "Edit name");
      assert.equal(app.document.documentElement.lang, "en");
    },
  );
  check(
    "Blocked storage and invalid preferences do not break language switching",
    () => {
      const app = boot({ language: "en-US", saved: "invalid", blocked: true });
      app.setLocale("zh");
      assert.equal(app.t("Save name"), "保存名称");
      app.setLocale("invalid");
      assert.equal(app.locale.value, "zh");
    },
  );
  check(
    "Visible labels and existing error messages update reactively in both directions",
    () => {
      const app = boot();
      let visible;
      const runner = effect(() => {
        visible = [
          app.t("Cancel listing"),
          app.messageText("Email or password is incorrect."),
        ];
      });
      app.setLocale("zh");
      assert.deepEqual(visible, ["取消售卖", "邮箱或密码不正确。"]);
      app.setLocale("en");
      assert.deepEqual(visible, [
        "Cancel listing",
        "Email or password is incorrect.",
      ]);
      stop(runner);
    },
  );
  check(
    "All fourteen categories translate while unknown category values remain intact",
    () => {
      const categories = [
        "Trading cards",
        "Designer figures",
        "Mecha",
        "Limited editions",
        "Blind boxes",
        "Plush toys",
        "Model cars",
        "Model kits",
        "Building blocks",
        "Comics & manga",
        "Art books",
        "Badges & pins",
        "Keychains & charms",
        "Acrylic stands",
      ];
      const app = boot({ saved: "zh" });
      for (const name of categories)
        assert.notEqual(app.categoryName(name), name);
      assert.equal(app.categoryName("Custom collection"), "Custom collection");
      app.setLocale("en");
      for (const name of categories) assert.equal(app.categoryName(name), name);
    },
  );
  check(
    "Parameterized copy preserves names and amounts, and date formatting follows the locale",
    () => {
      const app = boot({ saved: "zh" });
      const name = "Save name <b>星河</b> {count}";
      assert.equal(
        app.t("Winning collector: {name}", { name }),
        `中拍者：${name}`,
      );
      assert.equal(
        app.t("{count} bids · Started at {price}", { count: 2, price: "¥80" }),
        "2 次出价 · 起拍价 ¥80",
      );
      assert.equal(
        app.t("{days}d {hours}h left", { days: 2, hours: 3 }),
        "剩余 2 天 3 小时",
      );
      assert.equal(app.intlLocale(), "zh-CN");
      app.setLocale("en");
      assert.equal(app.intlLocale(), "en-GB");
      assert.equal(
        app.t("Winning collector: {name}", { name }),
        `Winning collector: ${name}`,
      );
    },
  );
  check(
    "Server validation, ownership, bidding and photo errors have useful Chinese messages",
    () => {
      const app = boot({ saved: "zh" });
      assert.equal(
        app.messageText('"First name" is not allowed to be empty'),
        "请填写名。",
      );
      assert.equal(
        app.messageText(
          '"last_name" length must be less than or equal to 50 characters long',
        ),
        "姓最多为 50 个字符。",
      );
      assert.equal(
        app.messageText("Your bid must be higher than 95."),
        "你的出价必须高于 ¥95。",
      );
      assert.equal(
        app.messageText("Only the seller can cancel this listing."),
        "只有卖家可以取消售卖。",
      );
      assert.equal(
        app.messageText("Choose a photo up to 10 MB."),
        "请选择不超过 10 MB 的照片。",
      );
    },
  );
  const report = {
    date: new Date().toISOString(),
    passed: checks.filter((x) => x.passed).length,
    total: checks.length,
    checks,
  };
  fs.writeFileSync(
    path.join(__dirname, "../verification/i18n-tests.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
