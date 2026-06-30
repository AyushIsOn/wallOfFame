// Data store: the single source of truth for the wall, list and filters.
//
// This is the seam where a real backend plugs in later. Today it normalises
// the static `projects` array from data.js; tomorrow `loadStudents()` can be
// swapped to `fetch('/api/students')` (fed by the Excel -> n8n pipeline)
// without any other module changing.

import { projects } from "../data.js";
import { CATEGORIES } from "./config.js";

const TYPE_TO_CATEGORY = { RESEARCH: "research", INTERNSHIP: "internship" };

// Map a raw record to the stable shape the UI consumes.
const normalize = (raw, i) => ({
  id: i,
  name: raw.title,
  image: raw.image,
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

let students = projects.map(normalize);

// Stress-test affordance: `?seed=N` replicates the sample data up to N
// students with DISTINCT image URLs, so the wall's scaling can be exercised
// without a real large dataset (e.g. ?seed=500). No effect in normal use.
if (typeof window !== "undefined") {
  const seed = parseInt(new URLSearchParams(window.location.search).get("seed") || "", 10);
  if (Number.isFinite(seed) && seed > students.length) {
    const base = students;
    students = Array.from({ length: seed }, (_, i) => {
      const b = base[i % base.length];
      return { ...b, id: i, name: `${b.name} #${i + 1}`, image: `${b.image}?v=${i}` };
    });
  }
}

const unique = (arr) => [...new Set(arr)];
const departments = unique(students.map((s) => s.department)).sort();
const years = unique(students.map((s) => s.year)).sort((a, b) => b - a);

const state = { category: "all", department: "all", year: "all", search: "" };
const listeners = new Set();

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

export const store = {
  students,
  options: { categories: CATEGORIES, departments, years },
  getState: () => ({ ...state }),
  getFiltered,
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
};
