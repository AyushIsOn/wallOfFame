// Entry point: wires the data store to the wall, list view, filters, search
// and profile overlay. The store is the single source of truth — every view
// re-renders from store.subscribe(), so adding a real data backend later means
// changing only the store.

import { store } from "./store.js";
import { Wall } from "./gl/wall.js";
import { initViewToggle } from "./ui/viewToggle.js";
import { initFilters } from "./ui/filters.js";
import { initSearch } from "./ui/search.js";
import { initListView } from "./ui/listView.js";
import { initProfileOverlay } from "./ui/profileOverlay.js";

const start = async () => {
  const container = document.getElementById("gallery");
  if (!container) return;

  const profile = initProfileOverlay();
  const openProfile = (student) => profile.open(student, store.getFiltered());

  const wall = new Wall(container, openProfile);
  await wall.init(store.students);

  const list = initListView(openProfile);
  initViewToggle();
  initFilters();
  initSearch();

  const emptyState = document.getElementById("emptyState");

  const apply = (filtered) => {
    wall.setActiveStudents(filtered);
    list.render(filtered);
    if (emptyState) emptyState.classList.toggle("active", filtered.length === 0);
  };

  apply(store.getFiltered());
  store.subscribe(apply);
};

start();
