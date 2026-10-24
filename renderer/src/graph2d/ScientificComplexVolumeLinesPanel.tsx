import { useEffect, useRef, useState } from "react";
import { previewGraph2DScientificVolumeLine, type Graph2DAuthoringAction,
  type Graph2DDocument, type Graph2DFieldLocator, type Graph2DPointSeriesDraft,
  type Graph2DScientificDatasetPreview } from "@math3d/core";
import { pointTableStore } from "./pointTableStore";

type Axis = Readonly<{ name: string; unit: string }>;
type Selection = Readonly<{ normalAxis: 0 | 1 | 2; planeFixedIndex: number;
  varyingAxis: 0 | 1 | 2; fixedIndex: number }>;
type Pair = readonly [Graph2DScientificDatasetPreview, Graph2DScientificDatasetPreview];
const colors = ["#2563eb", "#db2777"] as const;
const initialAxes = (shape: readonly [number, number, number]) => {
  const normalAxis = ([2, 1, 0] as const).find(axis =>
    ([0, 1, 2] as const).some(other => other !== axis && shape[other] >= 16)) ?? 2;
  const varyingAxis = ([0, 1, 2] as const).find(axis => axis !== normalAxis && shape[axis] >= 16) ?? 0;
  const fixedAxis = ([0, 1, 2] as const).find(axis => axis !== normalAxis && axis !== varyingAxis) ?? 1;
  return { normalAxis, varyingAxis, fixedAxis };
};

