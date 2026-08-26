import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cachePaths = [
  join(process.cwd(), "renderer", "node_modules", ".vite"),
  join(process.cwd(), "node_modules", ".vite"),
  join(tmpdir(), "math3d-electron-dev", "C_Math3D", "Cache"),
  join(tmpdir(), "math3d-electron-dev", "C_Math3D", "Code Cache"),
  join(tmpdir(), "math3d-electron-dev", "C_Math3D", "GPUCache"),
];

for (const cachePath of cachePaths) {
  rmSync(cachePath, { recursive: true, force: true });
}

console.log("[dev-cache] cleared Vite and Electron browser caches");
