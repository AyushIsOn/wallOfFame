// GLSL for the infinite wall. Numeric constants are injected from config so
// the shader, the click hit-testing and the JS interaction code all share one
// source of truth (no more duplicated magic numbers).

import { WALL, LAYOUT } from "./config.js";

// Format a JS number as a GLSL float literal (always has a decimal point).
const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform vec2 uOffset;
  uniform vec2 uResolution;
  uniform vec4 uBorderColor;
  uniform vec4 uHoverColor;
  uniform vec4 uBackgroundColor;
  uniform vec2 uMousePos;
  uniform float uZoom;
  uniform float uCellSize;
  uniform float uTextureCount;
  uniform sampler2D uImageAtlas;
  uniform sampler2D uTitleAtlas;
  uniform sampler2D uTagsAtlas;
  varying vec2 vUv;

  // Map a normalised screen position (-1..1) into panned/zoomed world space,
  // applying the same barrel distortion used for rendering.
  vec2 toWorld(vec2 screenUV, vec2 aspect) {
    float radius = length(screenUV);
    float distortion = 1.0 - ${f(WALL.distortionK)} * radius * radius;
    return screenUV * distortion * aspect * uZoom + uOffset;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);

    vec2 screenUV = (vUv - 0.5) * 2.0;
    vec2 worldCoord = toWorld(screenUV, aspect);

    vec2 cellPos = worldCoord / uCellSize;
    vec2 cellId = floor(cellPos);
    vec2 cellUV = fract(cellPos);

    // Hover highlight driven by the cell under the mouse.
    vec2 mouseScreenUV = (uMousePos / uResolution) * 2.0 - 1.0;
    mouseScreenUV.y = -mouseScreenUV.y;
    vec2 mouseWorld = toWorld(mouseScreenUV, aspect);
    vec2 mouseCellId = floor(mouseWorld / uCellSize);

    float cellDistance = length((cellId + 0.5) - (mouseCellId + 0.5));
    float hoverIntensity = 1.0 - smoothstep(0.4, 0.7, cellDistance);
    bool isHovered = hoverIntensity > 0.0 && uMousePos.x >= 0.0;

    vec3 backgroundColor = uBackgroundColor.rgb;
    if (isHovered) {
      backgroundColor = mix(uBackgroundColor.rgb, uHoverColor.rgb, hoverIntensity * uHoverColor.a);
    }

    // Grid border.
    float lineWidth = 0.005;
    float gridX = smoothstep(0.0, lineWidth, cellUV.x) * smoothstep(0.0, lineWidth, 1.0 - cellUV.x);
    float gridY = smoothstep(0.0, lineWidth, cellUV.y) * smoothstep(0.0, lineWidth, 1.0 - cellUV.y);
    float gridMask = gridX * gridY;

    // Image region (centred square).
    float imageSize = ${f(LAYOUT.imageSize)};
    float imageBorder = (1.0 - imageSize) * 0.5;
    vec2 imageUV = (cellUV - imageBorder) / imageSize;
    float edgeSmooth = 0.01;
    vec2 imageMask = smoothstep(-edgeSmooth, edgeSmooth, imageUV) *
                     smoothstep(-edgeSmooth, edgeSmooth, 1.0 - imageUV);
    float imageAlpha = imageMask.x * imageMask.y;
    bool inImageArea = imageUV.x >= 0.0 && imageUV.x <= 1.0 && imageUV.y >= 0.0 && imageUV.y <= 1.0;

    // Title band (name + year) near the top of the tile.
    float titleY = ${f(LAYOUT.titleY)};
    float titleHeight = ${f(LAYOUT.titleHeight)};
    float titleXInset = ${f(LAYOUT.titleXInset)};
    float titleXSpan = ${f(LAYOUT.titleXSpan)};
    bool inTitleArea = cellUV.x >= titleXInset && cellUV.x <= (1.0 - titleXInset) &&
                       cellUV.y >= titleY && cellUV.y <= (titleY + titleHeight);

    // Tags band near the bottom of the tile.
    float tagsY = ${f(LAYOUT.tagsY)};
    float tagsHeight = ${f(LAYOUT.tagsHeight)};
    float tagsXInset = ${f(LAYOUT.tagsXInset)};
    float tagsXSpan = ${f(LAYOUT.tagsXSpan)};
    bool inTagsArea = cellUV.x >= tagsXInset && cellUV.x <= (1.0 - tagsXInset) &&
                      cellUV.y >= tagsY && cellUV.y <= (tagsY + tagsHeight);

    float texIndex = mod(cellId.x + cellId.y * ${f(WALL.rowStride)}, uTextureCount);
    float atlasSize = ceil(sqrt(uTextureCount));
    vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));

    vec3 color = backgroundColor;

    if (inImageArea && imageAlpha > 0.0) {
      vec2 atlasUV = (atlasPos + imageUV) / atlasSize;
      atlasUV.y = 1.0 - atlasUV.y;
      vec3 imageColor = texture2D(uImageAtlas, atlasUV).rgb;
      color = mix(color, imageColor, imageAlpha);
    }

    if (inTitleArea) {
      vec2 titleCoord = vec2((cellUV.x - titleXInset) / titleXSpan, (cellUV.y - titleY) / titleHeight);
      titleCoord.y = 1.0 - titleCoord.y;
      vec4 textColor = texture2D(uTitleAtlas, (atlasPos + titleCoord) / atlasSize);
      color = mix(backgroundColor, textColor.rgb, textColor.a);
    }

    if (inTagsArea) {
      vec2 tagsCoord = vec2((cellUV.x - tagsXInset) / tagsXSpan, (cellUV.y - tagsY) / tagsHeight);
      tagsCoord.y = 1.0 - tagsCoord.y;
      vec4 textColor = texture2D(uTagsAtlas, (atlasPos + tagsCoord) / atlasSize);
      color = mix(backgroundColor, textColor.rgb, textColor.a);
    }

    color = mix(color, uBorderColor.rgb, (1.0 - gridMask) * uBorderColor.a);

    float radius = length(screenUV);
    float fade = 1.0 - smoothstep(1.2, 1.8, radius);
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;
