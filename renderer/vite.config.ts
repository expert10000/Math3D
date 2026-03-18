import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const proxyTarget = process.env.MATH3D_WEB_WORKER_PROXY_TARGET || "http://127.0.0.1:8787";
const proxyEnabledRaw = String(process.env.MATH3D_WEB_WORKER_PROXY_ENABLED ?? "1").toLowerCase();
const proxyEnabled = !["0", "false", "no", "off"].includes(proxyEnabledRaw);
const workerProxy = proxyEnabled
  ? {
      "/api/worker": {
        target: proxyTarget,
        changeOrigin: true,
      },
    }
  : undefined;

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",        // 👈 IMPORTANT for Electron / file://
  plugins: [react()],
  server: {
    proxy: workerProxy,
  },
  preview: {
    proxy: workerProxy,
  },
  resolve: {
    alias: {
      "@math3d/core": path.resolve(rootDir, "../packages/core/src"),
      "@math3d/renderer": path.resolve(rootDir, "../packages/renderer/src"),
      "@math3d/ui": path.resolve(rootDir, "../packages/ui/src"),
      "@math3d/workbook": path.resolve(rootDir, "../packages/workbook/src"),
      three: path.resolve(rootDir, "node_modules/three"),
    },
  },
});
