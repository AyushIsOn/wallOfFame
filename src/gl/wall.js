// Virtualised infinite wall.
//
// Instead of one quad sampling a giant atlas of every photo, the wall now
// draws only the tiles visible in the viewport (a small recycled pool of
// textured quads) into an offscreen buffer, then post-processes that buffer
// with barrel distortion + edge fade. Each visible student's photo+text is a
// streamed, LRU-cached card texture. GPU memory and network therefore stay
// bounded no matter how many students exist.

import * as THREE from "three";
import { WALL, CARD, TILE_POOL, CANVAS_FONT } from "../config.js";
import { postVertexShader, postFragmentShader } from "../shaders.js";
import { CardCache } from "./textureCache.js";

const UI_SELECTOR =
  ".filters-container,.filter-toggle-btn,.list-view-wrapper,.profile-overlay,.view-toggle-container,.search-cta,.search-overlay";

const BLACK = new THREE.Color(0, 0, 0);

// Soft radial alpha mask used for the per-tile hover glow. Tinted per-tile by
// the photo's dominant color and faded in on hover.
const buildGlowTexture = () => {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.85)");
  g.addColorStop(0.85, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const GLOW_MAX = 0.9; // peak opacity of the hover glow
const HOVER_LERP = 0.18; // hover fade speed

export class Wall {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.offset = { x: 0, y: 0 };
    this.targetOffset = { x: 0, y: 0 };
    this.zoom = 1;
    this.targetZoom = 1;
    this.dragging = false;
    this.isClick = true;
    this.clickStartTime = 0;
    this.prevMouse = { x: 0, y: 0 };
    this.active = [];
    this.pool = [];
  }

  async init() {
    await document.fonts.ready;
    try {
      await document.fonts.load(`80px '${CANVAS_FONT}'`);
    } catch (_) {
      /* fall back to a system font */
    }

    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(BLACK, 1);
    this.container.appendChild(this.renderer.domElement);

    // Tile scene (flat grid) rendered into an offscreen target.
    this.scene = new THREE.Scene();
    this.tileCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.tileCamera.position.z = 10;
    this.tileGeometry = new THREE.PlaneGeometry(WALL.cellSize, WALL.cellSize);
    this.glowGeometry = new THREE.PlaneGeometry(WALL.cellSize * 1.3, WALL.cellSize * 1.3);
    this.glowTexture = buildGlowTexture();
    this.pointer = null;

    this.renderTarget = new THREE.WebGLRenderTarget(
      Math.round(w * this.pixelRatio),
      Math.round(h * this.pixelRatio),
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
    );

    // Fullscreen post-process pass (distortion + fade).
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.postCamera.position.z = 1;
    this.postMaterial = new THREE.ShaderMaterial({
      vertexShader: postVertexShader,
      fragmentShader: postFragmentShader,
      uniforms: {
        uScene: { value: this.renderTarget.texture },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uZoom: { value: 1 },
        uResolution: { value: new THREE.Vector2(w, h) },
        uCellSize: { value: WALL.cellSize },
        uGridColor: { value: new THREE.Vector4(1, 1, 1, 0.22) },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));

    this.cache = new CardCache({ size: CARD.size, limit: CARD.cacheLimit, onReady: () => {} });

    this.growPool(TILE_POOL);
    this.attachEvents();
    this.animate();
  }

  growPool(target) {
    while (this.pool.length < target) {
      // Glow sits behind the card; the card has a transparent background so
      // the colored glow shows around the photo on hover.
      const glow = new THREE.Mesh(
        this.glowGeometry,
        new THREE.MeshBasicMaterial({
          map: this.glowTexture,
          color: new THREE.Color(0, 0, 0),
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
        })
      );
      glow.renderOrder = 0;
      glow.visible = false;
      glow.userData.h = 0;

      const card = new THREE.Mesh(
        this.tileGeometry,
        new THREE.MeshBasicMaterial({
          map: this.cache.placeholder,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        })
      );
      card.renderOrder = 1;
      card.visible = false;

      this.scene.add(glow);
      this.scene.add(card);
      this.pool.push({ card, glow });
    }
  }

  setActiveStudents(active) {
    this.active = active;
    if (this.renderer) {
      this.renderer.domElement.style.visibility = active.length ? "visible" : "hidden";
    }
  }

  // Assign pooled tiles to the cells currently in view.
  updateVisibleTiles() {
    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    const aspect = w / h;
    const halfW = aspect * this.zoom;
    const halfH = this.zoom;
    const cs = WALL.cellSize;
    const m = WALL.cellMargin;

    const left = this.offset.x - halfW;
    const right = this.offset.x + halfW;
    const bottom = this.offset.y - halfH;
    const top = this.offset.y + halfH;

    this.tileCamera.left = left;
    this.tileCamera.right = right;
    this.tileCamera.top = top;
    this.tileCamera.bottom = bottom;
    this.tileCamera.updateProjectionMatrix();

    const minX = Math.floor(left / cs) - m;
    const maxX = Math.floor(right / cs) + m;
    const minY = Math.floor(bottom / cs) - m;
    const maxY = Math.floor(top / cs) + m;

    const needed = (maxX - minX + 1) * (maxY - minY + 1);
    if (needed > this.pool.length) this.growPool(needed);

    const hoverCell =
      this.pointer && !this.dragging
        ? this.cellCoordsAt(this.pointer.x, this.pointer.y)
        : null;

    const count = this.active.length;
    let i = 0;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const raw = (cx + cy * WALL.rowStride) % count;
        const idx = ((raw % count) + count) % count;
        const { card, glow } = this.pool[i++];
        const px = (cx + 0.5) * cs;
        const py = (cy + 0.5) * cs;

        const { texture, avg } = this.cache.get(this.active[idx]);
        card.position.set(px, py, 0);
        card.material.map = texture;
        card.visible = true;

        glow.position.set(px, py, 0);
        glow.material.color.copy(avg);
        const target = hoverCell && cx === hoverCell.cx && cy === hoverCell.cy ? 1 : 0;
        glow.userData.h += (target - glow.userData.h) * HOVER_LERP;
        glow.material.opacity = glow.userData.h * GLOW_MAX;
        glow.visible = glow.userData.h > 0.01;
      }
    }
    for (; i < this.pool.length; i++) {
      this.pool[i].card.visible = false;
      this.pool[i].glow.visible = false;
    }
  }

  // Map client coords to the cell (cellX, cellY) under the cursor.
  cellCoordsAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const sy = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const r2 = sx * sx + sy * sy;
    const d = 1 - WALL.distortionK * r2;
    const wx = sx * d * (rect.width / rect.height) * this.zoom + this.offset.x;
    const wy = sy * d * this.zoom + this.offset.y;
    return { cx: Math.floor(wx / WALL.cellSize), cy: Math.floor(wy / WALL.cellSize) };
  }

  // Map client coords to the active-set index (same fisheye math as the shader).
  indexAt(clientX, clientY) {
    const { cx, cy } = this.cellCoordsAt(clientX, clientY);
    const count = this.active.length;
    const raw = (cx + cy * WALL.rowStride) % count;
    return ((raw % count) + count) % count;
  }

  attachEvents() {
    const startDrag = (x, y, target) => {
      if (target && target.closest && target.closest(UI_SELECTOR)) return;
      this.dragging = true;
      this.isClick = true;
      this.clickStartTime = Date.now();
      document.body.classList.add("dragging");
      this.prevMouse = { x, y };
      setTimeout(() => this.dragging && (this.targetZoom = WALL.dragZoom), 150);
    };

    const move = (x, y) => {
      if (!this.dragging) return;
      const dx = x - this.prevMouse.x;
      const dy = y - this.prevMouse.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.isClick = false;
        if (this.targetZoom === 1) this.targetZoom = WALL.dragZoom;
      }
      this.targetOffset.x -= dx * 0.003;
      this.targetOffset.y += dy * 0.003;
      this.prevMouse = { x, y };
    };

    const end = (x, y) => {
      this.dragging = false;
      document.body.classList.remove("dragging");
      this.targetZoom = 1;
      if (this.isClick && Date.now() - this.clickStartTime < 200 && x !== undefined) {
        const el = document.elementFromPoint(x, y);
        if (el && el.closest("#gallery") && this.active.length) {
          this.onSelect(this.active[this.indexAt(x, y)]);
        }
      }
    };

    document.addEventListener("mousedown", (e) => startDrag(e.clientX, e.clientY, e.target));
    document.addEventListener("mousemove", (e) => move(e.clientX, e.clientY));
    document.addEventListener("mouseup", (e) => end(e.clientX, e.clientY));
    document.addEventListener("mouseleave", () => end());

    const passive = { passive: false };
    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.target.closest && e.target.closest(UI_SELECTOR)) return;
        e.preventDefault();
        startDrag(e.touches[0].clientX, e.touches[0].clientY, e.target);
      },
      passive
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!this.dragging) return;
        e.preventDefault();
        move(e.touches[0].clientX, e.touches[0].clientY);
      },
      passive
    );
    document.addEventListener(
      "touchend",
      (e) => {
        const t = e.changedTouches?.[0];
        end(t?.clientX, t?.clientY);
      },
      passive
    );

    document.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", () => this.resize());

    // Pointer tracking for the hover glow.
    const canvas = this.renderer.domElement;
    canvas.addEventListener("mousemove", (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("mouseleave", () => {
      this.pointer = null;
    });
  }

  resize() {
    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    this.renderer.setSize(w, h);
    this.renderTarget.setSize(Math.round(w * this.pixelRatio), Math.round(h * this.pixelRatio));
    this.postMaterial.uniforms.uResolution.value.set(w, h);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const k = WALL.lerpFactor;
    this.offset.x += (this.targetOffset.x - this.offset.x) * k;
    this.offset.y += (this.targetOffset.y - this.offset.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;

    if (!this.active.length) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      return;
    }

    this.cache.beginFrame();
    this.updateVisibleTiles();

    this.postMaterial.uniforms.uOffset.value.set(this.offset.x, this.offset.y);
    this.postMaterial.uniforms.uZoom.value = this.zoom;

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.tileCamera);

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);

    this.cache.evict();
  }
}
