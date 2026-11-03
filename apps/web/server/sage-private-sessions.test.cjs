"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createSagePrivateSessions } = require("./sage-private-sessions.cjs");

const usersJson = JSON.stringify([
  { id: "ada", accessKey: "ada-access-key-000000000000000000000000" },
  { id: "noether", accessKey: "noether-access-key-00000000000000000" },
]);
const create = (now = Date.now) => createSagePrivateSessions({ usersJson,
  secret: "session-secret-000000000000000000000000", origin: "https://math.example.test", now,
  limits: { maxConcurrent: 1, maxRequestsPerMinute: 2 } });
const request = (cookie, origin = "https://math.example.test") => ({ headers: { cookie, origin } });

test("hosted Sage sessions authenticate, expire, and revoke HTTP-only cookies", () => {
  let time = 1000;
  const sessions = create(() => time);
  assert.equal(sessions.login("wrong-key", "ip").code, "invalid_credentials");
  const login = sessions.login("ada-access-key-000000000000000000000000", "ip");
  assert.equal(login.userId, "ada");
  assert.match(login.cookie, /HttpOnly; SameSite=Strict/);
  assert.match(login.cookie, /Secure/);
  const cookie = login.cookie.split(";")[0];
  const session = sessions.readSession(request(cookie));
  assert.equal(session.userId, "ada");
  assert.equal(sessions.readSession(request(`${cookie}tampered`)), null);
  assert.equal(sessions.originAllowed(request(cookie, "https://other.example.test")), false);
  assert.equal(sessions.originAllowed(request(cookie)), true);
  assert.match(sessions.logout(session), /Max-Age=0/);
  assert.equal(sessions.readSession(request(cookie)), null);
  const second = sessions.login("ada-access-key-000000000000000000000000", "ip");
  time += 8 * 60 * 60 * 1000;
  assert.equal(sessions.readSession(request(second.cookie.split(";")[0])), null);
});

test("per-user quotas and cancellation ownership are independent", () => {
  let time = 1000;
  const sessions = create(() => time);
  const a = sessions.acquire("ada", "job-a");
  assert.equal(typeof a.release, "function");
  assert.equal(sessions.acquire("ada", "job-b").code, "user_concurrency_limited");
  assert.equal(sessions.ownsJob("ada", "job-a"), true);
  assert.equal(sessions.ownsJob("noether", "job-a"), false);
  const b = sessions.acquire("noether", "job-b");
  assert.equal(typeof b.release, "function");
  a.release();
  const a2 = sessions.acquire("ada", "job-c");
  assert.equal(typeof a2.release, "function");
  a2.release();
  assert.equal(sessions.acquire("ada", "job-d").code, "user_rate_limited");
  b.release();
  const b2 = sessions.acquire("noether", "job-e");
  assert.equal(typeof b2.release, "function");
  b2.release();
  time += 60001;
  assert.equal(typeof sessions.acquire("ada", "job-f").release, "function");
});

test("hosted configuration rejects insecure origins and weak credentials", () => {
  assert.throws(() => createSagePrivateSessions({ usersJson, secret: "short", origin: "https://math.example.test" }), /SECRET/);
  assert.throws(() => createSagePrivateSessions({ usersJson, secret: "session-secret-000000000000000000000000",
    origin: "http://math.example.test" }), /ORIGIN/);
});
