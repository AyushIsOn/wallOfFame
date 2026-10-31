// Minimal admin auth: a single shared password (ADMIN_PASSWORD) exchanged for
// an HMAC-signed, expiring bearer token. No external deps.

import crypto from "node:crypto";

// Production = a real database is configured (Render) or NODE_ENV says so.
// There, the insecure dev defaults are refused instead of silently used.
const IS_PROD = !!process.env.DATABASE_URL || process.env.NODE_ENV === "production";

const SECRET =
  process.env.TOKEN_SECRET ||
  (IS_PROD ? crypto.randomBytes(32).toString("hex") : "dev-insecure-secret-change-me");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PROD ? "" : "admin");
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

if (IS_PROD && !process.env.ADMIN_PASSWORD) {
  console.error("[auth] ADMIN_PASSWORD is not set: admin login is DISABLED until you set it.");
}
if (IS_PROD && !process.env.TOKEN_SECRET) {
  console.warn("[auth] TOKEN_SECRET is not set: using a random per-process secret (admins are logged out on restart).");
}

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
};

const verify = (token) => {
  try {
    if (!token || !token.includes(".")) return null;
    const [body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

// Constant-time comparison (hash both sides so lengths always match).
const passwordMatches = (password) => {
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
};

export const login = (password) => {
  if (!ADMIN_PASSWORD || typeof password !== "string" || !passwordMatches(password)) return null;
  return sign({ role: "admin", exp: Date.now() + TTL_MS });
};

// In-memory brute-force guard for the login route: at most MAX_FAILS failed
// attempts per client IP per WINDOW_MS. Good enough for a single instance.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const failures = new Map(); // ip -> { count, resetAt }

export const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  for (const [ip, f] of failures) if (f.resetAt <= now) failures.delete(ip);
  const entry = failures.get(req.ip);
  if (entry && entry.count >= MAX_FAILS) {
    res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }
  next();
};

export const recordLoginFailure = (ip) => {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
};

export const clearLoginFailures = (ip) => failures.delete(ip);

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!verify(token)) return res.status(401).json({ error: "Unauthorized" });
  next();
};
