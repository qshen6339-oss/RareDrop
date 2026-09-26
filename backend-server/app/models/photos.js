const MAX_PHOTO_BYTES = 1024 * 1024;
const MAX_PHOTO_TEXT = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 23;

function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

// The browser decodes the original and re-encodes a bounded, metadata-free JPEG.
// Check the encoding, file markers and frame dimensions again on the server.
function decodePhoto(value) {
  if (typeof value !== "string") invalid("Choose a valid photo.");
  if (value.length > MAX_PHOTO_TEXT)
    invalid("The prepared photo must be 1 MB or smaller.", 413);
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) invalid("The photo must be a prepared JPEG image.");
  const data = Buffer.from(match[1], "base64");
  if (data.length > MAX_PHOTO_BYTES)
    invalid("The prepared photo must be 1 MB or smaller.", 413);
  if (
    data.length < 20 ||
    data.toString("base64") !== match[1] ||
    data.readUInt16BE(0) !== 0xffd8 ||
    data.readUInt16BE(data.length - 2) !== 0xffd9
  )
    invalid("This photo is damaged. Please choose it again.");
  let offset = 2;
  let dimensions = false;
  while (offset < data.length - 2) {
    if (data[offset++] !== 0xff) break;
    while (offset < data.length && data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (offset + 2 > data.length) break;
    const size = data.readUInt16BE(offset);
    if (size < 2 || offset + size > data.length - 2) break;
    if (marker === 0xc0 || marker === 0xc2) {
      if (size < 8) break;
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      if (!width || !height || width > 1600 || height > 1600)
        invalid("The prepared photo must be at most 1600 pixels per side.");
      dimensions = true;
    }
    if (marker === 0xda) {
      if (dimensions && offset + size < data.length - 2) return data;
      break;
    }
    offset += size;
  }
  invalid("This photo is damaged. Please choose it again.");
}

module.exports = { decodePhoto, MAX_PHOTO_TEXT };
