"use strict";

const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const srcDir = path.join(appRoot, "src");
const distDir = path.join(appRoot, "dist");

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    const entries = fs.readdirSync(source);
    for (const entry of entries) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

if (!fs.existsSync(srcDir)) {
  throw new Error(`Source directory not found: ${srcDir}`);
}

fs.rmSync(distDir, { recursive: true, force: true });
copyRecursive(srcDir, distDir);

console.log(`[public-site] build complete: ${distDir}`);
