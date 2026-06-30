import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // During local dev the API runs separately (node server/index.js on :3000).
    proxy: { "/api": "http://localhost:3000" },
  },
  build: {
    rollupOptions: {
      input: {
        main: r("./index.html"),
        admin: r("./admin.html"),
      },
    },
  },
});
