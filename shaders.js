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
  uniform sampler2D uNameAtlas;
  uniform sampler2D uTagsAtlas;
  varying vec2 vUv;
  
  void main() {
    vec2 screenUV = (vUv - 0.5) * 2.0;
    
    float radius = length(screenUV);
    float distortion = 1.0 - 0.08 * radius * radius;
    vec2 distortedUV = screenUV * distortion;
    
    vec2 aspectRatio = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 worldCoord = distortedUV * aspectRatio;
    
    worldCoord *= uZoom;
    worldCoord += uOffset;
    
    vec2 cellPos = worldCoord / uCellSize;
    vec2 cellId = floor(cellPos);
    vec2 cellUV = fract(cellPos);
    
    vec2 mouseScreenUV = (uMousePos / uResolution) * 2.0 - 1.0;
    mouseScreenUV.y = -mouseScreenUV.y;
    
    float mouseRadius = length(mouseScreenUV);
    float mouseDistortion = 1.0 - 0.08 * mouseRadius * mouseRadius;
    vec2 mouseDistortedUV = mouseScreenUV * mouseDistortion;
    vec2 mouseWorldCoord = mouseDistortedUV * aspectRatio;
    
    mouseWorldCoord *= uZoom;
    mouseWorldCoord += uOffset;
    
    vec2 mouseCellPos = mouseWorldCoord / uCellSize;
    vec2 mouseCellId = floor(mouseCellPos);
    
    vec2 cellCenter = cellId + 0.5;
    vec2 mouseCellCenter = mouseCellId + 0.5;
    float cellDistance = length(cellCenter - mouseCellCenter);
    float hoverIntensity = 1.0 - smoothstep(0.4, 0.7, cellDistance);
    bool isHovered = hoverIntensity > 0.0 && uMousePos.x >= 0.0;
    
    vec3 backgroundColor = uBackgroundColor.rgb;
    if (isHovered) {
      backgroundColor = mix(uBackgroundColor.rgb, uHoverColor.rgb, hoverIntensity * uHoverColor.a);
    }
    
    float lineWidth = 0.005;
    float gridX = smoothstep(0.0, lineWidth, cellUV.x) * smoothstep(0.0, lineWidth, 1.0 - cellUV.x);
    float gridY = smoothstep(0.0, lineWidth, cellUV.y) * smoothstep(0.0, lineWidth, 1.0 - cellUV.y);
    float gridMask = gridX * gridY;
    
    float imageSize = 0.6;
    float imageBorder = (1.0 - imageSize) * 0.5;
    
    vec2 imageUV = (cellUV - imageBorder) / imageSize;
    
    float edgeSmooth = 0.01;
    vec2 imageMask = smoothstep(-edgeSmooth, edgeSmooth, imageUV) * 
                    smoothstep(-edgeSmooth, edgeSmooth, 1.0 - imageUV);
    float imageAlpha = imageMask.x * imageMask.y;
    
    bool inImageArea = imageUV.x >= 0.0 && imageUV.x <= 1.0 && imageUV.y >= 0.0 && imageUV.y <= 1.0;
    
    // Name area - at the top of cell (reduced height to match canvas aspect better)
    float nameHeight = 0.07;  // Reduced from 0.06 to further reduce vertical stretching
    float nameY = 0.03;
    bool inNameArea = cellUV.x >= 0.02 && cellUV.x <= 0.98 && cellUV.y >= nameY && cellUV.y <= (nameY + nameHeight);
    
    // Tags area - below the image at the bottom (increased height to match taller canvas)
    float tagsHeight = 0.06;  // Increased from 0.12 to 0.15 to accommodate taller canvas (180px)
    float tagsY = 0.82;  // Moved up slightly from 0.85 for better positioning
    bool inTagsArea = cellUV.x >= 0.05 && cellUV.x <= 0.95 && cellUV.y >= tagsY && cellUV.y <= (tagsY + tagsHeight);
    
    float texIndex = mod(cellId.x + cellId.y * 3.0, uTextureCount);
    
    // Calculate atlas layout once (shared by all texture atlases)
    float atlasSize = ceil(sqrt(uTextureCount));
    vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
    
    vec3 color = backgroundColor;
    
    if (inImageArea && imageAlpha > 0.0) {
      vec2 atlasUV = (atlasPos + imageUV) / atlasSize;
      atlasUV.y = 1.0 - atlasUV.y;
      
      vec3 imageColor = texture2D(uImageAtlas, atlasUV).rgb;
      color = mix(color, imageColor, imageAlpha);
    }
    
    // Render name and year (top of cell, samples from uNameAtlas)
    if (inNameArea) {
      vec2 nameCoord = vec2((cellUV.x - 0.02) / 0.96, (cellUV.y - nameY) / nameHeight);
      nameCoord.y = 1.0 - nameCoord.y;
      
      vec2 atlasUV = (atlasPos + nameCoord) / atlasSize;
      
      vec4 textColor = texture2D(uNameAtlas, atlasUV);
      
      vec3 textBgColor = backgroundColor;
      color = mix(textBgColor, textColor.rgb, textColor.a);
    }
    
    // Render tags (bottom of cell, samples from uTagsAtlas)
    if (inTagsArea) {
      vec2 tagsCoord = vec2((cellUV.x - 0.05) / 0.9, (cellUV.y - tagsY) / tagsHeight);
      tagsCoord.y = 1.0 - tagsCoord.y;
      
      vec2 atlasUV = (atlasPos + tagsCoord) / atlasSize;
      
      vec4 textColor = texture2D(uTagsAtlas, atlasUV);
      
      vec3 textBgColor = backgroundColor;
      color = mix(textBgColor, textColor.rgb, textColor.a);
    }
    
    vec3 borderRGB = uBorderColor.rgb;
    float borderAlpha = uBorderColor.a;
    color = mix(color, borderRGB, (1.0 - gridMask) * borderAlpha);
    
    float fade = 1.0 - smoothstep(1.2, 1.8, radius);
    
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;
