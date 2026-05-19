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
type RenderMobiusOpts = {
  gridStep?: number;
  domainExtent?: number;
  imageClip?: number;
  drawGrid?: boolean;
};

export function renderMobius(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  p: MobiusParams,
  samples = 400,
  opts?: RenderMobiusOpts
) {
  const gridStep = opts?.gridStep ?? 0.5;
  const domainExtent = Math.max(0.6, opts?.domainExtent ?? 3);
  const imageClip = Number.isFinite(opts?.imageClip) ? Math.max(0.2, opts?.imageClip as number) : Infinity;
  const drawGrid = opts?.drawGrid !== false;

  // reset both planes
  zPlot.clear();
  wPlot.clear();

  // base grids
  if (drawGrid) {
    zPlot.drawGrid(gridStep);
    wPlot.drawGrid(gridStep);
  }

  // ----- circles in Z-plane -----
  // we draw several concentric circles centred at 0 in the Z-plane
  const Rmax = domainExtent * 0.84;
  const NUM_CIRCLES = Math.max(4, Math.round(8 + domainExtent * 0.5));

  for (let k = 1; k <= NUM_CIRCLES; k++) {
    const r = (Rmax * k) / NUM_CIRCLES;

    const circleZ: Point[] = [];
    let segW: Point[] = [];
    const mappedSegments: Point[][] = [];

    for (let i = 0; i <= samples; i++) {
      const theta = (2 * Math.PI * i) / samples;

      const z = C(r * Math.cos(theta), r * Math.sin(theta)); // circle in Z
      const w = mobiusSafe(z, p);                            // image in W

      // IMPORTANT: these are *math* coords; PlanePlot scales them
      circleZ.push([z.re, z.im]);
      const finite = Number.isFinite(w.re) && Number.isFinite(w.im);
      const clipped = finite && Math.hypot(w.re, w.im) <= imageClip;
      if (clipped) {
        segW.push([w.re, w.im]);
      } else if (segW.length >= 2) {
        mappedSegments.push(segW);
        segW = [];
      } else {
        segW = [];
      }
    }
    if (segW.length >= 2) mappedSegments.push(segW);

    // draw one circle in each plane
    zPlot.drawCurve(circleZ, "#333");
    for (const seg of mappedSegments) {
      wPlot.drawCurve(seg, "#0a66c2");
    }
  }
}
