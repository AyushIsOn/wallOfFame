// Renders a single student "card" (photo + name/year + tag pills + grid edge)
// onto a canvas. One card == one streamed GPU texture. This replaces the old
// three-atlas approach; the cell layout proportions match LAYOUT exactly.

import { COLORS, LAYOUT, CANVAS_FONT } from "../config.js";

// Load an image. crossOrigin lets us draw remote (e.g. CDN/thumbnail) images
// to a canvas without tainting it.
export const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

// Pick the lightest source available for the wall (thumbnail if provided).
export const cardImageUrl = (student) => student.thumbnail || student.image;

// Draw `img` to cover the dst rect (center-crop, preserves aspect).
const drawCover = (ctx, img, dx, dy, dw, dh) => {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale;
  const sh = dh / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, dx, dy, dw, dh);
};

// Convert a cell-UV y (0 = bottom) to a canvas y (0 = top).
const toCanvasY = (uvY, size) => (1 - uvY) * size;

const drawTitle = (ctx, student, size) => {
  const top = toCanvasY(LAYOUT.titleY + LAYOUT.titleHeight, size);
  const bottom = toCanvasY(LAYOUT.titleY, size);
  const mid = (top + bottom) / 2;
  const inset = LAYOUT.titleXInset * size;
  const fontPx = Math.round(LAYOUT.titleHeight * size * 0.85);

  ctx.font = `${fontPx}px '${CANVAS_FONT}', monospace`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.text;

  ctx.textAlign = "left";
  ctx.fillText(student.name.toUpperCase(), inset, mid);
  ctx.textAlign = "right";
  ctx.fillText(String(student.year).toUpperCase(), size - inset, mid);
};

const drawTags = (ctx, student, size) => {
  const tags = (student.tags || []).slice(0, 4);
  if (!tags.length) return;

  const top = toCanvasY(LAYOUT.tagsY + LAYOUT.tagsHeight, size);
  const bottom = toCanvasY(LAYOUT.tagsY, size);
  const mid = (top + bottom) / 2;
  const pillH = (bottom - top) * 0.92;
  const fontPx = Math.round(pillH * 0.5);
  const padX = fontPx * 0.7;
  const gap = fontPx * 0.5;
  const radius = pillH / 2;

  ctx.font = `${fontPx}px '${CANVAS_FONT}', monospace`;
  ctx.textBaseline = "middle";

  let x = LAYOUT.tagsXInset * size;
  for (const raw of tags) {
    const tag = raw.toUpperCase();
    const w = ctx.measureText(tag).width + padX * 2;
    if (x + w > size - LAYOUT.tagsXInset * size) break;

    const y = mid - pillH / 2;
    ctx.fillStyle = "rgba(40, 40, 40, 0.85)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, pillH, radius);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = Math.max(1, size * 0.002);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.fillText(tag, x + w / 2, mid);

    x += w + gap;
  }
};

// Build a finished card canvas for a student given its already-loaded image.
export const drawCard = (student, img, size) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);

  // Centred photo square.
  const side = LAYOUT.imageSize * size;
  const offset = (size - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawCover(ctx, img, offset, offset, side, side);

  drawTitle(ctx, student, size);
  drawTags(ctx, student, size);

  // Grid lines: draw right + bottom edges so adjacent tiles form one grid.
  const lw = Math.max(1, size * 0.004);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(size - lw / 2, 0);
  ctx.lineTo(size - lw / 2, size);
  ctx.moveTo(0, size - lw / 2);
  ctx.lineTo(size, size - lw / 2);
  ctx.stroke();

  return canvas;
};
