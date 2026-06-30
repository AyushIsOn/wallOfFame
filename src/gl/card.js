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

// Compute a vibrant dominant color from an image (downscale to 16x16, average
// opaque pixels, boost saturation). Runs ONCE per student at load time.
const avgCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
export const averageColor = (img) => {
  if (!avgCanvas) return [0, 0, 0];
  avgCanvas.width = avgCanvas.height = 16;
  const ctx = avgCanvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, 16, 16);
  ctx.drawImage(img, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  if (!n) return [0, 0, 0];
  r /= n; g /= n; b /= n;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = 1.45; // boost so the glow reads as a color, not muddy gray
  r = lum + (r - lum) * sat;
  g = lum + (g - lum) * sat;
  b = lum + (b - lum) * sat;
  // Brighten toward a vivid target so dark photos still glow with color.
  const maxc = Math.max(r, g, b, 1);
  const scale = Math.min(2.4, 205 / maxc);
  const clamp = (v) => Math.max(0, Math.min(255, v * scale)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
};

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
  const fontPx = Math.round(LAYOUT.titleHeight * size * 0.48);

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
  const band = bottom - top;
  const pillH = band * 0.5;
  const fontPx = Math.round(band * 0.34);
  const padX = fontPx * 0.75;
  const gap = fontPx * 0.55;
  const radius = pillH / 2;

  ctx.font = `${fontPx}px '${CANVAS_FONT}', monospace`;
  ctx.textBaseline = "middle";

  let x = LAYOUT.tagsXInset * size;
  for (const raw of tags) {
    const tag = raw.toUpperCase();
    const w = ctx.measureText(tag).width + padX * 2;
    if (x + w > size - LAYOUT.tagsXInset * size) break;

    const y = mid - pillH / 2;
    ctx.fillStyle = "rgba(38, 38, 38, 0.92)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, pillH, radius);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = Math.max(1, size * 0.0022);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.fillText(tag, x + w / 2, mid);

    x += w + gap;
  }
};

// Build a finished card canvas for a student given its already-loaded image.
// The background is left TRANSPARENT so the wall can render a colored hover
// glow behind it; the tile's default black comes from the cleared scene.
export const drawCard = (student, img, size) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Centred photo square.
  const side = LAYOUT.imageSize * size;
  const offset = (size - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawCover(ctx, img, offset, offset, side, side);

  drawTitle(ctx, student, size);
  drawTags(ctx, student, size);

  return canvas;
};
