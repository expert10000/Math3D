/*
// src/d3/MobiusRenderer.ts
import type { PlanePlotHandle } from "../components/PlanePlot";
import { type MobiusParams, mobiusSafe } from "../math/mobius";
import { C } from "../math/complex";

type Point = [number, number];

export function renderMobius(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  p: MobiusParams,
  samples = 400
) {
  // reset both planes
  zPlot.clear();
  wPlot.clear();

  // redraw base grid
  zPlot.drawGrid(0.5);
  wPlot.drawGrid(0.5);

  const lines = 10;
  const R = 3;

  for (let k = 0; k <= lines; k++) {
    const t = -R + (2 * R * k) / lines; // fixed Im z

    const horizZ: Point[] = [];
    const horizW: Point[] = [];

    for (let i = 0; i <= samples; i++) {
      const s = -R + (2 * R * i) / samples; // Re z
      const z = C(s, t);
      const w = mobiusSafe(z, p);

      // IMPORTANT: math coordinates, not pixels
      horizZ.push([z.re, z.im]);
      horizW.push([w.re, w.im]);
    }

    zPlot.drawCurve(horizZ, "#333");
    wPlot.drawCurve(horizW, "#0a66c2");
  }
}
*/

// src/d3/MobiusRenderer.ts
import type { PlanePlotHandle } from "../components/PlanePlot";
import { type MobiusParams, mobiusSafe } from "../math/mobius";
import { C } from "../math/complex";

type Point = [number, number];

export function renderMobius(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  p: MobiusParams,
  samples = 400
) {
  console.log("[MobiusRenderer] render", p);

  // reset both planes
  zPlot.clear();
  wPlot.clear();

  // base grids
  zPlot.drawGrid(0.5);
  wPlot.drawGrid(0.5);

  // ----- circles in Z-plane -----
  // we draw several concentric circles centred at 0 in the Z-plane
  const Rmax = 2.5;       // max radius we draw
  const NUM_CIRCLES = 6;  // how many radii

  for (let k = 1; k <= NUM_CIRCLES; k++) {
    const r = (Rmax * k) / NUM_CIRCLES;

    const circleZ: Point[] = [];
    const circleW: Point[] = [];

    for (let i = 0; i <= samples; i++) {
      const theta = (2 * Math.PI * i) / samples;

      const z = C(r * Math.cos(theta), r * Math.sin(theta)); // circle in Z
      const w = mobiusSafe(z, p);                            // image in W

      // IMPORTANT: these are *math* coords; PlanePlot scales them
      circleZ.push([z.re, z.im]);
      circleW.push([w.re, w.im]);
    }

    // draw one circle in each plane
    zPlot.drawCurve(circleZ, "#333");
    wPlot.drawCurve(circleW, "#0a66c2");
  }
}
