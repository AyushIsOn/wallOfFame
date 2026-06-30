// List view: a text rendering of the (filtered) students. Clicking a row opens
// that student's profile. Uses real department + tags from the data.

import { store } from "../store.js";

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);

const rowHtml = (s) => `
  <li class="student-list-item-wrapper">
    <a href="#" class="student-link" data-id="${s.id}">
      <div class="student-info">
        <h3 class="student-title">${escapeHtml(s.name)}</h3>
      </div>
      <div class="student-meta-info">
        <div class="accomplishment-tags">
          ${s.tags
            .slice(0, 3)
            .map((t) => `<span class="accomplishment-pill">${escapeHtml(t)}</span>`)
            .join("")}
        </div>
      </div>
      <div class="student-branch">
        <p class="student-organization">${escapeHtml(s.department)}</p>
      </div>
    </a>
  </li>`;

export const initListView = (onSelect) => {
  const listContent = document.getElementById("list-content");

  const render = (students) => {
    if (!listContent) return;
    listContent.innerHTML = students.length
      ? students.map(rowHtml).join("")
      : `<li class="list-empty">No students match these filters.</li>`;
  };

  listContent?.addEventListener("click", (e) => {
    const link = e.target.closest(".student-link");
    if (!link) return;
    e.preventDefault();
    const student = store.byId(link.dataset.id);
    if (student) onSelect(student);
  });

  return { render };
};
