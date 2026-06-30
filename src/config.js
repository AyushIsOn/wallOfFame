// Shared configuration for the Wall of Fame.
// Values here are imported by BOTH the WebGL shader (injected as GLSL
// constants) and the JS interaction code, so the two can never drift apart.

export const WALL = {
  cellSize: 0.75, // world-space size of one tile
  dragZoom: 1.25, // zoom level while dragging
  lerpFactor: 0.075, // pan/zoom smoothing
  distortionK: 0.08, // barrel/fisheye strength (shader + click math)
  rowStride: 3.0, // texIndex = cellId.x + cellId.y * rowStride
};

export const COLORS = {
  border: "rgba(255, 255, 255, 0.15)",
  background: "rgba(0, 0, 0, 1)",
  text: "rgba(128, 128, 128, 1)",
  hover: "rgba(255, 255, 255, 0)",
};

// Cell sub-region layout, in cell-local UV (y = 0 bottom .. 1 top).
// Tuned to the text-canvas aspect ratios; these place the title band near
// the top of each tile and the tags band near the bottom.
export const LAYOUT = {
  imageSize: 0.6,
  titleY: 0.82,
  titleHeight: 0.06,
  titleXInset: 0.05,
  titleXSpan: 0.9,
  tagsY: 0.03,
  tagsHeight: 0.07,
  tagsXInset: 0.02,
  tagsXSpan: 0.96,
};

// Category vocabulary the college plans to use. Department + year filter
// pills are derived from live data (so they never drift); categories are a
// fixed list so the UI stays stable even before data exists for each one.
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

// The font used to rasterise tile text onto canvases. Must be loaded before
// any texture is drawn, otherwise the browser falls back to a system font.
export const CANVAS_FONT = "At Hauss Mono";
