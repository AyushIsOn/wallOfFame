// Single-pass tile shaders. Tiles are rendered DIRECTLY to the screen (no
// offscreen buffer), so nothing is re-sampled and everything stays sharp.
//
// - Vertex shader applies the barrel/fisheye distortion by displacing each
//   (subdivided) tile vertex, reproducing the original look without a blurry
//   post-process pass.
// - Fragment shader composites: per-tile dominant-color glow (rectangular,
//   contained within the cell) -> photo/text card -> grid lines -> edge fade.

import { WALL, FADE } from "./config.js";

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const tileVertexShader = `
  uniform vec2 uOffset;
  uniform float uZoom;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec2 vScreen;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Undistorted normalised screen position for this world point.
    vec2 u = vec2((world.x - uOffset.x) / (uAspect * uZoom), (world.y - uOffset.y) / uZoom);
    // Forward barrel distortion (inverse of the sampling used for hit-testing).
    vec2 s = u * (1.0 + ${f(WALL.distortionK)} * dot(u, u));
    vScreen = s;
    gl_Position = vec4(s, 0.0, 1.0);
  }
`;

export const tileFragmentShader = `
  uniform sampler2D tMap;
  uniform vec3 uAvg;
  uniform float uHover;
  uniform vec4 uGrid;
  varying vec2 vUv;
  varying vec2 vScreen;

  void main() {
    vec4 c = texture2D(tMap, vUv);

    // Dominant-color hover glow: fills the cell box, soft-fades at the edges
    // so it stays contained within the cell (never circular/bleeding).
    float gx = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float gy = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
    float glow = gx * gy * uHover;
    vec3 color = mix(uAvg * glow, c.rgb, c.a);

    // Crisp grid lines at the cell edges.
    float lw = 0.012;
    float gridX = smoothstep(0.0, lw, vUv.x) * smoothstep(0.0, lw, 1.0 - vUv.x);
    float gridY = smoothstep(0.0, lw, vUv.y) * smoothstep(0.0, lw, 1.0 - vUv.y);
    color = mix(color, uGrid.rgb, (1.0 - gridX * gridY) * uGrid.a);

    // Radial edge fade.
    float fade = 1.0 - smoothstep(${f(FADE.start)}, ${f(FADE.end)}, length(vScreen));
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;
