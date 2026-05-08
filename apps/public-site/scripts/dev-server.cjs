"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootArg = process.argv[2] || "src";
const portArg = Number(process.argv[3] || 4310);
const host = "127.0.0.1";
const rootDir = path.resolve(__dirname, "..", rootArg);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function resolvePath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname.split("?")[0]);
  const normalized = decoded === "/" ? "/index.html" : decoded;
  const fullPath = path.join(rootDir, normalized);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = contentTypes[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  stream.pipe(res);
  stream.on("error", () => {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  });
}

const server = http.createServer((req, res) => {
  const target = resolvePath(req.url || "/");
  if (!target) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad Request");
    return;
  }

  let finalPath = target;
  try {
    const stat = fs.existsSync(finalPath) ? fs.statSync(finalPath) : null;
    if (stat && stat.isDirectory()) {
      finalPath = path.join(finalPath, "index.html");
    }
    if (!fs.existsSync(finalPath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    serveFile(finalPath, res);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(portArg, host, () => {
  console.log(`[public-site] serving ${rootDir} at http://${host}:${portArg}`);
});
