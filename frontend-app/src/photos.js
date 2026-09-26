const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_BYTES = 1024 * 1024;
export const isPreparedPhoto = (value) =>
  typeof value === "string" &&
  value.length <= Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 23 &&
  /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);

function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("This photo could not be read. Choose it again."));
    reader.readAsDataURL(blob);
  });
}

export async function preparePhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPG, PNG or WebP photo. For HEIC photos, export a JPEG first.",
    );
  if (!file.size || file.size > MAX_FILE_BYTES)
    throw new Error("Choose a photo up to 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("This photo cannot be opened. Try another image.");
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    )
      throw new Error("Choose a photo with fewer than 40 million pixels.");
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this photo.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= MAX_PHOTO_BYTES) return await asDataUrl(blob);
    }
    throw new Error(
      "This photo is too detailed to upload. Try a smaller image.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
