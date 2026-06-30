// Server-side image processing: produce a capped full image + a square
// thumbnail, both webp. EXIF orientation is respected.

import sharp from "sharp";

// Fetch a remote image (e.g. from a Photo URL column) into a buffer.
export async function fetchRemoteImage(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("not an http(s) URL");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) throw new Error("image too large");
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
