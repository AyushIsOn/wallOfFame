// Data store: the single source of truth for the wall, list and filters.
//
// It renders instantly from the static data.js (offline / first paint), then
// `load()` fetches the live dataset from /api/students (fed by the admin +
// Excel/n8n pipeline) and swaps it in. Adding a backend required changing
// only this file.

import { projects } from "../data.js";
import { CATEGORIES } from "./config.js";

const TYPE_TO_CATEGORY = { RESEARCH: "research", INTERNSHIP: "internship" };

const toThumb = (url) => {
  if (!url) return null;
  const base = url.split("/").pop().replace(/\.[^.]+$/, "");
  return `/thumbs/${base}.webp`;
};

// Normalise the static data.js shape (used for first paint + offline fallback).
const normalizeStatic = (raw, i) => ({
  id: i,
  name: raw.title,
  image: raw.image,
  thumbnail: raw.thumbnail || toThumb(raw.image),
  year: raw.year,
  regNo: raw.regNo,
  department: raw.department,
  type: raw.type,
  category: TYPE_TO_CATEGORY[raw.type] || "others",
  duration: raw.duration,
  stipend: raw.stipend,
  bio: raw.bio,
  tags: Array.isArray(raw.tags) ? raw.tags : [],
  socials: raw.socials || { linkedin: "#", website: "#" },
  certificate: raw.certificate || "",
});

// Normalise an API record (already close to final shape; guard arrays/objects).
const normalizeApi = (s) => ({
  ...s,
  tags: Array.isArray(s.tags) ? s.tags : [],
  socials: s.socials || { linkedin: "#", website: "#" },
});

let students = projects.map(normalizeStatic);
const options = { categories: CATEGORIES, departments: [], years: [] };

const seed = typeof window !== "undefined"
  ? parseInt(new URLSearchParams(window.location.search).get("seed") || "", 10)
  : NaN;
const stressMode = Number.isFinite(seed) && seed > 0;

if (stressMode && seed > students.length) {
  const base = students;
  students = Array.from({ length: seed }, (_, i) => {
    const b = base[i % base.length];
    return {
      ...b,
      id: i,
      name: `${b.name} #${i + 1}`,
      image: `${b.image}?v=${i}`,
      thumbnail: b.thumbnail ? `${b.thumbnail}?v=${i}` : null,
    };
  });
}

let byId = new Map(students.map((s) => [s.id, s]));

const recomputeOptions = () => {
  const uniq = (a) => [...new Set(a)];
  options.departments = uniq(students.map((s) => s.department).filter(Boolean)).sort();
  options.years = uniq(students.map((s) => s.year).filter(Boolean)).sort((a, b) => b - a);
};
recomputeOptions();

const state = { category: "all", department: "all", year: "all", search: "" };
const listeners = new Set();
const dataListeners = new Set();

const matches = (s) => {
  if (state.category !== "all" && s.category !== state.category) return false;
  if (state.department !== "all" && s.department !== state.department) return false;
  if (state.year !== "all" && String(s.year) !== String(state.year)) return false;
  if (state.search) {
    const q = state.search.toLowerCase();
    const haystack = `${s.name} ${s.department} ${s.type} ${s.tags.join(" ")}`;
    if (!haystack.toLowerCase().includes(q)) return false;
  }
  return true;
};

const getFiltered = () => students.filter(matches);
const notify = () => {
  const filtered = getFiltered();
  listeners.forEach((fn) => fn(filtered));
};

async function load() {
  if (stressMode) return; // stress mode keeps the synthetic dataset
  try {
    const res = await fetch("/api/students");
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      students = data.map(normalizeApi);
      byId = new Map(students.map((s) => [s.id, s]));
      recomputeOptions();
      dataListeners.forEach((fn) => fn());
      notify();
    }
  } catch {
    /* keep the static fallback */
  }
}

export const store = {
  get students() {
    return students;
  },
  options,
  byId: (id) => byId.get(id) ?? byId.get(Number(id)) ?? byId.get(String(id)) ?? null,
  getState: () => ({ ...state }),
  getFiltered,
  load,
  setFilter(type, value) {
    if (!(type in state) || state[type] === value) return;
    state[type] = value;
    notify();
  },
  setSearch(value) {
    const next = (value || "").trim();
    if (next === state.search) return;
    state.search = next;
    notify();
  },
  reset() {
    state.category = state.department = state.year = "all";
    state.search = "";
    notify();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  onData(fn) {
    dataListeners.add(fn);
    return () => dataListeners.delete(fn);
  },
};
