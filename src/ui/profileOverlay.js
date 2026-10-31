// Profile overlay. Opened from the wall or list; "next" steps through whatever
// list it was opened with (i.e. the current filtered set).

import { store } from "../store.js";
import { initials } from "../gl/card.js";

// Render the name title-cased, one word per line, using text nodes so a name
// coming from an imported sheet can never inject markup.
const setStackedName = (el, name) => {
  const words = String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase());
  el.replaceChildren();
  words.forEach((w, i) => {
    if (i) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(w));
  });
};

// Only allow http(s)/mailto links in hrefs (blocks javascript: and data: URLs).
const safeUrl = (url) => {
  const raw = String(url || "").trim();
  return /^(https?:|mailto:)/i.test(raw) ? raw : "";
};

// "INTERNSHIP at GOOGLE", or just whichever half exists.
const roleLine = (s) => {
  const type = s.type || "";
  const tag = s.tags[0] || "";
  if (type && tag) return `${type} at ${tag}`;
  return type || tag;
};

export const initProfileOverlay = () => {
  const overlay = document.getElementById("profileOverlay");
  if (!overlay) return { open: () => {} };

  const backdrop = overlay.querySelector(".profile-backdrop");
  const closeBtn = overlay.querySelector(".profile-close-btn");
  const nextBtn = overlay.querySelector(".profile-next-btn");
  const photo = document.getElementById("profilePhoto");
  const photoWrap = overlay.querySelector(".profile-photo-wrap");
  const socialsBlock = overlay.querySelector(".profile-socials-block");

  let list = [];
  let index = -1;
  let returnFocus = null;

  overlay.setAttribute("aria-hidden", "true");

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "";
  };

  // Format a purely-numeric stipend as an amount (₹4,00,000); leave anything
  // else (e.g. "Unpaid", already-formatted strings) untouched.
  const formatStipend = (v) => {
    const raw = String(v ?? "").trim();
    return /^\d+$/.test(raw) ? `₹${Number(raw).toLocaleString("en-IN")}` : raw;
  };

  // No photo (or it fails to load): show the initials instead of a broken image.
  const showPhoto = (s) => {
    if (!photo) return;
    const noPhoto = () => {
      photo.hidden = true;
      photoWrap?.classList.add("no-photo");
    };
    photoWrap?.setAttribute("data-initials", initials(s.name));
    photoWrap?.classList.remove("no-photo");
    photo.alt = s.name;
    photo.onerror = noPhoto;
    if (s.image) {
      photo.hidden = false;
      photo.src = s.image;
    } else {
      photo.removeAttribute("src");
      noPhoto();
    }
  };

  // A social link is shown only when the student has a real URL for it.
  const setLink = (id, url) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const href = safeUrl(url);
    el.hidden = !href;
    if (href) el.href = href;
    else el.removeAttribute("href");
    return !!href;
  };

  const fill = (s) => {
    showPhoto(s);
    const name = document.getElementById("profileName");
    if (name) setStackedName(name, s.name);

    setText("profileType", roleLine(s));
    setText("profileBio", s.bio);
    setText("profileRegNo", s.regNo);
    setText("profileDepartment", s.department);
    setText("profileDurationType", s.type);
    setText("profileDuration", s.duration);
    setText("profileStipend", formatStipend(s.stipend));

    const hasLinkedin = setLink("profileLinkedin", s.socials.linkedin);
    const hasWebsite = setLink("profileWebsite", s.socials.website);
    if (socialsBlock) socialsBlock.hidden = !hasLinkedin && !hasWebsite;

    const cert = document.getElementById("profileCertificate");
    if (cert) {
      const certUrl = safeUrl(s.certificate);
      const has = !!certUrl;
      cert.classList.toggle("is-disabled", !has);
      if (has) cert.href = certUrl;
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
    returnFocus = document.activeElement;
    overlay.classList.add("active");
    overlay.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEscape);
    closeBtn?.focus({ preventScroll: true });
  };

  const close = () => {
    overlay.classList.add("closing");
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onEscape);
    setTimeout(() => overlay.classList.remove("closing"), 350);
    // Return keyboard focus to where it was (e.g. the list row).
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus?.({ preventScroll: true });
    returnFocus = null;
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
