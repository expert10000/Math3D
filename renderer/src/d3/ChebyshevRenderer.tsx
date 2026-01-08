// src/d3/ChebyshevRenderer.ts
import type { PlanePlotHandle } from "../components/PlanePlot";
import { chebyshevT } from "../math/chebyshev";

type DomainPoint = [number, number]; // (x, y) in math coords

export function renderChebyshev(
  zPlot: PlanePlotHandle,
  wPlot: PlanePlotHandle,
  n: number,
  samples = 400
) {
  // reset both planes
  zPlot.clear();
  wPlot.clear();

  zPlot.drawGrid(0.5);
  wPlot.drawGrid(0.5);

  // domain for x
  const XMIN = -1.2;
  const XMAX = 1.2;

  // OPTIONAL: show the interval [-1.2, 1.2] on the real axis in Z-plane
  const domainSegment: DomainPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = XMIN + ((XMAX - XMIN) * i) / samples;
    domainSegment.push([x, 0]); // Im z = 0
  }
  zPlot.drawCurve(domainSegment, "#333");

  // Chebyshev curve in W-plane: (x, T_n(x))
  const curve: DomainPoint[] = [];

  for (let i = 0; i <= samples; i++) {
    const x = XMIN + ((XMAX - XMIN) * i) / samples;
    const y = chebyshevT(n, x);
    curve.push([x, y]); // domain coords
  }

  console.log("[ChebyshevRenderer] T_n, n =", n, "points", curve.length);
  wPlot.drawCurve(curve, "#c21f0a");
}
