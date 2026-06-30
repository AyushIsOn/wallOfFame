// Streaming LRU cache of per-student card textures.
//
// This is what makes the wall scale: only students currently on (or recently
// on) screen have a GPU texture. Cards are built lazily the first time they're
// requested and disposed once they fall out of the cache, so GPU memory and
// network stay bounded no matter how many students exist.

import * as THREE from "three";
import { loadImage, drawCard, cardImageUrl, averageColor } from "./card.js";

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
    if (!entry) {
      entry = { texture: null, avg: null, status: "loading", frame: this.frame };
      this.entries.set(student.id, entry);
      this.load(student, entry);
    }
    entry.frame = this.frame;
    return { texture: entry.texture || this.placeholder, avg: entry.avg || BLACK };
  }

  async load(student, entry) {
    // Prefer the thumbnail; fall back to the full-res image if the thumbnail
    // is missing (e.g. a freshly-added student before the pipeline runs).
    const candidates = [cardImageUrl(student)];
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
    entry.status = "error"; // keep showing the placeholder
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
