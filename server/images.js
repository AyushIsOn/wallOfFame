// Server-side image processing: produce a capped full image + a square
// thumbnail, both webp. EXIF orientation is respected.

import sharp from "sharp";

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
