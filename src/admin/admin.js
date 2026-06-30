// Admin app: login, student CRUD, Excel import, image upload, tag generation.
// Talks to the same-origin API with a bearer token kept in localStorage.

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "wof_token";
let token = localStorage.getItem(TOKEN_KEY) || "";
let students = [];
let pendingPhoto = null; // File awaiting upload on save

const api = async (path, { method = "GET", body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !form) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { method, headers, body: form ? body : body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    logout();
    throw new Error("Session expired — sign in again.");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.status === 204 ? null : res.json();
};

const status = (msg) => { $("status").textContent = msg || ""; };

// ---- Auth ----
function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  loadStudents();
}
function logout() {
  token = "";
  localStorage.removeItem(TOKEN_KEY);
  $("app").hidden = true;
  $("login").hidden = false;
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  try {
    const { token: t } = await api("/api/admin/login", { method: "POST", body: { password: $("password").value } });
    token = t;
    localStorage.setItem(TOKEN_KEY, t);
    $("password").value = "";
    showApp();
  } catch (err) {
    $("loginError").textContent = err.message;
  }
});
$("logout").addEventListener("click", logout);

// ---- Table ----
const tagPills = (tags) => (tags || []).slice(0, 3).map((t) => `<span class="tag">${t}</span>`).join("");

function renderRows() {
  const q = $("search").value.trim().toLowerCase();
  const list = q
    ? students.filter((s) => `${s.name} ${s.department} ${s.type} ${(s.tags || []).join(" ")}`.toLowerCase().includes(q))
    : students;
  $("rows").innerHTML = list
    .map(
      (s) => `
    <tr data-id="${s.id}">
      <td><img class="cell-thumb" src="${s.thumbnail || s.image || ""}" alt="" onerror="this.style.visibility='hidden'"/></td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.department || "")}</td>
      <td>${s.year || ""}</td>
      <td>${escapeHtml(s.type || "")}</td>
      <td><div class="cell-tags">${tagPills(s.tags)}</div></td>
      <td><button class="ghost row-del" data-del="${s.id}">Delete</button></td>
    </tr>`
    )
    .join("");
}

async function loadStudents() {
  try {
    students = await api("/api/students");
    renderRows();
    status(`${students.length} students`);
  } catch (err) {
    status(err.message);
  }
}

$("search").addEventListener("input", renderRows);

$("rows").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    e.stopPropagation();
    if (!confirm("Delete this student?")) return;
    await api(`/api/admin/students/${del.dataset.del}`, { method: "DELETE" });
    await loadStudents();
    return;
  }
  const row = e.target.closest("tr[data-id]");
  if (row) openModal(students.find((s) => String(s.id) === row.dataset.id));
});

// ---- Modal ----
const fields = ["name", "department", "year", "type", "regNo", "duration", "stipend", "bio", "linkedin", "website", "certificate"];

function openModal(student) {
  pendingPhoto = null;
  const s = student || {};
  $("modalTitle").textContent = student ? "Edit student" : "Add student";
  $("f_id").value = s.id || "";
  $("f_name").value = s.name || "";
  $("f_department").value = s.department || "";
  $("f_year").value = s.year || "";
  $("f_type").value = s.type || "";
  $("f_regNo").value = s.regNo || "";
  $("f_duration").value = s.duration || "";
  $("f_stipend").value = s.stipend || "";
  $("f_bio").value = s.bio || "";
  $("f_tags").value = (s.tags || []).join(", ");
  $("f_linkedin").value = s.socials?.linkedin && s.socials.linkedin !== "#" ? s.socials.linkedin : "";
  $("f_website").value = s.socials?.website && s.socials.website !== "#" ? s.socials.website : "";
  $("f_certificate").value = s.certificate || "";
  $("photoPreview").src = s.thumbnail || s.image || "";
  $("deleteBtn").style.visibility = student ? "visible" : "hidden";
  $("modal").hidden = false;
}
function closeModal() { $("modal").hidden = true; }
$("addBtn").addEventListener("click", () => openModal(null));
document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));

function formData() {
  return {
    name: $("f_name").value.trim(),
    department: $("f_department").value.trim().toUpperCase(),
    year: $("f_year").value ? Number($("f_year").value) : null,
    type: $("f_type").value.trim().toUpperCase(),
    regNo: $("f_regNo").value.trim(),
    duration: $("f_duration").value.trim(),
    stipend: $("f_stipend").value.trim(),
    bio: $("f_bio").value.trim(),
    tags: $("f_tags").value.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
    socials: { linkedin: $("f_linkedin").value.trim() || "#", website: $("f_website").value.trim() || "#" },
    certificate: $("f_certificate").value.trim(),
  };
}

// Create or update; returns the saved student (with id).
async function persist() {
  const id = $("f_id").value;
  const data = formData();
  if (!data.name) throw new Error("Name is required");
  const saved = id
    ? await api(`/api/admin/students/${id}`, { method: "PUT", body: data })
    : await api("/api/admin/students", { method: "POST", body: data });
  $("f_id").value = saved.id;
  return saved;
}

$("photoFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingPhoto = file;
  $("photoPreview").src = URL.createObjectURL(file);
});

$("genTags").addEventListener("click", async () => {
  try {
    status("Generating tags…");
    const saved = await persist(); // ensure it exists so the server can read the bio
    const { tags } = await api(`/api/admin/students/${saved.id}/tags`, { method: "POST", body: { about: $("f_bio").value } });
    $("f_tags").value = (tags || []).join(", ");
    status("Tags generated");
  } catch (err) {
    status(err.message);
  }
});

$("saveBtn").addEventListener("click", async () => {
  try {
    status("Saving…");
    const saved = await persist();
    if (pendingPhoto) {
      const fd = new FormData();
      fd.append("image", pendingPhoto);
      await api(`/api/admin/students/${saved.id}/image`, { method: "POST", form: true, body: fd });
      pendingPhoto = null;
    }
    closeModal();
    await loadStudents();
    status("Saved");
  } catch (err) {
    status(err.message);
  }
});

$("deleteBtn").addEventListener("click", async () => {
  const id = $("f_id").value;
  if (!id || !confirm("Delete this student?")) return;
  await api(`/api/admin/students/${id}`, { method: "DELETE" });
  closeModal();
  await loadStudents();
});

// ---- Import ----
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    status(`Importing ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    const { imported } = await api("/api/admin/import", { method: "POST", form: true, body: fd });
    await loadStudents();
    status(`Imported ${imported} students`);
  } catch (err) {
    status(err.message);
  } finally {
    e.target.value = "";
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Boot
if (token) showApp();
