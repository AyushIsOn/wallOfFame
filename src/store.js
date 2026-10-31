// Data store: the single source of truth for the wall, list and filters.
//
// `load()` fetches the live dataset from /api/students (fed by the admin +
// Excel/n8n pipeline). Until it answers, the store is empty and `status` is
// "loading". If the API is unreachable, a dev build (npm run dev) falls back
// to the sample data in data.js so the frontend can be worked on without the
// server; a production build shows an error instead of fake students.
// `?seed=N` (stress test) skips the API and clones the sample data to N.

import { projects } from "../data.js";
import { CATEGORIES } from "./config.js";

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
  // Same rule the server uses when seeding (server/db.js), so the static first
  // paint and the live data agree.
  category: (raw.category || raw.type || "others").toLowerCase(),
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

const sampleStudents = projects.map(normalizeStatic);
const options = { categories: [], departments: [], years: [] };

const seed = typeof window !== "undefined"
  ? parseInt(new URLSearchParams(window.location.search).get("seed") || "", 10)
  : NaN;
const stressMode = Number.isFinite(seed) && seed > 0;

// Stress test: clone the samples up to N with unique ids and image URLs.
const stressStudents = () =>
  seed <= sampleStudents.length
    ? sampleStudents
    : Array.from({ length: seed }, (_, i) => {
        const b = sampleStudents[i % sampleStudents.length];
        return {
          ...b,
          id: i,
          name: `${b.name} #${i + 1}`,
          image: `${b.image}?v=${i}`,
          thumbnail: b.thumbnail ? `${b.thumbnail}?v=${i}` : null,
        };
      });

// "loading" -> "ready" (live data) | "sample" (dev fallback / stress) | "error"
let status = stressMode ? "sample" : "loading";
let students = stressMode ? stressStudents() : [];

let byId = new Map(students.map((s) => [s.id, s]));

// Known categories keep the college's preferred order; any others found in the
// data (e.g. a custom Type from a sheet) follow alphabetically.
const categoryRank = (c) => {
  const i = CATEGORIES.indexOf(c);
  return i === -1 ? CATEGORIES.length : i;
};

const recomputeOptions = () => {
  const uniq = (a) => [...new Set(a)];
  options.categories = uniq(students.map((s) => s.category).filter(Boolean)).sort(
    (a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b)
  );
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
  let data = null;
  try {
    const res = await fetch("/api/students");
    if (res.ok) data = await res.json();
  } catch {
    /* network error: handled below */
  }
  if (Array.isArray(data)) {
    students = data.map(normalizeApi);
    status = "ready";
  } else if (import.meta.env.DEV) {
    students = sampleStudents; // frontend dev without the API server
    status = "sample";
  } else {
    students = [];
    status = "error";
  }
  byId = new Map(students.map((s) => [s.id, s]));
  recomputeOptions();
  dataListeners.forEach((fn) => fn());
  notify();
}

export const store = {
  get students() {
    return students;
  },
  /** "loading" | "ready" | "sample" | "error" */
  get status() {
    return status;
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
