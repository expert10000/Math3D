import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const proxyTarget = process.env.MATH3D_WEB_WORKER_PROXY_TARGET || "http://127.0.0.1:8787";
const proxyEnabledRaw = String(process.env.MATH3D_WEB_WORKER_PROXY_ENABLED ?? "1").toLowerCase();
const proxyEnabled = !["0", "false", "no", "off"].includes(proxyEnabledRaw);
const publicHosts = String(process.env.MATH3D_PUBLIC_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
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
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const mod = id.replace(/\\/g, "/");

          if (mod.includes("/node_modules/three/examples/")) return "vendor-three-examples";
          if (mod.includes("/node_modules/three/src/renderers/")) return "vendor-three-renderers";
          if (mod.includes("/node_modules/three/")) return "vendor-three-core";
          if (mod.includes("/node_modules/react/") || mod.includes("/node_modules/react-dom/")) {
            return "vendor-react";
          }
          if (mod.includes("/node_modules/d3/")) return "vendor-d3";

          if (mod.includes("/src/components/VolumeViewer.tsx") || mod.includes("/src/scene/volume/")) {
            return "feature-volume";
          }
          if (mod.includes("/src/components/WorkbookPanel.tsx") || mod.includes("/src/workbook/")) {
            return "feature-workbook";
          }
          if (
            mod.includes("/src/components/GeometryViewer.tsx") ||
            mod.includes("/src/components/ConstructionLabPanel.tsx") ||
            mod.includes("/src/components/StereometryAnalyzerPanel.tsx") ||
            mod.includes("/src/geometry/")
          ) {
            return "feature-geometry";
          }
          if (
            mod.includes("/src/components/SurfaceViewer.tsx") ||
            mod.includes("/src/components/ParamSurfaceViewer.tsx") ||
            mod.includes("/src/math/")
          ) {
            return "feature-surfaces";
          }
          if (
            mod.includes("/src/components/") &&
            !mod.includes("/src/components/SurfaceViewer.tsx") &&
            !mod.includes("/src/components/ParamSurfaceViewer.tsx") &&
            !mod.includes("/src/components/VolumeViewer.tsx") &&
            !mod.includes("/src/components/WorkbookPanel.tsx") &&
            !mod.includes("/src/components/GeometryViewer.tsx") &&
            !mod.includes("/src/components/ConstructionLabPanel.tsx") &&
            !mod.includes("/src/components/StereometryAnalyzerPanel.tsx")
          ) {
            return "feature-ui";
          }
          if (mod.includes("/src/services/")) return "feature-services";
          if (mod.includes("/src/mesh/")) return "feature-mesh";
          if (
            mod.includes("/src/d3/") ||
            mod.includes("/src/screens/MobiusScreen.tsx") ||
            mod.includes("/src/screens/ChebyshevScreen.tsx")
          ) {
            return "feature-complex";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    allowedHosts: publicHosts,
    proxy: workerProxy,
  },
  preview: {
    proxy: workerProxy,
  },
  resolve: {
    alias: {
      "@math3d/core": path.resolve(rootDir, "../packages/core/src"),
      "@math3d/renderer-web": path.resolve(rootDir, "../packages/renderer-web/src"),
      "@math3d/ui": path.resolve(rootDir, "../packages/ui/src"),
      "@math3d/workbook": path.resolve(rootDir, "../packages/workbook/src"),
      "@math3d/api-client": path.resolve(rootDir, "../packages/api-client/src"),
      three: path.resolve(rootDir, "node_modules/three"),
    },
  },
});
