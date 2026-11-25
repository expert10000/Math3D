import { test, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { routeCompute } from "./compute-route.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256" };
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const env = {
  MATH3D_CF_ACCESS_ISSUER: "https://math3d.cloudflareaccess.com",
  MATH3D_CF_ACCESS_AUD: "worker-audience",
  MATH3D_COMPUTE_UPSTREAM_URL: "https://compute.example.test/",
  MATH3D_COMPUTE_EDGE_TOKEN: "edge-secret-000000000000000000000000",
};
const token = (overrides = {}) => {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: env.MATH3D_CF_ACCESS_ISSUER,
    aud: env.MATH3D_CF_ACCESS_AUD, sub: "test-user", exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides })).toString("base64url");
  const value = `${header}.${payload}`;
  return `${value}.${sign("RSA-SHA256", Buffer.from(value), privateKey).toString("base64url")}`;
};
const request = (path, options = {}) => new Request(`https://app.math3dlab.com${path}`, options);

test("worker route fails closed without Access and with invalid assertions", async () => {
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; throw new Error("unexpected"); };
  const missing = await routeCompute({ request: request("/api/worker/diagnostics"), env }, "worker");
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get("content-type"), "application/json; charset=utf-8");
  const invalid = await routeCompute({ request: request("/api/worker/diagnostics", {
    headers: { "cf-access-jwt-assertion": token({ aud: "wrong" }) },
  }), env }, "worker");
  assert.equal(invalid.status, 401);
  assert.equal(upstreamCalls, 0);
});

test("verified worker request forwards only the scoped JSON call and edge credential", async () => {
  let forwarded;
  globalThis.fetch = async (target, options) => {
    if (String(target).endsWith("/cdn-cgi/access/certs"))
      return Response.json({ keys: [jwk] });
    forwarded = { target: String(target), options };
    return Response.json({ available: true });
  };
  const response = await routeCompute({ request: request("/api/worker/diagnostics?probe=1", {
    headers: { "cf-access-jwt-assertion": token(), "x-math3d-edge-token": "attacker", cookie: "private=x" },
  }), env }, "worker");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: true });
  assert.equal(forwarded.target, "https://compute.example.test/api/worker/diagnostics?probe=1");
  assert.equal(forwarded.options.headers.get("x-math3d-edge-token"), env.MATH3D_COMPUTE_EDGE_TOKEN);
  assert.equal(forwarded.options.headers.get("cookie"), null);
  assert.equal(forwarded.options.headers.get("cf-access-jwt-assertion"), null);
  assert.match(forwarded.options.headers.get("x-math3d-worker-user"), /^[0-9a-f]{64}$/);
});

test("a tampered Access assertion cannot reach compute", async () => {
  let forwarded = false;
  globalThis.fetch = async (target) => {
    if (String(target).endsWith("/cdn-cgi/access/certs")) return Response.json({ keys: [jwk] });
    forwarded = true;
    return Response.json({ ok: true });
  };
  const signed = token();
  const [header, , signature] = signed.split(".");
  const alteredPayload = Buffer.from(JSON.stringify({ iss: env.MATH3D_CF_ACCESS_ISSUER,
    aud: env.MATH3D_CF_ACCESS_AUD, sub: "another-user",
    exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
  const bad = `${header}.${alteredPayload}.${signature}`;
  const response = await routeCompute({ request: request("/api/worker/diagnostics", {
    headers: { "cf-access-jwt-assertion": bad },
  }), env }, "worker");
  assert.equal(response.status, 401);
  assert.equal(forwarded, false);
});

test("Sage session forwards cookies but denies cross-origin POST and returns typed outages", async () => {
  let forwarded;
  globalThis.fetch = async (target, options) => {
    forwarded = { target: String(target), options };
    return new Response(JSON.stringify({ authenticated: true }), {
      headers: { "content-type": "application/json", "set-cookie": "math3d_sage_session=ok; Secure; HttpOnly" },
    });
  };
  const denied = await routeCompute({ request: request("/api/sage-private/session", {
    method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}",
  }), env }, "sage-private");
  assert.equal(denied.status, 403);
  const response = await routeCompute({ request: request("/api/sage-private/session", {
    method: "POST", headers: { origin: "https://app.math3dlab.com", cookie: "math3d_sage_session=abc",
      "x-math3d-edge-token": "attacker", "content-type": "application/json" }, body: "{}",
  }), env }, "sage-private");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(forwarded.options.headers.get("cookie"), "math3d_sage_session=abc");
  assert.equal(forwarded.options.headers.get("x-math3d-edge-token"), env.MATH3D_COMPUTE_EDGE_TOKEN);
  globalThis.fetch = async () => { throw new Error("backend down"); };
  const outage = await routeCompute({ request: request("/api/sage-private/health"), env }, "sage-private");
  assert.equal(outage.status, 502);
  assert.equal((await outage.json()).code, "compute_unavailable");
});

test("missing upstream configuration and HTML responses are typed failures", async () => {
  const missing = await routeCompute({ request: request("/api/sage-private/health"),
    env: { ...env, MATH3D_COMPUTE_EDGE_TOKEN: "" } }, "sage-private");
  assert.equal(missing.status, 503);
  globalThis.fetch = async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } });
  const html = await routeCompute({ request: request("/api/sage-private/health"), env }, "sage-private");
  assert.equal(html.status, 502);
  assert.equal((await html.json()).code, "invalid_upstream_response");
});
