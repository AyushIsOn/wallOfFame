// Streaming LRU cache of per-student card textures.
//
// This is what makes the wall scale: only students currently on (or recently
// on) screen have a GPU texture. Cards are built lazily the first time they're
// requested and disposed once they fall out of the cache, so GPU memory and
// network stay bounded no matter how many students exist.

import * as THREE from "three";
import { loadImage, drawCard, cardImageUrl, averageColor, PLACEHOLDER_GLOW } from "./card.js";

const BLACK = new THREE.Color(0, 0, 0);

const makeTexture = (canvas) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: sample the full-resolution card directly so text, lines and
  // photos stay crisp (mipmaps pre-blur the texture when scaled down). This
  // matches the original wall's filtering.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

// A transparent placeholder shown while a card's photo is still downloading
// (the tile then shows the cleared black background).
const buildPlaceholder = (size) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return makeTexture(canvas);
};

export class CardCache {
  constructor({ size, limit, onReady }) {
    this.size = size;
    this.limit = limit;
    this.onReady = onReady || (() => {});
    this.entries = new Map(); // id -> { texture, status, frame }
    this.placeholder = buildPlaceholder(size);
    this.frame = 0;
  }

  beginFrame() {
    this.frame++;
  }

  // Return the best texture + dominant color for a student right now, kicking
  // off a lazy load if needed. Never blocks.
  get(student) {
    let entry = this.entries.get(student.id);
    // Cards are cached by id, but the same id can come back as a DIFFERENT
    // student object when the dataset is replaced (a reload after an admin
    // edit, or the dev sample fallback whose ids 0,1,2… overlap the DB's).
    // A new object means new data: rebuild the card, or a cell would show the
    // stale card while a click opened the current student (display != identity).
    if (entry && entry.student !== student) {
      entry.texture?.dispose();
      this.entries.delete(student.id);
      entry = undefined;
    }
    if (!entry) {
      entry = { student, texture: null, avg: null, status: "loading", frame: this.frame };
      this.entries.set(student.id, entry);
      this.load(student, entry);
    }
    entry.frame = this.frame;
    return { texture: entry.texture || this.placeholder, avg: entry.avg || BLACK };
  }

  async load(student, entry) {
    // Prefer the thumbnail; fall back to the full-res image if the thumbnail
    // is missing (e.g. a freshly-added student before the pipeline runs).
    const candidates = [cardImageUrl(student)].filter(Boolean);
    if (student.image && student.image !== cardImageUrl(student)) {
      candidates.push(student.image);
    }
    for (const url of candidates) {
      try {
        const img = await loadImage(url);
        const [r, g, b] = averageColor(img);
        entry.avg = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
        entry.texture = makeTexture(drawCard(student, img, this.size));
        entry.status = "ready";
        this.onReady();
        return;
      } catch (_) {
        /* try the next source */
      }
    }
    // No photo, or every source failed: still draw the card (initials + name,
    // year, tags, department) so the student doesn't vanish from the wall.
    const [r, g, b] = PLACEHOLDER_GLOW;
    entry.avg = new THREE.Color(r, g, b);
    entry.texture = makeTexture(drawCard(student, null, this.size));
    entry.status = candidates.length ? "error" : "no-photo";
    this.onReady();
  }

  // Dispose least-recently-used cards beyond the limit (never the ones used
  // this frame, which are currently on screen).
  evict() {
    if (this.entries.size <= this.limit) return;
    const stale = [...this.entries.entries()]
      .filter(([, e]) => e.frame !== this.frame)
      .sort((a, b) => a[1].frame - b[1].frame);

    let removable = this.entries.size - this.limit;
    for (const [id, e] of stale) {
      if (removable <= 0) break;
      e.texture?.dispose();
      this.entries.delete(id);
      removable--;
    }
  }

  // For diagnostics / stress tests.
  get liveTextureCount() {
    let n = 0;
    for (const e of this.entries.values()) if (e.texture) n++;
    return n;
  }
}
