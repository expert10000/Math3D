import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rendererSources = [
  "../components/CurveViewer.tsx",
  "../components/GaussMapPanel.tsx",
  "../components/ParamSurfaceViewer.tsx",
  "../components/RiemannSpherePlot.tsx",
  "../components/SurfaceViewer.tsx",
  "../components/VolumeViewer.tsx",
  "../screens/TopologyScreen.tsx",
] as const;

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Three.js renderer lifecycle invariants", () => {
  for (const relativePath of rendererSources) {
    it(`${relativePath} registers and centrally disposes every WebGL renderer`, () => {
      const source = readSource(relativePath);
      expect(source).toMatch(/registerWebGLRenderer\s*\(\s*new THREE\.WebGLRenderer/);
      expect(source).toContain("disposeWebGLRenderer(renderer)");
    });

    it(`${relativePath} cancels persistent animation frames`, () => {
      const source = readSource(relativePath);
      if (!source.includes("requestAnimationFrame")) return;
      expect(source).toContain("cancelAnimationFrame");
    });
  }
});
