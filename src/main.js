// Entry point: wires the data store to the wall, list view, filters, search
// and profile overlay. The store is the single source of truth — every view
// re-renders from store.subscribe(), so the data source can change without
// touching the views.

import { store } from "./store.js";
import { Wall } from "./gl/wall.js";
import { initViewToggle } from "./ui/viewToggle.js";
import { initFilters } from "./ui/filters.js";
import { initSearch } from "./ui/search.js";
import { initListView } from "./ui/listView.js";
import { initProfileOverlay } from "./ui/profileOverlay.js";
import { initGetFeatured } from "./ui/getFeatured.js";

const EMPTY_MESSAGES = {
  error: "Couldn't load students right now. Please refresh the page.",
  default: "No students match these filters.",
};

const start = async () => {
  const container = document.getElementById("gallery");
  if (!container) return;

  // Start fetching the students right away, in parallel with font loading and
  // WebGL setup below. Views render whatever the store holds when it lands.
  store.load();

  const profile = initProfileOverlay();
  const openProfile = (student) => profile.open(student, store.getFiltered());

  const wall = new Wall(container, openProfile);
  await wall.init();

  // Debug/stress: expose the wall so the headless test (and you, via ?debug)
  // can inspect GPU texture count etc.
  if (typeof window !== "undefined" && /[?&](seed|debug)=/.test(window.location.search)) {
    window.__wall = wall;
  }

  const list = initListView(openProfile);
  initViewToggle();
  initFilters();
  initSearch();
  initGetFeatured();

  const emptyState = document.getElementById("emptyState");

  const apply = (filtered) => {
    wall.setActiveStudents(filtered);
    list.render(filtered);
    if (emptyState) {
      // While the first request is in flight the wall is simply blank.
      const showEmpty = store.status !== "loading" && filtered.length === 0;
      emptyState.textContent = EMPTY_MESSAGES[store.status] || EMPTY_MESSAGES.default;
      emptyState.classList.toggle("active", showEmpty);
    }
  };

  store.subscribe(apply);
  apply(store.getFiltered());
};

start();
