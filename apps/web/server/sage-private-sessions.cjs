"use strict";

const crypto = require("node:crypto");

const COOKIE = "math3d_sage_session";
const SESSION_MS = 8 * 60 * 60 * 1000;
const LIMITS = Object.freeze({ maxConcurrent: 1, maxRequestsPerMinute: 10 });

function createSagePrivateSessions({ usersJson, secret, origin, limits = LIMITS, now = Date.now } = {}) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("MATH3D_SAGE_WEB_SESSION_SECRET must contain at least 32 characters.");
  if (typeof origin !== "string") throw new Error("MATH3D_SAGE_WEB_ORIGIN is required.");
  const allowedOrigin = new URL(origin);
  if (allowedOrigin.origin !== origin || !["https:", "http:"].includes(allowedOrigin.protocol) ||
      (allowedOrigin.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(allowedOrigin.hostname)))
    throw new Error("MATH3D_SAGE_WEB_ORIGIN must be an exact HTTPS origin, or local loopback HTTP origin.");
  const users = JSON.parse(usersJson || "[]");
  if (!Array.isArray(users) || users.length === 0 || users.some((entry) =>
    !entry || typeof entry.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) ||
    typeof entry.accessKey !== "string" || entry.accessKey.length < 32) ||
    new Set(users.map((entry) => entry.id)).size !== users.length ||
    new Set(users.map((entry) => entry.accessKey)).size !== users.length)
    throw new Error("MATH3D_SAGE_WEB_USERS_JSON must define distinct user IDs and access keys of at least 32 characters.");
  if (!Number.isSafeInteger(limits.maxConcurrent) || limits.maxConcurrent < 1 ||
      !Number.isSafeInteger(limits.maxRequestsPerMinute) || limits.maxRequestsPerMinute < 1)
    throw new Error("Invalid private Sage per-user quotas.");
  const key = Buffer.from(secret, "utf8");
  const usage = new Map();
  const jobs = new Map();
  const revoked = new Map();
  const loginAttempts = new Map();
  const sign = (value) => crypto.createHmac("sha256", key).update(value).digest("base64url");
  const equal = (left, right) => {
    const a = Buffer.from(String(left || ""));
    const b = Buffer.from(String(right || ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/api/sage-private; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${allowedOrigin.protocol === "https:" ? "; Secure" : ""}`;
  const parseCookie = (req) => String(req.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const readSession = (req) => {
    const value = parseCookie(req);
    if (!value || value.length > 2048) return null;
    const split = value.lastIndexOf(".");
    if (split < 1 || !equal(value.slice(split + 1), sign(value.slice(0, split)))) return null;
    try {
      const session = JSON.parse(Buffer.from(value.slice(0, split), "base64url").toString("utf8"));
      if (!users.some((entry) => entry.id === session.userId) ||
          !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now() ||
          typeof session.nonce !== "string" || revoked.has(session.nonce)) return null;
      return session;
    } catch { return null; }
  };
  const originAllowed = (req) => {
    const requestOrigin = req.headers.origin;
    if (requestOrigin && requestOrigin !== allowedOrigin.origin) return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    return true;
  };
  const login = (accessKey, address) => {
    const time = now();
    const attempts = loginAttempts.get(address) || [];
    while (attempts.length && attempts[0] <= time - 60000) attempts.shift();
    if (attempts.length >= 10) return { code: "login_rate_limited", status: 429 };
    attempts.push(time);
    loginAttempts.set(address, attempts);
    const user = users.find((entry) => equal(accessKey, entry.accessKey));
    if (!user) return { code: "invalid_credentials", status: 401 };
    const session = { userId: user.id, expiresAt: time + SESSION_MS, nonce: crypto.randomBytes(16).toString("hex") };
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    return { userId: user.id, expiresAt: session.expiresAt,
      cookie: cookie(`${payload}.${sign(payload)}`, Math.floor(SESSION_MS / 1000)) };
  };
  const logout = (session) => {
    if (session) revoked.set(session.nonce, session.expiresAt);
    for (const [nonce, expiry] of revoked) if (expiry <= now()) revoked.delete(nonce);
    return cookie("", 0);
  };
  const acquire = (userId, jobId) => {
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(jobId || "")) return { code: "invalid_input", status: 400 };
    if (jobs.has(jobId)) return { code: "job_conflict", status: 409 };
    const state = usage.get(userId) || { recent: [], active: 0 };
    const time = now();
    while (state.recent.length && state.recent[0] <= time - 60000) state.recent.shift();
    if (state.recent.length >= limits.maxRequestsPerMinute)
      return { code: "user_rate_limited", status: 429, retryAfterMs: 60000 - (time - state.recent[0]) };
    if (state.active >= limits.maxConcurrent)
      return { code: "user_concurrency_limited", status: 429, retryAfterMs: 1000 };
    state.recent.push(time);
    state.active++;
    usage.set(userId, state);
    jobs.set(jobId, userId);
    return { release: () => { if (jobs.get(jobId) === userId) { jobs.delete(jobId); state.active--; } } };
  };
  return { login, logout, readSession, originAllowed, acquire,
    ownsJob: (userId, jobId) => jobs.get(jobId) === userId,
    status: (session) => ({ authenticated: true, userId: session.userId,
      expiresAt: session.expiresAt, limits }) };
}

module.exports = { createSagePrivateSessions, LIMITS };
