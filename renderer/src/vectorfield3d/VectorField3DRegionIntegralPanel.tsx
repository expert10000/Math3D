import { useState } from "react";
import { analyzeVectorField3DRegion, analyzeVectorField3DTheorem,
  createOrientedRegionSelection, createVectorField3DRegionIntegralResult,
  normalizeScientificSelection,
  type AnalysisResultEnvelope, type Math3DProject, type RegionGeometry,
  type RegionMeasure, type ScientificSelection, type VectorField3DDocument } from "@math3d/core";
import { VectorField3DResultEvidenceCard } from "./VectorField3DResultEvidenceCard";
import { vectorField3DResultEvidence } from "./vectorField3DResultEvidence";

export function VectorField3DRegionIntegralPanel({ document, project, onSaveSelection,
  onSaveResult }: { document: VectorField3DDocument; project?: Math3DProject | null;
  onSaveSelection?: (document: VectorField3DDocument, selection: ScientificSelection) => void;
  onSaveResult?: (document: VectorField3DDocument, result: AnalysisResultEnvelope) => void }) {
  const [shape, setShape] = useState<"plane" | "box">("plane");
  const [normalAxis, setNormalAxis] = useState<0 | 1 | 2>(2);
  const [normalSign, setNormalSign] = useState<1 | -1>(1);
  const [inward, setInward] = useState(false);
  const [ranges, setRanges] = useState(() => document.source.axes.map(axis =>
    [axis.min, axis.max] as [number, number]));
  const [coordinate, setCoordinate] = useState(() =>
    (document.source.axes[2].min + document.source.axes[2].max) / 2);
  const [resolution, setResolution] = useState(8);
  const [measure, setMeasure] = useState<RegionMeasure | "divergence" | "stokes">("surface-flux");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selections = project?.workspace.scientificSelections?.filter(item =>
    item.identity.kind === "authored" &&
    (item.geometry.kind === "oriented-plane-region" || item.geometry.kind === "oriented-box-region") &&
    item.source?.kind === "document" && item.source.documentId === document.identity.id) ?? [];
  const selected = selections.find(item => item.identity.kind === "authored" &&
    item.identity.id === selectedId) ?? null;
  const results = project?.workspace.results.filter(item =>
    ["vector3d.region-integral", "vector3d.theorem-check"].includes(item.provenance.operation.type) &&
    item.provenance.source.documentId === document.identity.id) ?? [];
  const geometry = (): RegionGeometry => shape === "box" ?
    { kind: "oriented-box-region", bounds: ranges as unknown as
      [readonly [number, number], readonly [number, number], readonly [number, number]],
      normal: inward ? "inward" : "outward" } :
    { kind: "oriented-plane-region", normalAxis, coordinate,
      bounds: ranges.filter((_, axis) => axis !== normalAxis) as unknown as
        [readonly [number, number], readonly [number, number]],
      normalSign, boundary: "right-hand" };
  const save = () => { try {
    if (!project || !onSaveSelection) throw new TypeError("Open a saved Project first.");
    let selection = createOrientedRegionSelection(document, geometry(), crypto.randomUUID());
    if (selected?.identity.kind === "authored") {
      const checked = normalizeScientificSelection({ ...selection, identity: selected.identity });
      if (!checked.ok) throw new TypeError(checked.errors.join(" "));
      selection = checked.value;
    }
    onSaveSelection(document, selection);
    if (selection.identity.kind === "authored") setSelectedId(selection.identity.id);
    setError(""); setMessage("Oriented region saved in Project.");
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  const compute = () => { try {
    if (!selected || !onSaveResult) throw new TypeError("Save an oriented region first.");
    const region = selected.geometry.kind;
    if (region === "oriented-plane-region" &&
        ["volume-divergence", "volume-magnitude", "divergence"].includes(measure) ||
        region === "oriented-box-region" && ["curl-flux", "stokes"].includes(measure))
      throw new TypeError("Choose a measurement supported by the saved geometry.");
    const analysis = measure === "divergence" || measure === "stokes" ?
      analyzeVectorField3DTheorem(document, selected, measure, resolution) :
      analyzeVectorField3DRegion(document, selected, measure, resolution);
    const result = createVectorField3DRegionIntegralResult(document, selected, analysis);
    onSaveResult(document, result);
    setError(""); setMessage("Region result saved. Review coverage and source status below.");
  } catch (cause) { setError(String((cause as Error).message ?? cause)); } };
  return <section aria-label="Surface and volume integrals" data-testid="gf11-region-integral">
    <h4>Surface, volume and theorem checks</h4>
    <label>Geometry <select value={shape} onChange={event => {
      setShape(event.target.value as typeof shape); setSelectedId(null);
    }}><option value="plane">Oriented plane</option><option value="box">Closed box</option></select></label>
    {shape === "plane" && <><label>Normal axis <select value={normalAxis} onChange={event =>
      setNormalAxis(Number(event.target.value) as 0 | 1 | 2)}>
      <option value={0}>x</option><option value={1}>y</option><option value={2}>z</option>
    </select></label><label>Plane coordinate <input type="number" value={coordinate}
      onChange={event => setCoordinate(Number(event.target.value))} /></label>
      <label>Normal orientation <select value={normalSign} onChange={event =>
        setNormalSign(Number(event.target.value) as 1 | -1)}>
        <option value={1}>Positive axis</option><option value={-1}>Negative axis</option>
      </select></label></>}
    {shape === "box" && <label>Boundary normal <select value={inward ? "inward" : "outward"}
      onChange={event => setInward(event.target.value === "inward")}>
      <option value="outward">Outward</option><option value="inward">Inward</option>
    </select></label>}
    {ranges.map((range, axis) => <div key={axis}><span>{"xyz"[axis]} bounds </span>
      <label>minimum <input type="number" value={range[0]} onChange={event =>
        setRanges(current => current.map((pair, index) => index === axis ?
          [Number(event.target.value), pair[1]] : pair))} /></label>
      <label>maximum <input type="number" value={range[1]} onChange={event =>
        setRanges(current => current.map((pair, index) => index === axis ?
          [pair[0], Number(event.target.value)] : pair))} /></label></div>)}
    <button type="button" disabled={!project || !onSaveSelection} onClick={save}>
      {selected ? "Update oriented region" : "Save oriented region"}</button>
    {selections.map(item => { const id = item.identity.kind === "authored" ? item.identity.id : "";
      return <button type="button" key={id} data-selection-id={id} aria-pressed={selectedId === id}
        onClick={() => { setSelectedId(id); setError("");
          const g = item.geometry;
          if (g.kind === "oriented-box-region") {
            setShape("box"); setRanges(g.bounds.map(pair => [...pair] as [number, number]));
            setInward(g.normal === "inward");
          } else if (g.kind === "oriented-plane-region") {
            setShape("plane"); setNormalAxis(g.normalAxis);
            setCoordinate(g.coordinate); setNormalSign(g.normalSign);
            const tangent = [0, 1, 2].filter(axis => axis !== g.normalAxis);
            setRanges(current => current.map((pair, axis) => {
              const index = tangent.indexOf(axis);
              return index < 0 ? pair : [...g.bounds[index]!] as [number, number];
            }));
          } }}>Use saved {item.geometry.kind === "oriented-box-region" ? "box" : "plane"}</button>;
    })}
    <label>Resolution per axis <input type="number" min={2} max={24} value={resolution}
      onChange={event => setResolution(Number(event.target.value))} /></label>
    <label>Measurement <select value={measure} onChange={event =>
      setMeasure(event.target.value as typeof measure)}>
      <option value="surface-flux">Surface flux</option>
      <option value="volume-divergence">Volume integral of divergence</option>
      <option value="volume-magnitude">Volume integral of magnitude</option>
      <option value="divergence">Divergence theorem check</option>
      <option value="stokes">Stokes theorem check</option>
    </select></label>
    <button type="button" disabled={!selected || !onSaveResult} onClick={compute}>Compute and save</button>
    {results.map(result => <VectorField3DResultEvidenceCard key={result.resultId}
      testId="gf11-saved-result" evidence={vectorField3DResultEvidence(project!, result, document)}
      label={String(result.provenance.operation.parameters.measure)} />)}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
