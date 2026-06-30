// Canvas-based texture generation for tile text + image atlas packing.
// Fonts must already be loaded (see wall.js) before these run, otherwise the
// canvas rasterises with a fallback font.

import * as THREE from "three";
import { COLORS, CANVAS_FONT } from "../config.js";

const textCanvasProps = {
  wrapS: THREE.ClampToEdgeWrapping,
  wrapT: THREE.ClampToEdgeWrapping,
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  flipY: false,
  generateMipmaps: false,
  format: THREE.RGBAFormat,
};

// Title + year strip drawn on a wide, short canvas (matches the title band's
// aspect ratio inside each tile).
export const createTitleTexture = (name, year) => {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.text;
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = false;
  ctx.font = `60px '${CANVAS_FONT}', monospace`;

  ctx.textAlign = "left";
  ctx.fillText(name.toUpperCase(), 30, 22);
  ctx.textAlign = "right";
  ctx.fillText(String(year).toUpperCase(), canvas.width - 30, 22);

  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, textCanvasProps);
  return texture;
};

// Glassmorphism tag pills.
export const createTagsTexture = (tags = []) => {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (tags.length) {
    ctx.font = `60px '${CANVAS_FONT}', monospace`;
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = false;

    let xOffset = 30;
    const yPosition = 90;
    const tagPadding = 32;
    const tagHeight = 80;

    for (let i = 0; i < Math.min(tags.length, 4); i++) {
      const tag = tags[i].toUpperCase();
      const tagWidth = ctx.measureText(tag).width + tagPadding * 2;
      if (xOffset + tagWidth > canvas.width - 30) break;

      const tagX = xOffset;
      const tagY = yPosition - tagHeight / 2;

      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.roundRect(tagX - 2, tagY - 2, tagWidth + 4, tagHeight + 4, tagHeight / 2);
      ctx.fill();

      ctx.fillStyle = "rgba(40, 40, 40, 0.85)";
      ctx.beginPath();
      ctx.roundRect(tagX, tagY, tagWidth, tagHeight, tagHeight / 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.roundRect(tagX + 4, tagY + 4, tagWidth - 8, tagHeight / 2 - 4, tagHeight / 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.textAlign = "center";
      ctx.fillText(tag, tagX + tagWidth / 2, yPosition);

      xOffset = tagX + tagWidth + 24;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, textCanvasProps);
  return texture;
};

// Pack an array of textures into a single square atlas (one 512px slot each).
export const createTextureAtlas = (textures, isText = false) => {
  const atlasSize = Math.max(1, Math.ceil(Math.sqrt(textures.length)));
  const slot = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = atlasSize * slot;
  const ctx = canvas.getContext("2d");

  if (isText) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  textures.forEach((texture, index) => {
    const x = (index % atlasSize) * slot;
    const y = Math.floor(index / atlasSize) * slot;
    const source = isText ? texture.source?.data : texture.image;
    const ready = isText ? !!source : source?.complete;
    if (ready) ctx.drawImage(source, x, y, slot, slot);
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
  Object.assign(atlasTexture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    flipY: false,
  });
  return atlasTexture;
};

// Load all student photos into THREE textures (resolves once every image is
// decoded so the first atlas is complete).
export const loadImageTextures = (students) => {
  const loader = new THREE.TextureLoader();
  return Promise.all(
    students.map(
      (s) =>
        new Promise((resolve) => {
          const texture = loader.load(s.image, () => resolve(texture));
          Object.assign(texture, {
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
          });
        })
    )
  );
};
