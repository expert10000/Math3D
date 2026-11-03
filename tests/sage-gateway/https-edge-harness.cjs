"use strict";

const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const dist = path.join(root, "apps/web/dist");
const port = Number(process.env.MATH3D_SAGE_EDGE_TEST_PORT || 8443);
const proxyPort = Number(process.env.MATH3D_SAGE_EDGE_PROXY_TEST_PORT || 8797);
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Build the production web bundle before the HTTPS edge gate.");
const tls = { key: fs.readFileSync(process.env.MATH3D_SAGE_EDGE_TEST_KEY),
  cert: fs.readFileSync(process.env.MATH3D_SAGE_EDGE_TEST_CERT) };
let proxy;
let proxyReady = false;

function launchProxy() {
  proxyReady = false;
  proxy = spawn(process.execPath, [path.join(root, "apps/web/server/worker-proxy.cjs")], {
    cwd: root,
    env: { ...process.env, MATH3D_WEB_WORKER_PROXY_HOST: "127.0.0.1",
      MATH3D_WEB_WORKER_PROXY_PORT: String(proxyPort), MATH3D_SAGE_WEB_AUTH_MODE: "hosted",
      MATH3D_SAGE_WEB_ORIGIN: `https://127.0.0.1:${port}` },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  proxy.stdout.on("data", () => undefined);
  proxy.stderr.on("data", (chunk) => process.stderr.write(chunk));
  proxy.on("exit", () => { proxyReady = false; });
  const check = () => new Promise((resolve) => {
    http.get(`http://127.0.0.1:${proxyPort}/api/sage-private/session`, (res) => {
      res.resume(); resolve(res.statusCode === 200);
    }).on("error", () => resolve(false));
  });
  return (async () => {
    for (let i = 0; i < 100; i++) {
      if (await check()) { proxyReady = true; return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Hosted Sage proxy failed to start.");
  })();
}

function forward(req, res) {
  const upstream = http.request({ hostname: "127.0.0.1", port: proxyPort,
    path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${proxyPort}` } }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => { res.writeHead(502); res.end("Sage web proxy unavailable."); });
  req.pipe(upstream);
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".wasm": "application/wasm" };
function staticFile(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "https://edge.test").pathname); }
  catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(dist, `.${pathname}`);
  if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) { res.writeHead(403); res.end(); return; }
  let target = file;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) target = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": mime[path.extname(target)] || "application/octet-stream",
    "cache-control": "no-store" });
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(target).pipe(res);
}

const server = https.createServer(tls, async (req, res) => {
  const pathname = new URL(req.url, "https://edge.test").pathname;
  if (pathname === "/__test/ready") {
    res.writeHead(proxyReady ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ready: proxyReady, edge: "https", proxy: "loopback" }));
    return;
  }
  if (pathname === "/__test/restart-proxy" && req.method === "POST") {
    if (proxy && proxy.exitCode == null) {
      await new Promise((resolve) => { proxy.once("exit", resolve); proxy.kill(); });
    }
    try { await launchProxy(); res.writeHead(200); res.end("restarted"); }
    catch { res.writeHead(503); res.end("restart failed"); }
    return;
  }
  if (pathname.startsWith("/api/sage-private/")) { forward(req, res); return; }
  staticFile(req, res);
});
launchProxy().then(() => server.listen(port, "127.0.0.1"), (error) => { console.error(error); process.exit(1); });
function shutdown() { proxy?.kill(); server.close(() => process.exit(0)); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
