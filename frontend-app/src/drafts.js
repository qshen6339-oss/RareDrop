const key = (userId) => `raredrop-drafts-v1-${userId}`;
function newDraftId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // LAN previews use HTTP, where randomUUID may be unavailable on a phone.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function readDrafts(userId) {
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) || "[]");
    if (!Array.isArray(value)) throw new Error();
    return value.filter(
      (d) =>
        d && typeof d.id === "string" && d.form && typeof d.form === "object",
    );
  } catch {
    throw new Error(
      "Drafts could not be read from this browser. Your stored data has been left unchanged.",
    );
  }
}
export function writeDrafts(userId, items) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(items));
  } catch {
    throw new Error(
      "Your browser could not save this draft. Free some storage or enable local storage and try again.",
    );
  }
}
export function saveDraft(userId, form, draftId) {
  const drafts = readDrafts(userId);
  const entry = {
    id: draftId || newDraftId(),
    form: JSON.parse(JSON.stringify(form)),
    updated: Date.now(),
  };
  const index = drafts.findIndex((d) => d.id === entry.id);
  if (index < 0) drafts.unshift(entry);
  else drafts[index] = entry;
  writeDrafts(userId, drafts);
  return entry.id;
}
export function deleteDraft(userId, draftId) {
  writeDrafts(
    userId,
    readDrafts(userId).filter((d) => d.id !== draftId),
  );
}
