import type { SageAlgebraicLocusSample } from "@math3d/core";

/** Read-only plot of the saved numerical sample; the exact equations remain in its scene. */
export default function SageAlgebraicLocusPlot({ sample }: { sample: SageAlgebraicLocusSample }) {
  const bounds = sample.scene.domain.bounds;
  const span = (axis: number) => bounds[axis].max - bounds[axis].min;
  const normalized = (p: readonly number[]) => [0, 1, 2].map((axis) =>
    axis < bounds.length ? (p[axis] - bounds[axis].min) / span(axis) - 0.5 : 0);
  const project = (p: readonly number[]) => {
    const [x, y, z] = normalized(p);
    return bounds.length === 3 ? [210 + 290 * (x - 0.48 * y), 160 - 250 * (z + 0.38 * (x + y))] :
      [210 + 340 * x, 160 - 260 * y];
  };
  const triangles = sample.triangles.map((triangle) => ({
    triangle, depth: triangle.reduce((sum, p) => { const [x, y] = normalized(p); return sum + x + y; }, 0) / 3,
  })).sort((a, b) => a.depth - b.depth);
  return <figure data-testid="cas-locus-plot" style={{ margin: 0, maxWidth: 520 }}>
    <svg role="img" aria-label={`Bounded numerical ${sample.kind} plot; potentially incomplete`}
      viewBox="0 0 420 320" style={{ width: "100%", maxHeight: 320, border: "1px solid #b9cce3",
        borderRadius: 8, background: "#f7faff" }}>
      <path d="M 20 160 H 400 M 210 20 V 300" stroke="#d6e2ef" fill="none" />
      {triangles.map(({ triangle }, index) => <polygon key={index}
        points={triangle.map((p) => project(p).join(",")).join(" ")}
        fill="#78abdc" fillOpacity="0.55" stroke="#326ba8" strokeWidth="0.35" />)}
      {sample.segments.map(([a, b], index) => { const [x1,y1] = project(a), [x2,y2] = project(b);
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#075ca1" strokeWidth="1.8" />; })}
      {sample.points.map((p, index) => { const [x,y] = project(p);
        return <circle key={index} cx={x} cy={y} r="4" fill="#075ca1" />; })}
    </svg>
    <figcaption style={{ fontSize: 12, color: "#475569" }}>
      {sample.kind} · {sample.algorithm} · {sample.sampleCount} evaluations · bounded numerical sample, potentially incomplete
    </figcaption>
  </figure>;
}
