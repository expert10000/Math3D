// src/d3/TransformRenderer.ts
import type { PlanePlotHandle } from "../components/PlanePlot";
import { C } from "../math/complex";

type DomainPoint = [number, number];

export type TransformPrimitive = "vline" | "hline" | "circle";

export type TransformState = {
  kind: TransformPrimitive;
  value: number; // vline: x0, hline: y0, circle: radius
};

// simple example transform: f(z) = z^2
function square(z: { re: number; im: number }) {
  const { re, im } = z;
  return {
    re: re * re - im * im,
    im: 2 * re * im,
  };
}

export function renderTransform(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  state: TransformState,
  samples = 400
) {
  console.log("[TransformRenderer] render", state);

  zPlot.clear();
  wPlot.clear();

  zPlot.drawGrid(0.5);
  wPlot.drawGrid(0.5);

  const R = 3;
  const ptsZ: DomainPoint[] = [];
  const ptsW: DomainPoint[] = [];

  switch (state.kind) {
    case "vline": {
      const x0 = state.value;
      for (let i = 0; i <= samples; i++) {
        const t = -R + (2 * R * i) / samples;
        const z = C(x0, t);
        const w = square(z);
        ptsZ.push([z.re, z.im]);
        ptsW.push([w.re, w.im]);
      }
      break;
    }

    case "hline": {
      const y0 = state.value;
      for (let i = 0; i <= samples; i++) {
        const s = -R + (2 * R * i) / samples;
        const z = C(s, y0);
        const w = square(z);
        ptsZ.push([z.re, z.im]);
        ptsW.push([w.re, w.im]);
      }
      break;
    }

    case "circle": {
      const r = Math.max(0.1, Math.min(R, Math.abs(state.value) || 1));
      const TWO_PI = Math.PI * 2;
      for (let i = 0; i <= samples; i++) {
        const theta = (TWO_PI * i) / samples;
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        const z = C(x, y);
        const w = square(z);
        ptsZ.push([z.re, z.im]);
        ptsW.push([w.re, w.im]);
      }
      break;
    }
  }

  console.log(
    "[TransformRenderer] generated points",
    state.kind,
    "Z:",
    ptsZ.length,
    "W:",
    ptsW.length
  );

  if (!ptsZ.length) {
    console.warn("[TransformRenderer] no points generated for state", state);
    return;
  }

  zPlot.drawCurve(ptsZ, "#333");
  wPlot.drawCurve(ptsW, "#0a66c2");
}
