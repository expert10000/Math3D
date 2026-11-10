import { useState } from "react";
import { analyzeVectorField3DLineIntegral, createOrientedPolylineSelection,
  createVectorField3DLineIntegralResult, normalizeScientificSelection,
  type AnalysisResultEnvelope, type Math3DProject,
  type ScientificSelection, type VectorField3DDocument,
  type VectorField3DLineIntegralMode } from "@math3d/core";
import { VectorField3DResultEvidenceCard } from "./VectorField3DResultEvidenceCard";
import { vectorField3DResultEvidence } from "./vectorField3DResultEvidence";

const initialVertices = (document: VectorField3DDocument) => {
  const [x, y, z] = document.source.axes;
  const x0 = x.min + (x.max - x.min) / 4, x1 = x.min + 3 * (x.max - x.min) / 4;
  const y0 = y.min + (y.max - y.min) / 4, y1 = y.min + 3 * (y.max - y.min) / 4;
  const z0 = (z.min + z.max) / 2;
  return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]
    .map(point => point.join(", ")).join("\n");
};
const parseVertices = (text: string): readonly (readonly [number, number, number])[] => {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2 || lines.length > 64) throw new TypeError("Enter 2–64 ordered vertices.");
  return lines.map((line, index) => {
    const parts = line.split(/[\s,]+/);
    if (parts.length !== 3 || parts.some(part => !part || !Number.isFinite(Number(part))))
      throw new TypeError(`Vertex ${index + 1} needs finite x, y, z coordinates.`);
    return parts.map(Number) as [number, number, number];
  });
};

export function VectorField3DLineIntegralPanel({ document, project, onSaveSelection,
  onSaveResult }: { document: VectorField3DDocument; project?: Math3DProject | null;
  onSaveSelection?: (document: VectorField3DDocument, selection: ScientificSelection) => void;
  onSaveResult?: (document: VectorField3DDocument, result: AnalysisResultEnvelope) => void }) {
  const [vertices, setVertices] = useState(() => initialVertices(document));
  const [closed, setClosed] = useState(true);
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [mode, setMode] = useState<VectorField3DLineIntegralMode>("circulation");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selections = project?.workspace.scientificSelections?.filter(item =>
    item.identity.kind === "authored" && item.geometry.kind === "oriented-polyline" &&
    item.source?.kind === "document" && item.source.documentId === document.identity.id) ?? [];
  const selected = selections.find(item => item.identity.kind === "authored" &&
    item.identity.id === selectedId) ?? null;
  const results = project?.workspace.results.filter(item =>
    item.provenance.operation.type === "vector3d.line-integral" &&
    item.provenance.source.documentId === document.identity.id) ?? [];
  const saveSelection = () => { try {
    if (!project || !onSaveSelection) throw new TypeError("Open a saved Project first.");
    const points = parseVertices(vertices);
    let selection = createOrientedPolylineSelection(document, points, closed, direction,
      crypto.randomUUID());
    if (selected?.identity.kind === "authored") {
      const checked = normalizeScientificSelection({ ...selection, identity: selected.identity });
      if (!checked.ok) throw new TypeError(checked.errors.join(" "));
      selection = checked.value;
    }
    onSaveSelection(document, selection);
    if (selection.identity.kind === "authored") setSelectedId(selection.identity.id);
    setError(""); setMessage("Oriented polyline saved in Project. Save the Project to retain it.");
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  const compute = () => { try {
    if (!project || !selected || !onSaveResult) throw new TypeError("Save an oriented polyline first.");
    const started = performance.now();
    const analysis = analyzeVectorField3DLineIntegral(document, selected, mode);
    const result = createVectorField3DLineIntegralResult(document, selected, analysis,
      Math.max(0, performance.now() - started));
    onSaveResult(document, result);
    setError(""); setMessage(analysis.state === "complete" ?
      `Saved ${mode}: ${analysis.value} ${analysis.unit}; error estimate ${analysis.errorEstimate}.` :
      `Saved ${analysis.state} result: ${analysis.reason}; coverage ${analysis.completedSegments}/${analysis.segmentCount} segments. No complete value is claimed.`);
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  return <section aria-label="Oriented line integrals" data-testid="gf10-line-integral">
    <h4>Oriented line integral</h4>
    <p>Save physical x, y, z vertices. The integral uses the authored vector field and bounded numerical quadrature.</p>
    <label>Ordered vertices (x, y, z; one per line)<textarea value={vertices} rows={5}
      onChange={event => setVertices(event.target.value)} /></label>
    <label><input type="checkbox" checked={closed} onChange={event => setClosed(event.target.checked)} /> Close path</label>
    <label>Orientation <select value={direction} onChange={event => setDirection(event.target.value as typeof direction)}>
      <option value="forward">Forward</option><option value="reverse">Reverse</option></select></label>
    <button type="button" disabled={!project || !onSaveSelection} onClick={saveSelection}>
      {selected ? "Update oriented polyline" : "Save oriented polyline"}</button>
    {selections.length > 0 && <div><strong>Saved paths</strong>{selections.map(item => {
      const id = item.identity.kind === "authored" ? item.identity.id : "";
      return <button type="button" key={id} data-selection-id={id}
        aria-pressed={selectedId === id} onClick={() => {
          if (item.geometry.kind !== "oriented-polyline") return;
          setSelectedId(id); setVertices(item.geometry.vertices.map(vertex => vertex.join(", ")).join("\n"));
          setClosed(item.geometry.closed); setDirection(item.geometry.direction);
          setError(""); setMessage("");
        }}>Use {item.geometry.kind === "oriented-polyline" ?
          `${item.geometry.vertices.length}-vertex ${item.geometry.direction} path` : "path"}</button>;
    })}</div>}
    <label>Measurement <select value={mode} onChange={event =>
      setMode(event.target.value as VectorField3DLineIntegralMode)}>
      <option value="line-integral">Line integral</option><option value="circulation">Circulation</option>
    </select></label>
    <button type="button" disabled={!selected || !onSaveResult} onClick={compute}>Compute and save result</button>
    {results.map(result => <VectorField3DResultEvidenceCard key={result.resultId}
      testId="gf10-saved-result" evidence={vectorField3DResultEvidence(project!, result, document)}
      label={result.provenance.operation.parameters.mode === "circulation" ? "Circulation" : "Line integral"} />)}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
