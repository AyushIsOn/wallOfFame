// Virtualised infinite wall, rendered DIRECTLY to the screen (single pass) for
// maximum sharpness. Only the cells in view are drawn (a small recycled pool
// of subdivided quads); each visible student's photo+text is a streamed,
// LRU-cached card texture, so GPU memory stays bounded no matter how many
// students exist. The barrel/fisheye distortion is done per-vertex; the grid
// lines and the dominant-color hover glow are drawn in the tile fragment
// shader (the glow is rectangular and contained within each cell).

import * as THREE from "three";
import { WALL, CARD, TILE_POOL, CANVAS_FONT } from "../config.js";
import { tileVertexShader, tileFragmentShader } from "../shaders.js";
import { CardCache } from "./textureCache.js";

const UI_SELECTOR =
  ".filters-container,.filter-toggle-btn,.list-view-wrapper,.profile-overlay,.view-toggle-container,.search-cta,.search-overlay";

const HOVER_LERP = 0.18;

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
    this.pointer = null;
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(new THREE.Color(0, 0, 0), 1);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera(); // tile shader writes clip space directly

    // Subdivided so the per-vertex fisheye warp is smooth.
    this.tileGeometry = new THREE.PlaneGeometry(WALL.cellSize, WALL.cellSize, 12, 12);

    // Uniforms shared by every tile (updated once per frame).
    this.shared = {
      uOffset: { value: new THREE.Vector2(0, 0) },
      uZoom: { value: 1 },
      uAspect: { value: w / h },
      uGrid: { value: new THREE.Vector4(1, 1, 1, 0.22) },
    };

    this.cache = new CardCache({ size: CARD.size, limit: CARD.cacheLimit, onReady: () => {} });

    this.growPool(TILE_POOL);
    this.attachEvents();
    this.animate();
  }

  growPool(target) {
    while (this.pool.length < target) {
      const material = new THREE.ShaderMaterial({
        vertexShader: tileVertexShader,
        fragmentShader: tileFragmentShader,
        extensions: { derivatives: true },
        uniforms: {
          uOffset: this.shared.uOffset,
          uZoom: this.shared.uZoom,
          uAspect: this.shared.uAspect,
          uGrid: this.shared.uGrid,
          tMap: { value: this.cache.placeholder },
          uAvg: { value: new THREE.Color(0, 0, 0) },
          uHover: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(this.tileGeometry, material);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData.hover = 0;
      this.scene.add(mesh);
      this.pool.push(mesh);
    }
  }

  setActiveStudents(active) {
    this.active = active;
    if (this.renderer) {
      this.renderer.domElement.style.visibility = active.length ? "visible" : "hidden";
    }
  }

  updateVisibleTiles() {
    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    const aspect = w / h;
    const halfW = aspect * this.zoom;
    const halfH = this.zoom;
    const cs = WALL.cellSize;
    const m = WALL.cellMargin;

    this.shared.uOffset.value.set(this.offset.x, this.offset.y);
    this.shared.uZoom.value = this.zoom;
    this.shared.uAspect.value = aspect;

    const minX = Math.floor((this.offset.x - halfW) / cs) - m;
    const maxX = Math.floor((this.offset.x + halfW) / cs) + m;
    const minY = Math.floor((this.offset.y - halfH) / cs) - m;
    const maxY = Math.floor((this.offset.y + halfH) / cs) + m;

    const needed = (maxX - minX + 1) * (maxY - minY + 1);
    if (needed > this.pool.length) this.growPool(needed);

    this.cache.beginFrame();
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
        const mesh = this.pool[i++];
        const u = mesh.material.uniforms;

        mesh.position.set((cx + 0.5) * cs, (cy + 0.5) * cs, 0);
        mesh.visible = true;

        const { texture, avg } = this.cache.get(this.active[idx]);
        u.tMap.value = texture;
        u.uAvg.value.copy(avg);

        const target = hoverCell && cx === hoverCell.cx && cy === hoverCell.cy ? 1 : 0;
        mesh.userData.hover += (target - mesh.userData.hover) * HOVER_LERP;
        u.uHover.value = mesh.userData.hover;
      }
    }
    for (; i < this.pool.length; i++) this.pool[i].visible = false;
    this.cache.evict();
  }

  // Client coords -> (cellX, cellY) under the cursor (matches the vertex warp).
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
    this.shared.uAspect.value = w / h;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const k = WALL.lerpFactor;
    this.offset.x += (this.targetOffset.x - this.offset.x) * k;
    this.offset.y += (this.targetOffset.y - this.offset.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;

    if (!this.active.length) {
      this.renderer.clear();
      return;
    }
    this.updateVisibleTiles();
    this.renderer.render(this.scene, this.camera);
  }
}
