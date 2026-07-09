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
  text: "rgba(160, 160, 160, 1)",
};

// Radial fade applied at the screen edges (in normalised screen radius).
export const FADE = { start: 1.2, end: 1.8 };

// Cell sub-region layout, in cell-local UV (y = 0 bottom .. 1 top). Symmetric:
// the title band (top) and tags band (bottom) sit at equal margins from their
// edges with equal heights, and share one horizontal inset -> 4 balanced
// corners (name TL, year TR, tags BL, department BR).
export const LAYOUT = {
  imageSize: 0.6,
  titleY: 0.87,
  titleHeight: 0.07,
  titleXInset: 0.06,
  tagsY: 0.06,
  tagsHeight: 0.07,
  tagsXInset: 0.06,
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
