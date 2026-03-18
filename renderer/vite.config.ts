import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",        // 👈 IMPORTANT for Electron / file://
  plugins: [react()],
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
