const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const keyCache = new Map();

function error(status, code, message) {
  return new Response(JSON.stringify({ code, error: message }), { status, headers: JSON_HEADERS });
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token encoding");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function accessAllowed(request, env) {
  const issuer = String(env.MATH3D_CF_ACCESS_ISSUER || "").replace(/\/$/, "");
  const audience = String(env.MATH3D_CF_ACCESS_AUD || "");
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience) return false;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 8192) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 256 ||
        payload.iss !== issuer || !(Array.isArray(payload.aud) ? payload.aud.includes(audience) : payload.aud === audience))
      return false;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= now ||
        (payload.nbf != null && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) ||
        (payload.iat != null && (!Number.isSafeInteger(payload.iat) || payload.iat > now))) return false;
    let keys = keyCache.get(issuer);
    if (!keys || keys.expiresAt <= Date.now()) {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return false;
      const document = await response.json();
      if (!Array.isArray(document.keys)) return false;
      keys = { value: document.keys, expiresAt: Date.now() + 5 * 60 * 1000 };
      keyCache.set(issuer, keys);
    }
    const jwk = keys.value.find((key) => key.kid === header.kid && key.kty === "RSA" &&
      (key.alg == null || key.alg === "RS256"));
    if (!jwk) return false;
    const publicKey = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid && typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 256
      ? payload.sub : false;
  } catch { return false; }
}

function upstreamUrl(value, requestUrl) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || url.hostname === requestUrl.hostname) return null;
    return url;
  } catch { return null; }
}

export async function routeCompute({ request, env }, kind) {
  const incoming = new URL(request.url);
  const prefix = kind === "worker" ? "/api/worker/" : "/api/sage-private/";
  if (!incoming.pathname.startsWith(prefix)) return error(404, "not_found", "Unknown compute route.");
  if (!["GET", "POST"].includes(request.method))
    return error(405, "method_not_allowed", "Unsupported compute method.");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.method === "POST" && request.headers.get("origin") !== incoming.origin))
    return error(403, "origin_denied", "Compute request origin is not allowed.");
  const workerSubject = kind === "worker" ? await accessAllowed(request, env) : null;
  if (kind === "worker" && !workerSubject)
    return error(401, "access_required", "Authorized worker access is required.");

  const backend = upstreamUrl(env.MATH3D_COMPUTE_UPSTREAM_URL, incoming);
  const edgeToken = String(env.MATH3D_COMPUTE_EDGE_TOKEN || "");
  if (!backend || edgeToken.length < 32)
    return error(503, "compute_not_configured", "Hosted compute service is not configured.");
  const length = Number(request.headers.get("content-length"));
  if (request.method === "POST" && Number.isFinite(length) && length > MAX_BODY_BYTES)
    return error(413, "body_too_large", "Compute request is too large.");
  let body;
  if (request.method === "POST") {
    try {
      body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY_BYTES) return error(413, "body_too_large", "Compute request is too large.");
    } catch { return error(400, "invalid_body", "Compute request body could not be read."); }
  }
  const target = new URL(`${incoming.pathname}${incoming.search}`, backend);
  const headers = new Headers({
    "x-math3d-edge-token": edgeToken,
    "accept": "application/json",
    "origin": incoming.origin,
  });
  if (request.method === "POST") headers.set("content-type", "application/json");
  if (kind === "worker") {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(workerSubject));
    headers.set("x-math3d-worker-user", Array.from(new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  if (kind === "sage-private") {
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) headers.set("x-math3d-client-ip", clientIp);
  }
  try {
    const upstream = await fetch(target, { method: request.method, headers, body,
      redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (upstream.status >= 300 && upstream.status < 400)
      return error(502, "unexpected_redirect", "Compute service returned a redirect.");
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json"))
      return error(502, "invalid_upstream_response", "Compute service returned a non-JSON response.");
    const responseHeaders = new Headers(JSON_HEADERS);
    if (kind === "sage-private") {
      const cookie = upstream.headers.get("set-cookie");
      if (cookie) responseHeaders.set("set-cookie", cookie);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch { return error(502, "compute_unavailable", "Hosted compute service is unavailable."); }
}