export function ScientificComplexVolumeLinesPanel({ manifestJson, fingerprint, locator, datasetId, shape,
  axes, origin, spacing, document, disabled, onAuthoringCommit }: {
  manifestJson: string; fingerprint: string; locator: Graph2DFieldLocator; datasetId: string;
  shape: readonly [number, number, number]; axes: readonly [Axis, Axis, Axis];
  origin: readonly [number, number, number]; spacing: readonly [number, number, number];
  document: Graph2DDocument; disabled?: boolean; onAuthoringCommit?: (action: Graph2DAuthoringAction) => void;
}) {
  const initial = initialAxes(shape);
  const [normalAxis, setNormalAxis] = useState<0 | 1 | 2>(initial.normalAxis);
  const [planeFixedIndex, setPlaneFixedIndex] = useState(Math.floor(shape[initial.normalAxis] / 2));
  const [varyingAxis, setVaryingAxis] = useState<0 | 1 | 2>(initial.varyingAxis);
  const [fixedIndex, setFixedIndex] = useState(Math.floor(shape[initial.fixedAxis] / 2));
  const [preview, setPreview] = useState<Pair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Choose a plane and line, then preview both components.");
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  const hasContourLength = shape.some(length => length >= 16);
  const fixedAxis = ([0, 1, 2] as const).find(axis => axis !== normalAxis && axis !== varyingAxis)!;
  const selection: Selection = { normalAxis, planeFixedIndex, varyingAxis, fixedIndex };
  const coordinate = (axis: number, index: number) => origin[axis]! + spacing[axis]! * index;
  const alreadyImported = ["real", "imaginary"].some(component => document.source.objects.some(item =>
    item.kind === "point-series" && item.origin?.sceneFingerprint === fingerprint &&
    item.origin.datasetId === datasetId && item.origin.component === component &&
    item.origin.slice && "plane" in item.origin.slice && item.origin.slice.plane?.normalAxis === normalAxis &&
    item.origin.slice.plane.fixedIndex === planeFixedIndex &&
    item.origin.slice.varyingAxis === varyingAxis && item.origin.slice.fixedIndex === fixedIndex));
  const reset = () => { epoch.current++; setPreview(null); setBusy(false); setError("");
    setStatus("Selection changed. Preview both components again."); };
  const readPair = async (request: Selection): Promise<Pair> => {
    if (!window.scientificScenes?.previewGraphComplexVolumeLines)
      throw new TypeError("3D complex field lines require the desktop source verifier.");
    const lines = await window.scientificScenes.previewGraphComplexVolumeLines({
      fingerprint, datasetId, ...request });
    const pair = lines.map((line, index) => {
      const checked = previewGraph2DScientificVolumeLine(manifestJson, fingerprint, line);
      if (checked.origin.component !== (index === 0 ? "real" : "imaginary"))
        throw new TypeError("Verified complex components are out of order.");
      return { ...checked, origin: { ...checked.origin, locator } };
    }) as [Graph2DScientificDatasetPreview, Graph2DScientificDatasetPreview];
    if (pair[0].rows.length !== pair[1].rows.length ||
        JSON.stringify(pair[0].origin.slice) !== JSON.stringify(pair[1].origin.slice) ||
        pair[0].rows.some((row, index) => row.x !== pair[1].rows[index]?.x))
      throw new TypeError("Verified real and imaginary lines have different plane coordinates or samples.");
    return pair;
  };
  const run = async (add: boolean) => {
    if (busy || disabled || !hasContourLength) return;
    if (add && (!preview || alreadyImported || !onAuthoringCommit)) {
      setError("Preview an unimported real/imaginary pair before adding it to Graphs."); return;
    }
    const request = { ...selection }, current = ++epoch.current;
    setBusy(true); setError(""); if (!add) setPreview(null);
    setStatus(add ? "Reverifying both components before import…" : "Verifying both components before preview…");
    try {
      const fresh = await readPair(request);
      if (epoch.current !== current) return;
      if (add) {
        if (fresh.some((part, index) => JSON.stringify(part.origin) !== JSON.stringify(preview![index]!.origin) ||
            JSON.stringify(part.rows) !== JSON.stringify(preview![index]!.rows)))
          throw new TypeError("The complex source changed since preview. Preview the pair again.");
        if (document.source.objects.length > 30) throw new TypeError("Graph object limit reached.");
        const drafts = fresh.map((part, index) => ({ label: part.label,
          table: pointTableStore.publish(part.rows), mode: "line" as const, domain: part.domain,
          origin: part.origin, style: { color: colors[index]!, lineWidth: 2,
            lineStyle: "solid" as const, visible: true } })) as
          [Graph2DPointSeriesDraft, Graph2DPointSeriesDraft];
        onAuthoringCommit!({ type: "create-point-series-pair", drafts });
        setPreview(null); setStatus(`${fresh[0].rows.length} aligned real/imaginary samples added to Graphs.`);
      } else { setPreview(fresh); setStatus(`${fresh[0].rows.length} aligned samples per component are ready.`); }
    } catch (cause) { if (epoch.current === current) { setPreview(null);
      setError(cause instanceof Error ? cause.message : String(cause)); setStatus("No verified complex pair is available."); } }
    finally { if (epoch.current === current) setBusy(false); }
  };
  return <section aria-label="3D complex field lines" data-testid="scientific-complex-volume-lines">
    <h4>Import real and imaginary lines from a 3D plane</h4>
    <p>Both components use one verified bundle read. Preview and import each recheck the source.</p>
    {!hasContourLength && <p role="alert">A complex contour needs at least 16 samples along one axis.</p>}
    <label>Complex plane normal axis <select aria-label="Complex plane normal axis" value={normalAxis}
      disabled={busy || disabled} onChange={event => {
        const axis = Number(event.target.value) as 0 | 1 | 2;
        const vary = ([0, 1, 2] as const).find(other => other !== axis && shape[other] >= 16)!;
        const fixed = ([0, 1, 2] as const).find(other => other !== axis && other !== vary)!;
        reset(); setNormalAxis(axis); setPlaneFixedIndex(Math.floor(shape[axis] / 2));
        setVaryingAxis(vary); setFixedIndex(Math.floor(shape[fixed] / 2));
      }}>
      {([0, 1, 2] as const).filter(axis => [0, 1, 2].some(other => other !== axis && shape[other]! >= 16))
        .map(axis => <option key={axis} value={axis}>{axes[axis].name}</option>)}
    </select></label>
    <label>Complex plane coordinate {axes[normalAxis].name} <select aria-label={`Complex plane coordinate ${axes[normalAxis].name}`}
      value={planeFixedIndex} disabled={busy || disabled} onChange={event => { reset(); setPlaneFixedIndex(Number(event.target.value)); }}>
      {Array.from({ length: shape[normalAxis] }, (_, index) => <option key={index} value={index}>
        {index} · {coordinate(normalAxis, index)} {axes[normalAxis].unit}</option>)}
    </select></label>
    <label>Complex line direction <select aria-label="Complex line direction" value={varyingAxis}
      disabled={busy || disabled} onChange={event => {
        const vary = Number(event.target.value) as 0 | 1 | 2;
        const fixed = ([0, 1, 2] as const).find(axis => axis !== normalAxis && axis !== vary)!;
        reset(); setVaryingAxis(vary); setFixedIndex(Math.floor(shape[fixed] / 2));
      }}>
      {([0, 1, 2] as const).filter(axis => axis !== normalAxis && shape[axis] >= 16)
        .map(axis => <option key={axis} value={axis}>Vary {axes[axis].name}</option>)}
    </select></label>
    <label>Complex fixed {axes[fixedAxis].name} <select aria-label={`Complex fixed ${axes[fixedAxis].name}`}
      value={fixedIndex} disabled={busy || disabled} onChange={event => { reset(); setFixedIndex(Number(event.target.value)); }}>
      {Array.from({ length: shape[fixedAxis] }, (_, index) => <option key={index} value={index}>
        {index} · {coordinate(fixedAxis, index)} {axes[fixedAxis].unit}</option>)}
    </select></label>
    <p>Plane {axes[normalAxis].name} = {coordinate(normalAxis, planeFixedIndex)} {axes[normalAxis].unit};
      {" "}line at {axes[fixedAxis].name} = {coordinate(fixedAxis, fixedIndex)} {axes[fixedAxis].unit};
      {" "}vary {axes[varyingAxis].name} ({axes[varyingAxis].unit}).</p>
    <button type="button" disabled={busy || disabled || !hasContourLength} onClick={() => void run(false)}>Preview real/imaginary lines</button>
    {" "}<button type="button" disabled={busy || disabled || !hasContourLength || !preview || alreadyImported || !onAuthoringCommit}
      onClick={() => void run(true)}>Import real/imaginary pair</button>
    <p role="status">{alreadyImported ? "This complex plane line pair is already in Graphs." : status}</p>
    {error && <p role="alert">{error}</p>}
    {preview && <figure aria-label="Verified 3D complex line pair">
      <figcaption>{preview[0].rows.length} aligned samples per component · real and imaginary.
        First ({preview[0].rows[0]?.x}, {preview[0].rows[0]?.y} + i{preview[1].rows[0]?.y});
        last ({preview[0].rows.at(-1)?.x}, {preview[0].rows.at(-1)?.y} + i{preview[1].rows.at(-1)?.y}).</figcaption>
      <small>Manifest {fingerprint} · real {preview[0].origin.resourceSha256} · imaginary {preview[1].origin.resourceSha256}</small>
    </figure>}
  </section>;
}
