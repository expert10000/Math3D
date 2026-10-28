import type { Graph2DScientificVolume, VectorField3DDocument,
  VectorField3DLinkedLineProfile, VectorField3DSliceArtifact } from "@math3d/core";
import { sampleLinkedOverlayLineProfile, type LinkedOverlayLineProfile,
  type VectorSliceOverlayPlane } from "./scientificSliceOverlay";

type SampleDigest = Readonly<{ name: string; sampleSha256: string }>;

const plot = (values: readonly (number | null)[]) => {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 0;
  const span = max - min || 1;
  let drawing = false;
  const path = values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) { drawing = false; return ""; }
    const segment = `${drawing ? "L" : "M"}${24 + index * 272 / Math.max(values.length - 1, 1)},${
      104 - (value - min) * 80 / span}`;
    drawing = true;
    return segment;
  }).join(" ");
  return { path, count: finite.length, min, max };
};

export function LinkedOverlayProfileView({ document, slice, probe, profile, vectorPlane,
  scalarVolume, vectorSamples, status, mismatch, onChange, onSendToGraphs, sendBusy = false }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  probe: readonly [number, number, number] | null;
  profile: VectorField3DLinkedLineProfile | null;
  vectorPlane: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  vectorSamples: readonly SampleDigest[]; status: string;
  mismatch: string;
  onChange: (profile: VectorField3DLinkedLineProfile | null) => void;
  onSendToGraphs?: (line: LinkedOverlayLineProfile, profile: VectorField3DLinkedLineProfile,
    samples: readonly SampleDigest[]) => void;
  sendBusy?: boolean;
}) {
  const overlay = document.workspace?.scalarOverlay;
  if (!overlay?.visible) return null;
  const onPlane = probe && Math.abs(probe[slice.normalAxis] - slice.fixedCoordinate) < 1e-9;
  const selected = profile?.normalAxis === slice.normalAxis;
  const active = selected && profile.visible && !mismatch;
  let line: ReturnType<typeof sampleLinkedOverlayLineProfile> | null = null;
  let error = "";
  if (active && vectorPlane && scalarVolume) {
    try { line = sampleLinkedOverlayLineProfile(document, slice, profile,
      vectorPlane, overlay.reference, scalarVolume, overlay.unit); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  const vectorPlot = line ? plot(line.rows.map(row => row.vector)) : null;
  const scalarPlot = line ? plot(line.rows.map(row => row.scalar)) : null;
  const varyingLabel = selected ? document.source.axes[profile.varyingAxis].label : "";
  const fixedAxis = selected ? slice.planeAxes.find(axis => axis !== profile.varyingAxis) : undefined;
  return <section className="vector-field3d-line-profile scientific-linked-overlay-profile"
    aria-label="Linked scalar and vector line profile"
    data-testid="scientific-linked-overlay-profile">
    <h4>Linked scalar + vector line</h4>
    {!selected && <button type="button" disabled={!onPlane || !!mismatch}
      onClick={() => onPlane && !mismatch && onChange({ normalAxis: slice.normalAxis,
        varyingAxis: slice.planeAxes[0] as 0 | 1 | 2,
        point: [...probe] as [number, number, number], vectorChannel: "speed", visible: true })}>
      Link line through shared probe</button>}
    {!selected && !onPlane && <p role="status">Place the shared probe on this slice to link a line.</p>}
    {!selected && mismatch && <p role="alert">Linked line withheld: {mismatch}</p>}
    {selected && <>
      <label>Line direction <select aria-label="Linked line direction" value={profile.varyingAxis}
        onChange={event => onChange({ ...profile,
          varyingAxis: Number(event.target.value) as 0 | 1 | 2 })}>
        {slice.planeAxes.map(axis => <option key={axis} value={axis}>
          Vary {document.source.axes[axis].label}</option>)}
      </select></label>
      <label>Vector quantity <select aria-label="Linked vector quantity"
        value={profile.vectorChannel} onChange={event => onChange({ ...profile,
          vectorChannel: event.target.value as VectorField3DLinkedLineProfile["vectorChannel"] })}>
        <option value="speed">Speed</option><option value="p">First component</option>
        <option value="q">Second component</option><option value="r">Third component</option>
      </select></label>
      <label><input type="checkbox" aria-label="Show linked line" checked={profile.visible}
        onChange={event => onChange({ ...profile, visible: event.target.checked })} />Show line</label>
      <button type="button" onClick={() => onChange(null)}>Remove linked line</button>
      <p>Physical line: vary {varyingLabel} across this slice;
        {" "}{fixedAxis !== undefined && `${document.source.axes[fixedAxis].label} = ${profile.point[fixedAxis]} ${document.source.axes[fixedAxis].unit}; `}
        {document.source.axes[slice.normalAxis].label} = {profile.point[slice.normalAxis]}
        {" "}{document.source.axes[slice.normalAxis].unit}.</p>
      {mismatch && <p role="alert">Linked line withheld: {mismatch}</p>}
      {active && !line && <p role="status">{error || status ||
        "Reverifying both sources before showing this line…"}</p>}
      {line && vectorPlot && scalarPlot && <>
        {onSendToGraphs && <button type="button" data-testid="send-linked-overlay-line-to-graphs"
          disabled={sendBusy} onClick={() => onSendToGraphs(line, profile, vectorSamples)}>
          {sendBusy ? "Verifying linked line…" : "Send both linked lines to Graphs"}</button>}
        <p role="status">{vectorPlot.count}/{line.rows.length} vector samples;
          {" "}{scalarPlot.count}/{line.rows.length} scalar samples.
          {vectorPlot.count < line.rows.length || scalarPlot.count < line.rows.length ?
            " Gaps mark positions outside a field or without finite samples." : ""}</p>
        {([{ label: `Vector ${line.vectorChannel}`, data: vectorPlot,
          unit: line.vectorUnit, color: "#fde047" },
        { label: overlay.title, data: scalarPlot,
          unit: line.scalarUnit, color: "#38bdf8" }] as const).map(series =>
          <div key={series.label}><strong>{series.label} ({series.unit})</strong>
            <svg viewBox="0 0 320 130" role="img"
              aria-label={`${series.label}: ${series.data.count} finite of ${line.rows.length} samples; ${series.data.min.toPrecision(4)} to ${series.data.max.toPrecision(4)} ${series.unit}`}>
              <rect x="0" y="0" width="320" height="130" fill="#13243b" rx="6" />
              <path d="M24 24V104H296" fill="none" stroke="#94a3b8" />
              <path d={series.data.path} fill="none" stroke={series.color} strokeWidth="2" />
            </svg></div>)}
        <p>Line positions: {varyingLabel} ({line.coordinateUnit}).
          {" "}Vector source {line.vectorSourceHash}; verified samples {vectorSamples.map(part =>
            `${part.name}: ${part.sampleSha256}`).join(" · ") || "authored expression"}.
          {" "}Scalar source {overlay.reference.sceneId} / {overlay.reference.datasetId};
          {" "}verified sample SHA-256 {line.scalarSampleSha256}.</p>
        <details><summary>Aligned sample values and gaps</summary>
          <table><thead><tr><th scope="col">{varyingLabel} ({line.coordinateUnit})</th>
            <th scope="col">Vector {line.vectorChannel} ({line.vectorUnit})</th>
            <th scope="col">{overlay.title} ({line.scalarUnit})</th></tr></thead>
            <tbody>{line.rows.map((row, index) => <tr key={index}>
              <td>{row.coordinate.toPrecision(6)}</td>
              <td data-testid={`linked-vector-sample-${index}`}>
                {row.vector === null ? "gap" : row.vector.toPrecision(6)}</td>
              <td data-testid={`linked-scalar-sample-${index}`}>
                {row.scalar === null ? "gap" : row.scalar.toPrecision(6)}</td>
            </tr>)}</tbody></table>
        </details>
      </>}
    </>}
  </section>;
}
