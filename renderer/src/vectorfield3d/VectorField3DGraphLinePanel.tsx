import { useEffect, useRef, useState } from "react";
import { createScientificDatasetLink, createScientificDerivedView, scientificCoordinateIndex,
  type Graph2DScientificDatasetPreview, type VectorField3DDocument,
  type VectorField3DSource } from "@math3d/core";
import { reverifyVectorField3DGraphLine, type VectorField3DGraphLineSelection } from
  "./reverifyVectorField3DGraphLine";

type Props = {
  document: VectorField3DDocument; disabled?: boolean; onBusyChange?: (busy: boolean) => void;
  probe?: readonly [number, number, number] | null;
  onAddGraphLine?: (preview: Graph2DScientificDatasetPreview, selection: VectorField3DGraphLineSelection) => void;
  isGraphLineImported?: (selection: VectorField3DGraphLineSelection, document: VectorField3DDocument) => boolean;
};

export function VectorField3DGraphLinePanel(props: Props) {
  const field = props.document.source.field;
  return field.kind === "scientific-bundle" ? <VectorField3DGraphLineContent {...props} field={field} /> : null;
}

function VectorField3DGraphLineContent({ document, field, disabled, probe, onBusyChange, onAddGraphLine,
  isGraphLineImported }: Props & { field: Extract<VectorField3DSource["field"], { kind: "scientific-bundle" }> }) {
  const reference = field.references[0];
  const shape = reference.shape;
  const axes = reference.axes;
  const [component, setComponent] = useState(field.references[0].component);
  const [normalAxis, setNormalAxis] = useState<0 | 1 | 2>(2);
  const [planeFixedIndex, setPlaneFixedIndex] = useState(Math.floor(shape[2]! / 2));
  const [varyingAxis, setVaryingAxis] = useState<0 | 1 | 2>(0);
  const [fixedIndex, setFixedIndex] = useState(Math.floor(shape[1]! / 2));
  const [preview, setPreview] = useState<Graph2DScientificDatasetPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Choose a vector component and line, then preview it.");
  const epoch = useRef(0);
  const previousProbe = useRef(probe?.join(",") ?? "");
  useEffect(() => () => { epoch.current++; onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => {
    const point = probe?.join(",") ?? "";
    if (point === previousProbe.current) return;
    previousProbe.current = point;
    epoch.current++; setPreview(null); setError(""); setBusy(false); onBusyChange?.(false);
    setStatus("Probe changed. Preview the line through the current point again.");
  }, [probe, onBusyChange]);
  const fixedAxis = ([0, 1, 2] as const).find(axis => axis !== normalAxis && axis !== varyingAxis)!;
  const selection: VectorField3DGraphLineSelection = {
    component, normalAxis, planeFixedIndex, varyingAxis, fixedIndex };
  const imported = isGraphLineImported?.(selection, document) ?? false;
  const coordinate = (axis: number, index: number) =>
    axes[axis]!.origin + axes[axis]!.spacing * index;
  const changeSelection = () => {
    epoch.current++; setPreview(null); setError(""); setBusy(false); onBusyChange?.(false);
    setStatus("Selection changed. Preview the line again.");
  };
  const run = async (add: boolean, override?: VectorField3DGraphLineSelection) => {
    if (busy || disabled) return;
    if (add && (!preview || imported)) {
      setError("Preview an unimported vector line before adding it to Graphs."); return;
    }
    const request = { ...(override ?? selection) }, current = ++epoch.current;
    setBusy(true); onBusyChange?.(true); setError("");
    if (!add) setPreview(null);
    setStatus(add ? "Reverifying all vector components before import…" :
      "Reverifying all vector components before preview…");
    try {
      createScientificDerivedView(createScientificDatasetLink(field.references), { kind: "line",
        component: request.component, varyingAxis: request.varyingAxis,
        fixed: [{ axis: request.normalAxis, index: request.planeFixedIndex },
          { axis: ([0, 1, 2] as const).find(axis => axis !== request.normalAxis &&
              axis !== request.varyingAxis)!, index: request.fixedIndex }] });
      const fresh = await reverifyVectorField3DGraphLine(document, request);
      if (current !== epoch.current) return;
      if (add) {
        if (JSON.stringify(fresh.origin) !== JSON.stringify(preview!.origin) ||
            fresh.rows.length !== preview!.rows.length ||
            fresh.rows.some((row, index) => row.x !== preview!.rows[index]?.x || row.y !== preview!.rows[index]?.y))
          throw new Error("The vector source changed since preview. Preview this line again before adding it.");
        onAddGraphLine?.(fresh, request);
        setPreview(null); setStatus(`${fresh.rows.length} verified vector samples added to Graphs.`);
      } else { setPreview(fresh); setStatus(`${fresh.rows.length} verified samples ready to add to Graphs.`); }
    } catch (cause) {
      if (current === epoch.current) { setPreview(null);
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("No verified line is available."); }
    } finally { if (current === epoch.current) { setBusy(false); onBusyChange?.(false); } }
  };
  const previewProbeLine = () => {
    if (!probe) return;
    try {
      const planeFixedIndex = scientificCoordinateIndex({ ...axes[normalAxis]!, count: shape[normalAxis]! },
        probe[normalAxis]);
      const fixedIndex = scientificCoordinateIndex({ ...axes[fixedAxis]!, count: shape[fixedAxis]! },
        probe[fixedAxis]);
      changeSelection(); setPlaneFixedIndex(planeFixedIndex); setFixedIndex(fixedIndex);
      void run(false, { component, normalAxis, planeFixedIndex, varyingAxis, fixedIndex });
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const points = preview?.rows ?? [];
  const plot = points.length >= 2 ? (() => {
    const values = points.map(row => row.y!), min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    return points.map((row, index) => `${index ? "L" : "M"}${8 + index * 464 / (points.length - 1)},${
      110 - (row.y! - min) * 92 / span}`).join(" ");
  })() : "";
  return <section aria-label="3D vector field to Graph line" data-testid="vector-field3d-graph-line">
    <h4>Send a verified vector line to Graphs</h4>
    <p>Choose one component and two fixed coordinates. Each Preview and Add checks the complete three-component bundle.</p>
    <div className="vector-field3d-controls">
      <label>Graph component <select aria-label="Graph component" value={component} disabled={busy || disabled}
        onChange={event => { changeSelection(); setComponent(event.target.value); }}>
        {field.references.map(ref => <option key={ref.component} value={ref.component}>{ref.component}</option>)}
      </select></label>
      <label>Line plane normal axis <select aria-label="Line plane normal axis" value={normalAxis} disabled={busy || disabled}
        onChange={event => {
          const normal = Number(event.target.value) as 0 | 1 | 2;
          const vary = ([0, 1, 2] as const).find(axis => axis !== normal && shape[axis]! >= 2)!;
          const fixed = ([0, 1, 2] as const).find(axis => axis !== normal && axis !== vary)!;
          changeSelection(); setNormalAxis(normal); setPlaneFixedIndex(Math.floor(shape[normal]! / 2));
          setVaryingAxis(vary); setFixedIndex(Math.floor(shape[fixed]! / 2));
        }}>
        {([0, 1, 2] as const).map(axis => <option key={axis} value={axis}>{axes[axis]!.name}</option>)}
      </select></label>
      <label>Plane coordinate {axes[normalAxis]!.name} <select aria-label={`Plane coordinate ${axes[normalAxis]!.name}`}
        value={planeFixedIndex} disabled={busy || disabled} onChange={event => {
          changeSelection(); setPlaneFixedIndex(Number(event.target.value)); }}>
        {Array.from({ length: shape[normalAxis]! }, (_, index) => <option key={index} value={index}>
          {index} · {coordinate(normalAxis, index)} {axes[normalAxis]!.unit}</option>)}
      </select></label>
      <label>Line direction <select aria-label="Line direction" value={varyingAxis} disabled={busy || disabled}
        onChange={event => {
          const vary = Number(event.target.value) as 0 | 1 | 2;
          const fixed = ([0, 1, 2] as const).find(axis => axis !== normalAxis && axis !== vary)!;
          changeSelection(); setVaryingAxis(vary); setFixedIndex(Math.floor(shape[fixed]! / 2));
        }}>
        {([0, 1, 2] as const).filter(axis => axis !== normalAxis && shape[axis]! >= 2)
          .map(axis => <option key={axis} value={axis}>Vary {axes[axis]!.name}</option>)}
      </select></label>
      <label>Fixed {axes[fixedAxis]!.name} <select aria-label={`Fixed ${axes[fixedAxis]!.name}`}
        value={fixedIndex} disabled={busy || disabled} onChange={event => {
          changeSelection(); setFixedIndex(Number(event.target.value)); }}>
        {Array.from({ length: shape[fixedAxis]! }, (_, index) => <option key={index} value={index}>
          {index} · {coordinate(fixedAxis, index)} {axes[fixedAxis]!.unit}</option>)}
      </select></label>
    </div>
    <p>Graph x: {axes[varyingAxis]!.name} ({axes[varyingAxis]!.unit}); y: {component} ({
      field.componentUnits[field.references.findIndex(ref => ref.component === component)]}).
      Plane {axes[normalAxis]!.name} = {coordinate(normalAxis, planeFixedIndex)} {axes[normalAxis]!.unit};
      line at {axes[fixedAxis]!.name} = {coordinate(fixedAxis, fixedIndex)} {axes[fixedAxis]!.unit}.</p>
    {probe && <p>Linked probe: {probe.map((value, axis) =>
      `${axes[axis]!.name} = ${value} ${axes[axis]!.unit}`).join(" · ")}.
      Choose the varying axis, then preview the exact line through this point.</p>}
    <div className="vector-field2d-actions">
      {probe && <button type="button" disabled={busy || disabled}
        onClick={previewProbeLine}>Preview line through probe</button>}
      <button type="button" disabled={busy || disabled} onClick={() => void run(false)}>Preview Graph line</button>
      <button type="button" disabled={busy || disabled || !preview || imported || !onAddGraphLine}
        onClick={() => void run(true)}>Add line to Graphs</button>
    </div>
    <p role="status">{imported ? "This vector line is already in Graphs." : status}</p>
    {error && <p role="alert">{error}</p>}
    {preview && <figure aria-label={`Preview Graph vector line ${preview.label}`}>
      <svg viewBox="0 0 480 128" role="img" aria-label="Verified vector line preview"
        style={{ width: "100%", maxWidth: 480, height: 128, background: "#f8fbff", border: "1px solid #cbd5e1" }}>
        <path d={plot} fill="none" stroke="#2563eb" strokeWidth="2" />
      </svg>
      <figcaption>{preview.rows.length} samples · {preview.label} · first ({preview.rows[0]?.x}, {preview.rows[0]?.y})
        {" "}· last ({preview.rows.at(-1)?.x}, {preview.rows.at(-1)?.y}).
        Field document revision {document.identity.revision}; plane {axes[normalAxis]!.name} =
        {" "}{coordinate(normalAxis, planeFixedIndex)} {axes[normalAxis]!.unit}; fixed
        {" "}{axes[fixedAxis]!.name} = {coordinate(fixedAxis, fixedIndex)} {axes[fixedAxis]!.unit}.</figcaption>
      <small>Source revision {preview.origin.sceneFingerprint} · component resource {preview.origin.resourceSha256}</small>
    </figure>}
  </section>;
}
