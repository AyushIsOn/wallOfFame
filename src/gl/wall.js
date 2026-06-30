// The infinite WebGL wall: one full-screen quad whose fragment shader tiles
// the active student set procedurally. Panning, zoom, hover and click
// hit-testing all share the constants in config.js with the shader.

import * as THREE from "three";
import { WALL, COLORS, CANVAS_FONT } from "../config.js";
import { vertexShader, fragmentShader } from "../shaders.js";
import {
  createTitleTexture,
  createTagsTexture,
  createTextureAtlas,
  loadImageTextures,
} from "./textures.js";

const rgbaToArray = (rgba) => {
  const match = rgba.match(/rgba?\(([^)]+)\)/);
  if (!match) return [1, 1, 1, 1];
  return match[1]
    .split(",")
    .map((v, i) => (i < 3 ? parseFloat(v.trim()) / 255 : parseFloat(v.trim() || 1)));
};

// Selectors that should NOT start a wall drag when pressed.
const UI_SELECTOR =
  ".filters-container,.filter-toggle-btn,.list-view-wrapper,.profile-overlay,.view-toggle-container,.search-cta,.search-overlay";

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
  }

  async init(allStudents) {
    this.allStudents = allStudents;

    // Rasterise text with the real font (not a fallback).
    await document.fonts.ready;
    try {
      await document.fonts.load(`80px '${CANVAS_FONT}'`);
    } catch (_) {
      /* fall back to system font if unavailable */
    }

    // Per-student textures, index-aligned to allStudents (student.id == index).
    this.titleTextures = allStudents.map((s) => createTitleTexture(s.name, s.year));
    this.tagsTextures = allStudents.map((s) => createTagsTexture(s.tags));
    this.imageTextures = await loadImageTextures(allStudents);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    const bg = rgbaToArray(COLORS.background);
    this.renderer.setClearColor(new THREE.Color(bg[0], bg[1], bg[2]), bg[3]);
    this.container.appendChild(this.renderer.domElement);

    this.uniforms = {
      uOffset: { value: new THREE.Vector2(0, 0) },
      uResolution: {
        value: new THREE.Vector2(this.container.offsetWidth, this.container.offsetHeight),
      },
      uBorderColor: { value: new THREE.Vector4(...rgbaToArray(COLORS.border)) },
      uHoverColor: { value: new THREE.Vector4(...rgbaToArray(COLORS.hover)) },
      uBackgroundColor: { value: new THREE.Vector4(...rgbaToArray(COLORS.background)) },
      uMousePos: { value: new THREE.Vector2(-1, -1) },
      uZoom: { value: 1 },
      uCellSize: { value: WALL.cellSize },
      uTextureCount: { value: 1 },
      uImageAtlas: { value: null },
      uTitleAtlas: { value: null },
      uTagsAtlas: { value: null },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.scene.add(this.plane);

    this.setActiveStudents(allStudents);
    this.attachEvents();
    this.animate();
  }

  // Re-pack the atlases for a (possibly filtered) subset of students.
  setActiveStudents(active) {
    this.active = active;
    if (!active.length) {
      this.renderer.domElement.style.visibility = "hidden";
      return;
    }
    this.renderer.domElement.style.visibility = "visible";

    const pick = (arr) => active.map((s) => arr[s.id]);
    this.disposeAtlases();
    this.uniforms.uImageAtlas.value = createTextureAtlas(pick(this.imageTextures), false);
    this.uniforms.uTitleAtlas.value = createTextureAtlas(pick(this.titleTextures), true);
    this.uniforms.uTagsAtlas.value = createTextureAtlas(pick(this.tagsTextures), true);
    this.uniforms.uTextureCount.value = active.length;
  }

  disposeAtlases() {
    ["uImageAtlas", "uTitleAtlas", "uTagsAtlas"].forEach((key) => {
      this.uniforms[key].value?.dispose?.();
    });
  }

  // Map client coords to the active-set index using the same math as the shader.
  indexAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const sy = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const r = Math.sqrt(sx * sx + sy * sy);
    const d = 1 - WALL.distortionK * r * r;
    const wx = sx * d * (rect.width / rect.height) * this.zoom + this.offset.x;
    const wy = sy * d * this.zoom + this.offset.y;
    const cellX = Math.floor(wx / WALL.cellSize);
    const cellY = Math.floor(wy / WALL.cellSize);
    const count = this.active.length;
    const raw = (cellX + cellY * WALL.rowStride) % count;
    return ((raw % count) + count) % count;
  }

  attachEvents() {
    const canvas = this.renderer.domElement;

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

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      this.uniforms.uMousePos.value.set(e.clientX - rect.left, e.clientY - rect.top);
    });
    canvas.addEventListener("mouseleave", () => this.uniforms.uMousePos.value.set(-1, -1));
  }

  resize() {
    const { offsetWidth: w, offsetHeight: h } = this.container;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.uniforms.uResolution.value.set(w, h);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const k = WALL.lerpFactor;
    this.offset.x += (this.targetOffset.x - this.offset.x) * k;
    this.offset.y += (this.targetOffset.y - this.offset.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;
    this.uniforms.uOffset.value.set(this.offset.x, this.offset.y);
    this.uniforms.uZoom.value = this.zoom;
    this.renderer.render(this.scene, this.camera);
  }
}
