// Profile overlay. Opened from the wall or list; "next" steps through whatever
// list it was opened with (i.e. the current filtered set).

import { store } from "../store.js";

const titleCase = (name) =>
  name
    .split(" ")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join("<br>");

export const initProfileOverlay = () => {
  const overlay = document.getElementById("profileOverlay");
  if (!overlay) return { open: () => {} };

  const backdrop = overlay.querySelector(".profile-backdrop");
  const closeBtn = overlay.querySelector(".profile-close-btn");
  const nextBtn = overlay.querySelector(".profile-next-btn");

  let list = [];
  let index = -1;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
  };

  const fill = (s) => {
    const photo = document.getElementById("profilePhoto");
    if (photo) {
      photo.src = s.image;
      photo.alt = s.name;
    }
    const name = document.getElementById("profileName");
    if (name) name.innerHTML = titleCase(s.name);

    setText("profileType", `${s.type}${s.tags[0] ? ` at ${s.tags[0]}` : ""}`);
    setText("profileBio", s.bio);
    setText("profileRegNo", s.regNo);
    setText("profileDepartment", s.department);
    setText("profileDurationType", s.type);
    setText("profileDuration", s.duration);
    setText("profileStipend", s.stipend);

    const linkedin = document.getElementById("profileLinkedin");
    if (linkedin) linkedin.href = s.socials.linkedin || "#";
    const website = document.getElementById("profileWebsite");
    if (website) website.href = s.socials.website || "#";

    const cert = document.getElementById("profileCertificate");
    if (cert) {
      const has = !!s.certificate;
      cert.classList.toggle("is-disabled", !has);
      if (has) cert.href = s.certificate;
      else cert.removeAttribute("href");
    }
  };

  const open = (student, currentList) => {
    list = currentList && currentList.length ? currentList : store.students;
    index = list.findIndex((s) => s.id === student.id);
    if (index < 0) {
      list = store.students;
      index = list.findIndex((s) => s.id === student.id);
    }
    fill(student);
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEscape);
  };

  const close = () => {
    overlay.classList.add("closing");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onEscape);
    setTimeout(() => overlay.classList.remove("closing"), 350);
  };

  const next = () => {
    if (!list.length) return;
    index = (index + 1) % list.length;
    fill(list[index]);
  };

  const onEscape = (e) => {
    if (e.key === "Escape") close();
  };

  backdrop?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  nextBtn?.addEventListener("click", next);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return { open };
};
