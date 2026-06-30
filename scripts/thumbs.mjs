// Thumbnail generation for the wall.
//
// The wall only ever shows small tiles, so it loads lightweight square
// thumbnails (public/thumbs/<name>.webp) while the profile uses the full-res
// original (public/<name>.jpeg). This script regenerates thumbnails for every
// img*.jpeg in /public.
//
// Run:  npm run thumbs
//
// In production this same step is what the Excel -> n8n image pipeline should
// perform when a teacher uploads photos (resize -> square webp thumbnail).

import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const OUT = path.join(PUBLIC, "thumbs");
const SIZE = 512; // square; matches the largest wall card texture
const QUALITY = 78;

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(PUBLIC)).filter((f) => /^img\d+\.jpe?g$/i.test(f));

  if (!files.length) {
    console.log("No img*.jpeg files found in /public.");
    return;
  }

  let totalIn = 0;
  let totalOut = 0;
  for (const file of files) {
    const name = file.replace(/\.[^.]+$/, "");
    const dest = path.join(OUT, `${name}.webp`);
    const info = await sharp(path.join(PUBLIC, file))
      .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: QUALITY })
      .toFile(dest);
    const src = (await sharp(path.join(PUBLIC, file)).metadata()).size || 0;
    totalIn += src;
    totalOut += info.size;
    console.log(`  ${file}  ->  thumbs/${name}.webp  (${(info.size / 1024).toFixed(1)} KB)`);
  }

  console.log(
    `\nGenerated ${files.length} thumbnails at ${SIZE}px. ` +
      `Total ${(totalIn / 1024).toFixed(0)} KB -> ${(totalOut / 1024).toFixed(0)} KB.`
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
