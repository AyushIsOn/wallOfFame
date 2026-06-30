// Shared configuration for the Wall of Fame.
// Imported by both the renderer and the JS interaction code so the two can
// never drift apart.

export const WALL = {
  cellSize: 0.75, // world-space size of one tile
  dragZoom: 1.25, // zoom level while dragging
  lerpFactor: 0.075, // pan/zoom smoothing
  distortionK: 0.08, // barrel/fisheye strength (post-process + click math)
  rowStride: 3.0, // texIndex = cellId.x + cellId.y * rowStride
  cellMargin: 1, // extra ring of cells rendered beyond the viewport
};

export const COLORS = {
  border: "rgba(255, 255, 255, 0.15)",
  background: "rgba(0, 0, 0, 1)",
  text: "rgba(128, 128, 128, 1)",
};

// Radial fade applied at the screen edges (in normalised screen radius).
export const FADE = { start: 1.2, end: 1.8 };

// Cell sub-region layout, in cell-local UV (y = 0 bottom .. 1 top). These
// place the photo in the centre, the title band near the top and the tags
// band near the bottom of each tile.
export const LAYOUT = {
  imageSize: 0.6,
  titleY: 0.82,
  titleHeight: 0.06,
  titleXInset: 0.05,
  tagsY: 0.03,
  tagsHeight: 0.07,
  tagsXInset: 0.02,
};

const isSmallScreen =
  typeof window !== "undefined" &&
  Math.min(window.innerWidth, window.innerHeight) < 768;

// Streaming card textures. Each visible student gets ONE card texture
// (photo + text) built on demand and kept in an LRU cache. Higher resolution
// keeps tiles sharp when rendered large; cache limits keep GPU memory bounded.
export const CARD = {
  size: isSmallScreen ? 512 : 768,
  cacheLimit: isSmallScreen ? 56 : 72,
};

// Initial recycled tile-mesh pool (grows automatically if a viewport ever
// needs more). Only this many quads are ever drawn, regardless of N.
export const TILE_POOL = 120;

// Category vocabulary the college plans to use. Department + year filter
// pills are derived from live data; categories are a fixed list.
export const CATEGORIES = [
  "internship",
  "hackathons",
  "research",
  "fellowship",
  "grants",
  "incubation",
  "exams",
  "patent",
  "sports",
  "services",
  "others",
];

// Font used to rasterise tile text. Loaded before any card is drawn.
export const CANVAS_FONT = "At Hauss Mono";
