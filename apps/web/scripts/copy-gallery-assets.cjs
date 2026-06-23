"use strict";

const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const srcCapturedDir = path.join(repoRoot, "gallery-images", "captured");
const outCapturedDir = path.join(appRoot, "dist", "gallery-images", "captured");
const skipLocalGalleryCopy =
  String(process.env.MATH3D_SKIP_LOCAL_GALLERY_ASSET_COPY ?? "").trim() === "1" ||
  String(process.env.VITE_MATH3D_ASSET_BASE_URL ?? "").trim().length > 0;

if (skipLocalGalleryCopy) {
  console.log("[web] skipped local gallery asset copy; external asset base is enabled");
  process.exit(0);
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

if (!fs.existsSync(srcCapturedDir)) {
  console.warn(`[web] gallery asset source not found: ${srcCapturedDir}`);
  process.exit(0);
}

copyRecursive(srcCapturedDir, outCapturedDir);
console.log(`[web] copied gallery assets to ${outCapturedDir}`);
