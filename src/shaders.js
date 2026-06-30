// Post-process pass: the flat grid of tiles is rendered to an offscreen
// buffer, then this shader warps it with the barrel/fisheye distortion + edge
// fade and draws the crisp inter-cell grid lines (at screen resolution, so
// they stay sharp instead of being baked into a downsampled card texture).

import { WALL, FADE } from "./config.js";

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const postVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const postFragmentShader = `
  uniform sampler2D uScene;
  uniform vec2 uOffset;
  uniform float uZoom;
  uniform vec2 uResolution;
  uniform float uCellSize;
  uniform vec4 uGridColor;
  varying vec2 vUv;

  void main() {
    vec2 s = (vUv - 0.5) * 2.0;            // -1 .. 1 screen space
    float r2 = dot(s, s);
    vec2 distorted = s * (1.0 - ${f(WALL.distortionK)} * r2);
    vec2 uv = distorted * 0.5 + 0.5;

    vec3 color = texture2D(uScene, uv).rgb;

    // Crisp grid lines at cell boundaries (same world mapping as the tiles).
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 world = distorted * aspect * uZoom + uOffset;
    vec2 cellUV = fract(world / uCellSize);
    float lw = 0.006;
    float gx = smoothstep(0.0, lw, cellUV.x) * smoothstep(0.0, lw, 1.0 - cellUV.x);
    float gy = smoothstep(0.0, lw, cellUV.y) * smoothstep(0.0, lw, 1.0 - cellUV.y);
    float gridMask = gx * gy;
    color = mix(color, uGridColor.rgb, (1.0 - gridMask) * uGridColor.a);

    float radius = length(s);
    float fade = 1.0 - smoothstep(${f(FADE.start)}, ${f(FADE.end)}, radius);
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;
