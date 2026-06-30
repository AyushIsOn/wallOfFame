// Post-process pass: the flat grid of tiles is rendered to an offscreen
// buffer, then this shader warps that buffer with the same barrel/fisheye
// distortion and radial edge fade the original wall used — so the look is
// preserved while the scene itself is now virtualised.

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
  varying vec2 vUv;

  void main() {
    vec2 s = (vUv - 0.5) * 2.0;            // -1 .. 1 screen space
    float r2 = dot(s, s);
    vec2 distorted = s * (1.0 - ${f(WALL.distortionK)} * r2);
    vec2 uv = distorted * 0.5 + 0.5;

    vec3 color = texture2D(uScene, uv).rgb;

    float radius = length(s);
    float fade = 1.0 - smoothstep(${f(FADE.start)}, ${f(FADE.end)}, radius);
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;
