import assert from "node:assert/strict";
import { readDrafts, saveDraft, deleteDraft } from "./src/drafts.js";
const memory = new Map();
let failWrites = false;
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      if (failWrites) throw new Error("Quota exceeded");
      memory.set(k, v);
    },
  },
});
const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, passed: true });
  } catch (e) {
    checks.push({ name, passed: false, error: e.message });
    process.exitCode = 1;
  }
}
let draftId;
check(
  "Incomplete drafts can be saved, then read after leaving the form",
  () => {
    draftId = saveDraft(1, {
      name: "Astral Dragon",
      description: "",
      starting_bid: "",
      end_date: "",
      category_ids: [1, 4],
    });
    assert.equal(readDrafts(1).length, 1);
    assert.equal(readDrafts(1)[0].form.name, "Astral Dragon");
  },
);
check("Drafts are separated by collector account", () => {
  assert.equal(readDrafts(2).length, 0);
  saveDraft(2, { name: "Lunar Courier" });
  assert.equal(readDrafts(1)[0].form.name, "Astral Dragon");
});
check("Editing keeps the same draft rather than adding a duplicate", () => {
  assert.equal(
    saveDraft(1, { name: "Astral Dragon updated", starting_bid: 100 }, draftId),
    draftId,
  );
  assert.equal(readDrafts(1).length, 1);
  assert.equal(readDrafts(1)[0].form.starting_bid, 100);
});
check("Draft snapshots do not change when the form changes later", () => {
  const form = { name: "Aster", category_ids: [3] };
  saveDraft(3, form);
  form.name = "Changed";
  form.category_ids.push(4);
  assert.equal(readDrafts(3)[0].form.name, "Aster");
  assert.deepEqual(readDrafts(3)[0].form.category_ids, [3]);
});
check("A storage failure is reported and preserves the previous draft", () => {
  failWrites = true;
  assert.throws(
    () => saveDraft(1, { name: "Lost edit" }, draftId),
    /could not save/,
  );
  failWrites = false;
  assert.equal(readDrafts(1)[0].form.name, "Astral Dragon updated");
});
check(
  "Corrupted storage is reported without overwriting the stored data",
  () => {
    memory.set("raredrop-drafts-v1-9", "{broken");
    assert.throws(() => readDrafts(9), /could not be read/);
    assert.equal(memory.get("raredrop-drafts-v1-9"), "{broken");
  },
);
check("Deleting removes only the chosen draft from the current account", () => {
  deleteDraft(1, draftId);
  assert.equal(readDrafts(1).length, 0);
  assert.equal(readDrafts(2).length, 1);
});
check("Cover photos survive draft restore, replacement and removal", () => {
  const first = "data:image/jpeg;base64,/9j/2Q==";
  const second = "data:image/jpeg;base64,/9j/AAD/2Q==";
  const form = { name: "Photo draft", photo: first, photo_name: "cover.jpg" };
  const id = saveDraft(11, form);
  assert.equal(readDrafts(11)[0].form.photo, first);
  assert.equal(readDrafts(12).length, 0);
  form.photo = second;
  assert.equal(readDrafts(11)[0].form.photo, first);
  saveDraft(11, form, id);
  assert.equal(readDrafts(11)[0].form.photo, second);
  form.photo = "";
  form.photo_name = "";
  saveDraft(11, form, id);
  assert.equal(readDrafts(11).length, 1);
  assert.equal(readDrafts(11)[0].form.photo, "");
});
check("Drafts can be saved on HTTP LAN previews without randomUUID", () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    const a = saveDraft(21, { name: "Mobile draft" });
    const b = saveDraft(21, { name: "Another mobile draft" });
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.notEqual(a, b);
    assert.equal(readDrafts(21).length, 2);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: original,
    });
  }
});
console.log(
  JSON.stringify(
    {
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
      checks,
    },
    null,
    2,
  ),
);
