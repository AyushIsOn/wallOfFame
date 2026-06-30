// Wall <-> list view toggle (the floating pill control).

export const initViewToggle = () => {
  const buttons = document.querySelectorAll(".toggle-option-container");
  const listWrapper = document.querySelector(".list-view-wrapper");
  const gallery = document.querySelector("#gallery");
  let current = "wall";

  const switchView = (view) => {
    if (current === view || !listWrapper || !gallery) return;
    current = view;
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.view === view));

    if (view === "list") {
      listWrapper.style.display = "flex";
      requestAnimationFrame(() => {
        listWrapper.classList.add("is-open");
        listWrapper.classList.remove("hidden");
      });
      gallery.style.display = "none";
    } else {
      listWrapper.classList.remove("is-open");
      listWrapper.classList.add("hidden");
      gallery.style.display = "block";
      setTimeout(() => {
        if (current === "wall") listWrapper.style.display = "none";
      }, 300);
    }
  };

  buttons.forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  return { switchView, getView: () => current };
};
