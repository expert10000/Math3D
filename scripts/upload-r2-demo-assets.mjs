import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const readArg = (name, fallback = "") => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
};
const hasArg = (name) => args.includes(name);

const bucket = readArg("--bucket", process.env.MATH3D_R2_BUCKET ?? "math3d-demo-assets");
const prefixRaw = readArg("--prefix", process.env.MATH3D_R2_PREFIX ?? "math3d-demo/v1");
const prefix = prefixRaw.replace(/^\/+|\/+$/g, "");
const dryRun = hasArg("--dry-run");
const wranglerBin = process.platform === "win32" ? "npx.cmd" : "npx";
const cacheControl = "public, max-age=31536000, immutable";

const roots = [
  {
    source: path.join(repoRoot, "gallery-images", "captured"),
    target: "gallery-images/captured",
  },
  {
    source: path.join(repoRoot, "renderer", "public", "mesh-presets"),
    target: "mesh-presets",
  },
];

const contentTypeByExt = new Map([
  [".bin", "application/octet-stream"],
  [".gltf", "model/gltf+json"],
  [".glb", "model/gltf-binary"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".obj", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
};

const toPosix = (value) => value.split(path.sep).join("/");

let uploaded = 0;
let totalBytes = 0;

for (const root of roots) {
  for (const file of listFiles(root.source)) {
    const relative = toPosix(path.relative(root.source, file));
    const key = [prefix, root.target, relative].filter(Boolean).join("/");
    const objectPath = `${bucket}/${key}`;
    const contentType = contentTypeByExt.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
    const size = fs.statSync(file).size;
    totalBytes += size;

    const commandArgs = [
      "wrangler",
      "r2",
      "object",
      "put",
      objectPath,
      "--file",
      file,
      "--content-type",
      contentType,
      "--cache-control",
      cacheControl,
      "--remote",
    ];

    if (dryRun) {
      console.log(`[dry-run] ${file} -> r2://${objectPath}`);
      uploaded += 1;
      continue;
    }

    const result = spawnSync(wranglerBin, commandArgs, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });
    if (result.status !== 0) {
      throw new Error(`R2 upload failed for ${file}`);
    }
    uploaded += 1;
  }
}

console.log(
  `[r2] ${dryRun ? "planned" : "uploaded"} ${uploaded} files (${(totalBytes / 1024 / 1024).toFixed(2)} MiB) to ${bucket}/${prefix}`
);
