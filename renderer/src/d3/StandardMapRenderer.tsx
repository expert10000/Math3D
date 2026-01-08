// src/d3/StandardMapRenderer.ts
import type { PlanePlotHandle } from "../components/PlanePlot";
import { C } from "../math/complex";

export type MapId = "square" | "cayley" | "stripToDisk";

type ScreenPoint = [number, number];

export function renderStandardMap(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  id: MapId,
  samples = 400
) {
  console.log("[StandardMapRenderer] render", { id, samples });

  // reset and draw grids
  zPlot.clear();
  wPlot.clear();
  zPlot.drawGrid(0.5);
  wPlot.drawGrid(0.5);

  const ptsZ: ScreenPoint[] = [];
  const ptsW: ScreenPoint[] = [];

  const clamp = (x: number, R = 3) =>
    Math.max(-R, Math.min(R, x));

  switch (id) {
    /* ------------------------------------------------------
     * 1) Unit circle → unit circle under w = z²  (demo)
     * ---------------------------------------------------- */
    case "square": {
      const TWO_PI = 2 * Math.PI;
      for (let k = 0; k <= samples; k++) {
        const t = (TWO_PI * k) / samples;
        const x = Math.cos(t);
        const y = Math.sin(t);

        const z = C(x, y); // |z| = 1
        const w = {
          re: x * x - y * y,
          im: 2 * x * y,
        }; // z², still |w| = 1

        ptsZ.push([zPlot.x(z.re), zPlot.y(z.im)]);
        ptsW.push([wPlot.x(w.re), wPlot.y(w.im)]);
      }
      break;
    }

    /* ------------------------------------------------------
     * 2) Cayley map (boundary circle → vertical line)
     *    w = (1 + z) / (1 - z)
     * ---------------------------------------------------- */
    case "cayley": {
      const TWO_PI = 2 * Math.PI;
      for (let k = 0; k <= samples; k++) {
        const t = (TWO_PI * k) / samples;
        const x = Math.cos(t);
        const y = Math.sin(t);

        const z = C(x, y);

        // (1 + z) / (1 - z) but done manually
        const num = C(1 + z.re, z.im);
        const den = C(1 - z.re, -z.im);
        const denomSq = den.re * den.re + den.im * den.im || 1e-9;

        const w = {
          re: (num.re * den.re + num.im * den.im) / denomSq,
          im: (num.im * den.re - num.re * den.im) / denomSq,
        };

        ptsZ.push([zPlot.x(z.re), zPlot.y(z.im)]);
        // clamp so it stays in the [-3,3] window
        ptsW.push([
          wPlot.x(clamp(w.re)),
          wPlot.y(clamp(w.im)),
        ]);
      }
      break;
    }

    /* ------------------------------------------------------
     * 3) Strip |Im z| < 1 → unit disk
     *    ϕ(z) = (e^{π z} - 1)/(e^{π z} + 1)
     *    We'll draw the central horizontal line y = 0.
     * ---------------------------------------------------- */
    case "stripToDisk": {
      const XMIN = -2;
      const XMAX = 2;
      const y0 = 0;

      for (let i = 0; i <= samples; i++) {
        const x = XMIN + ((XMAX - XMIN) * i) / samples;
        const z = C(x, y0);

        // e^{π z} = e^{π x} (cos πy + i sin πy)
        const exp = Math.exp(Math.PI * x);
        const cos = Math.cos(Math.PI * y0);
        const sin = Math.sin(Math.PI * y0);

        const eRe = exp * cos;
        const eIm = exp * sin;

        const num = C(eRe - 1, eIm);
        const den = C(eRe + 1, eIm);
        const denomSq = den.re * den.re + den.im * den.im || 1e-9;

        const w = {
          re: (num.re * den.re + num.im * den.im) / denomSq,
          im: (num.im * den.re - num.re * den.im) / denomSq,
        };

        ptsZ.push([zPlot.x(z.re), zPlot.y(z.im)]);
        ptsW.push([wPlot.x(w.re), wPlot.y(w.im)]);
      }
      break;
    }
  }

  console.log(
    "[StandardMapRenderer] points",
    id,
    "Z:",
    ptsZ.length,
    "W:",
    ptsW.length
  );

  if (ptsZ.length) zPlot.drawCurve(ptsZ, "#333");
  if (ptsW.length) wPlot.drawCurve(ptsW, "#0a66c2");
}
