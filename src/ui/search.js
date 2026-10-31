// Search: the header SEARCH button reveals an input that filters the wall and
// list by name, department, type or tag (debounced through the store).

import { store } from "../store.js";

export const initSearch = () => {
  const btn = document.getElementById("searchBtn");
  const overlay = document.querySelector(".search-overlay");
  const input = document.getElementById("searchInput");
  if (!btn || !overlay || !input) return;

  const closeBtn = overlay.querySelector(".search-close");
  let debounce;

  const open = () => {
    overlay.classList.add("active");
    setTimeout(() => input.focus(), 50);
  };
  // Closing always clears the query, so a hidden search can't keep filtering.
  const close = () => {
    clearTimeout(debounce);
    input.value = "";
    store.setSearch("");
    overlay.classList.remove("active");
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.classList.contains("active") ? close() : open();
  });
  closeBtn?.addEventListener("click", close);

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => store.setSearch(input.value), 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
};
