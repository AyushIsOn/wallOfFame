// Filters panel. Department + year pills are generated from the live data
// (so they can never drift from what actually exists); categories use the
// fixed vocabulary from config. All clicks flow through the store.

import { store } from "../store.js";

const pill = (type, value, text, active = false) =>
  `<button class="filter-pill${active ? " active" : ""}" data-type="${type}" data-filter="${value}">${text}</button>`;

const renderPills = (container, type, values) => {
  if (!container) return;
  container.innerHTML =
    pill(type, "all", "ALL", true) +
    values.map((v) => pill(type, v, String(v).toUpperCase())).join("");
};

export const initFilters = () => {
  const toggleBtn = document.getElementById("filterToggle");
  const panel = document.querySelector(".filters-container");
  if (!panel || !toggleBtn) return;

  renderPills(panel.querySelector('[data-type="category"]'), "category", store.options.categories);
  renderPills(panel.querySelector('[data-type="department"]'), "department", store.options.departments);
  renderPills(panel.querySelector('[data-type="year"]'), "year", store.options.years);

  // Stop drags starting on the panel from panning the wall.
  panel.addEventListener("mousedown", (e) => e.stopPropagation());

  panel.addEventListener("click", (e) => {
    const target = e.target.closest(".filter-pill");
    if (!target) return;
    const { type, filter } = target.dataset;
    panel
      .querySelectorAll(`.filter-pill[data-type="${type}"]`)
      .forEach((p) => p.classList.remove("active"));
    target.classList.add("active");
    store.setFilter(type, filter);
    target.style.transform = "scale(0.95)";
    setTimeout(() => (target.style.transform = ""), 150);
  });

  const onEscape = (e) => {
    if (e.key === "Escape") closePanel();
  };
  const openPanel = () => {
    panel.classList.add("active");
    toggleBtn.classList.add("active");
    document.addEventListener("keydown", onEscape);
  };
  const closePanel = () => {
    panel.classList.remove("active");
    toggleBtn.classList.remove("active");
    document.removeEventListener("keydown", onEscape);
  };

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.contains("active") ? closePanel() : openPanel();
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) closePanel();
  });

  // Reflect "has active filters" on the toggle button.
  store.subscribe(() => {
    const s = store.getState();
    const active =
      ["category", "department", "year"].some((k) => s[k] !== "all") || !!s.search;
    toggleBtn.classList.toggle("has-filters", active);
  });
};
