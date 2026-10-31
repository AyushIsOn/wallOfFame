// "GET FEATURED" header link. Points at the college's submission form when
// VITE_GET_FEATURED_URL is set at build time (Vite inlines import.meta.env.*);
// otherwise it stays a plain label.

export const initGetFeatured = () => {
  const link = document.getElementById("getFeatured");
  const url = String(import.meta.env.VITE_GET_FEATURED_URL || "").trim();
  if (!link || !/^(https?:|mailto:)/i.test(url)) return;
  link.href = url;
  if (!url.startsWith("mailto:")) {
    link.target = "_blank";
    link.rel = "noopener";
  }
};
