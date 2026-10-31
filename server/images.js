// Server-side image processing: produce a capped full image + a square
// thumbnail, both webp. EXIF orientation is respected.

import sharp from "sharp";

const MAX_REMOTE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

// Fetch a remote image (e.g. from a Photo URL column) into a buffer. Bounded
// by a timeout and a size cap so one bad URL can't stall a whole import.
export async function fetchRemoteImage(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("not an http(s) URL");
  let res;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(e.name === "TimeoutError" ? "timed out" : `fetch failed (${e.message})`);
  }
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_REMOTE_BYTES) throw new Error("image too large");
  const type = res.headers.get("content-type") || "";
  if (/^text\/html/i.test(type)) {
    throw new Error("link returned a web page, not an image (is the file shared publicly?)");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_REMOTE_BYTES) throw new Error("image too large");
  return buf;
}

export async function processImage(buffer) {
  const full = await sharp(buffer)
    .rotate()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const thumb = await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 78 })
    .toBuffer();

  return {
    full: { data: full, type: "image/webp" },
    thumb: { data: thumb, type: "image/webp" },
  };
}
