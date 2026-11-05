import { useState } from "react";
import { computeVectorField3DBasinMap, computeVectorField3DPoincareSection,
  projectVectorField3DTopologyStatus, type AnalysisResultEnvelope,
  type BasinMapStudy, type Math3DProject, type PoincareStudy,
  type VectorField3DDocument } from "@math3d/core";

const solver = { method: "rk4-step-doubling" as const, maxSteps: 256,
  maxTime: 20, absoluteTolerance: 1e-5, relativeTolerance: 1e-5 };
export function VectorField3DTopologyStudiesPanel({ document, project, onSave,
  onOpenPoincare }: { document: VectorField3DDocument;
  project?: Math3DProject | null;
  onSave?: (result: AnalysisResultEnvelope) => void;
  onOpenPoincare?: (result: AnalysisResultEnvelope) => void }) {
  const axes = document.source.axes;
  const midpoint = (index: number) => (axes[index]!.min + axes[index]!.max) / 2;
  const [left, setLeft] = useState(-1), [right, setRight] = useState(1);
  const [planeZ, setPlaneZ] = useState(midpoint(2));
  const [sectionX, setSectionX] = useState(midpoint(0));
  const [seedX, setSeedX] = useState(midpoint(0) + 1);
  const [seedY, setSeedY] = useState(midpoint(1));
  const [direction, setDirection] = useState<"positive" | "negative">("negative");
  const [basin, setBasin] = useState<BasinMapStudy | null>(null);
  const [section, setSection] = useState<PoincareStudy | null>(null);
  const [message, setMessage] = useState("");
  const field = (label: string, value: number, change: (next: number) => void) =>
    <label>{label} <input type="number" value={value} step="any"
      onChange={event => change(Number(event.target.value))} /></label>;
  const run = (action: () => void) => {
    try { setMessage(""); action(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };
  const saved = project?.workspace.results.filter(result =>
    ["vector3d.basin-map", "vector3d.poincare-section"].includes(
      result.provenance.operation.type) &&
    result.provenance.source.documentId === document.identity.id) ?? [];
  return <section aria-label="Saved topology studies" data-gf06-section="analyze"
    data-testid="gf41-gf42-topology-studies">
    <h5>Basin map and Poincaré section</h5>
    <p>Local analytic tests only. Uncaptured, boundary and nonconvergent seeds remain inconclusive.</p>
    {field(`Plane z (${axes[2].unit})`, planeZ, setPlaneZ)}
    {document.source.field.kind !== "expressions" ?
      <p role="status">A verified analytic vector source is required for these gates.</p> : <>
      <div>{field(`Left attractor x (${axes[0].unit})`, left, setLeft)}
        {field(`Right attractor x (${axes[0].unit})`, right, setRight)}
        <button type="button" onClick={() => run(() => setBasin(
          computeVectorField3DBasinMap(document, { planeZ,
            x: [axes[0].min, axes[0].max],
            y: [axes[1].min, axes[1].max], columns: 6, rows: 5,
            attractors: [{ id: "left", position: [left, midpoint(1), planeZ] },
              { id: "right", position: [right, midpoint(1), planeZ] }],
            captureRadius: Math.min(axes[0].max - axes[0].min,
              axes[1].max - axes[1].min) / 12, solver })))}>
          Compute bounded basin map</button>
        {basin && <div role="status" data-testid="gf41-basin-status">
          {basin.cells.length} seeds · {String(basin.publication.summary.captured)} captured ·
          {" "}{String(basin.publication.summary.boundary)} boundary ·
          {" "}{String(basin.publication.summary.inconclusive)} inconclusive ·
          {" "}{basin.totalEvaluations} evaluations.
          <button type="button" disabled={!onSave} onClick={() => run(() => {
            onSave?.(basin.publication); setMessage("Basin recipe saved in Project."); })}>
            Save basin recipe</button>
        </div>}
      </div>
      <div>{field(`Seed x (${axes[0].unit})`, seedX, setSeedX)}
        {field(`Seed y (${axes[1].unit})`, seedY, setSeedY)}
        {field(`Section x (${axes[0].unit})`, sectionX, setSectionX)}
        <label>Crossing direction <select value={direction} onChange={event =>
          setDirection(event.target.value as "positive" | "negative")}>
          <option value="negative">Negative normal</option>
          <option value="positive">Positive normal</option></select></label>
        <button type="button" onClick={() => run(() => setSection(
          computeVectorField3DPoincareSection(document, { seed: [seedX, seedY, planeZ],
            section: { start: [sectionX, axes[1].min, planeZ],
              end: [sectionX, axes[1].max, planeZ], normal: [1, 0], direction },
            solver, maxCrossings: 32, tangencyTolerance: 1e-4 })))}>
          Compute oriented crossings</button>
        {section && <div role="status" data-testid="gf42-section-status">
          {section.crossings.length} crossings · {section.tangencies} tangencies withheld ·
          {" "}{section.outsideSection} outside segment · {section.totalEvaluations} evaluations.
          <button type="button" disabled={!onSave} onClick={() => run(() => {
            onSave?.(section.publication); setMessage("Section recipe saved in Project."); })}>
            Save section recipe</button>
        </div>}
      </div>
    </>}
    {!!message && <p role="status">{message}</p>}
    {saved.map(result => {
      const status = projectVectorField3DTopologyStatus(project!, result);
      return <div key={result.resultId} data-testid="gf41-gf42-saved-result">
        <span>{result.provenance.operation.type} · {status.status === "current" ?
          "current" : `values withheld: ${status.reason}`}</span>
        {result.provenance.operation.type === "vector3d.poincare-section" &&
          <button type="button" disabled={!onOpenPoincare || status.status !== "current"}
            onClick={() => onOpenPoincare?.(result)}>Open crossings in Graphs</button>}
      </div>;
    })}
  </section>;
}
