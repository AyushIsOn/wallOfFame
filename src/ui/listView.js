// List view: year-grouped, phantom.land-inspired layout.
// Big "All Students" heading + count, then students grouped by year (descending).
// Each group: sticky year label on the left, rows on the right.
// Clicking a row opens that student's profile overlay.

import { store } from "../store.js";

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);

// One row: name (left) + tag pills (center) + department (right)
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
        <p class="student-organization">${escapeHtml(s.department || "")}</p>
      </div>
    </a>
  </li>`;

// Group students by year (descending), with ungrouped ("—") at the end.
const groupByYear = (students) => {
  const groups = new Map();
  for (const s of students) {
    const key = s.year || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  // Sort year keys descending (numeric), push non-numeric to end
  const sorted = [...groups.entries()].sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    if (isNaN(na) && isNaN(nb)) return 0;
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return nb - na;
  });
  return sorted;
};

export const initListView = (onSelect) => {
  const container = document.getElementById("listViewContainer");

  const render = (students) => {
    if (!container) return;

    if (!students.length) {
      container.innerHTML = `
        <div class="project-list-wrapper">
          <div class="project-list-container">
            <div class="header">
              <h2>All Students</h2>
            </div>
            <div class="projects-container">
              <p class="list-empty">No students match these filters.</p>
            </div>
          </div>
        </div>`;
      return;
    }

    const groups = groupByYear(students);

    const groupsHtml = groups
      .map(
        ([year, items]) => `
      <div class="student-group">
        <p>${escapeHtml(String(year))}</p>
        <ul class="student-list-items-wrapper">
          ${items.map(rowHtml).join("")}
        </ul>
      </div>`
      )
      .join("");

    container.innerHTML = `
      <div class="project-list-wrapper">
        <div class="project-list-container">
          <div class="header">
            <h2>All Students</h2>
            <span class="student-count">${students.length} student${students.length !== 1 ? "s" : ""}</span>
          </div>
          <div class="projects-container">
            ${groupsHtml}
          </div>
        </div>
      </div>`;
  };

  // Event delegation for row clicks
  container?.addEventListener("click", (e) => {
    const link = e.target.closest(".student-link");
    if (!link) return;
    e.preventDefault();
    const student = store.byId(link.dataset.id);
    if (student) onSelect(student);
  });

  return { render };
};
