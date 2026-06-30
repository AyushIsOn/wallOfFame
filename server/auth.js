// Minimal admin auth: a single shared password (ADMIN_PASSWORD) exchanged for
// an HMAC-signed, expiring bearer token. No external deps.

import crypto from "node:crypto";

const SECRET = process.env.TOKEN_SECRET || "dev-insecure-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

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

export const login = (password) => {
  if (typeof password !== "string" || password !== ADMIN_PASSWORD) return null;
  return sign({ role: "admin", exp: Date.now() + TTL_MS });
};

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!verify(token)) return res.status(401).json({ error: "Unauthorized" });
  next();
};
