// Load ./.env for local development (Node 20.12+ built-in, no dependency).
// Must be the FIRST import in server/index.js so other modules see the values
// when they read process.env at import time. Real environment variables (e.g.
// set on Render) always win over the file.

import { existsSync } from "node:fs";

if (existsSync(".env")) {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env");
  } else {
    console.warn(`[env] .env found but Node ${process.version} can't load it; use Node 20.12 or newer.`);
  }
}
