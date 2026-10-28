import type { Graph2DScientificVolume, VectorField3DDocument,
  VectorField3DOverlayRegion, VectorField3DSliceArtifact } from "@math3d/core";
import { sampleOverlayRegion, type VectorSliceOverlayPlane } from "./scientificSliceOverlay";

export function OverlayRegionView({ document, slice, region, vectorPlane, scalarVolume,
  complexVolumes, vectorSamples, status, onChange, onStartSelection, selecting }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  region: VectorField3DOverlayRegion | null;
  vectorPlane: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  status: string; onChange: (region: VectorField3DOverlayRegion | null) => void;
  onStartSelection: () => void; selecting: boolean;
}) {
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = document.workspace?.complexOverlay?.visible ? document.workspace.complexOverlay : null;
  if (!scalar && !complex) return null;
  const selected = region?.normalAxis === slice.normalAxis &&
    Math.abs(region.fixedCoordinate - slice.fixedCoordinate) < 1e-9;
  let summary: ReturnType<typeof sampleOverlayRegion> | null = null;
  let error = "";
  if (selected && region.visible && vectorPlane &&
      (scalar && scalarVolume || complex && complexVolumes)) {
    try { summary = scalar ? sampleOverlayRegion(document, slice, region, vectorPlane,
      scalar.reference, scalarVolume!, scalar.unit) : sampleOverlayRegion(document, slice, region,
      vectorPlane, complex!.real, complexVolumes![0],
      complex!.mode === "phase" ? "rad" : complex!.unit,
      { imaginaryReference: complex!.imaginary, imaginaryVolume: complexVolumes![1],
        mode: complex!.mode }); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
  const labels = slice.planeAxes.map(axis => document.source.axes[axis]!.label);
  const units = slice.planeAxes.map(axis => document.source.axes[axis]!.unit);
  const format = (value: number) => value.toPrecision(5);
  return <section aria-label="Linked heatmap and vector region" data-testid="scientific-overlay-region">
    <h4>Linked {complex ? "complex" : "scalar"} + vector region</h4>
    <button type="button" aria-pressed={selecting} onClick={onStartSelection}>
      {selecting ? "Click two corners on the slice" : "Select rectangular region"}</button>
    {selected && <>
      <button type="button" onClick={() => onChange(null)}>Remove region</button>
      <label><input type="checkbox" aria-label="Show selected region" checked={region.visible}
        onChange={event => onChange({ ...region, visible: event.target.checked })} />Show region</label>
      <label>Vector quantity <select aria-label="Region vector quantity"
        value={region.vectorChannel} onChange={event => onChange({ ...region,
          vectorChannel: event.target.value as VectorField3DOverlayRegion["vectorChannel"] })}>
        <option value="speed">Speed</option><option value="p">First component</option>
        <option value="q">Second component</option><option value="r">Third component</option>
      </select></label>
      <p>Physical rectangle: {labels[0]} {format(region.bounds[0][0])} to
        {" "}{format(region.bounds[0][1])} {units[0]}; {labels[1]}
        {" "}{format(region.bounds[1][0])} to {format(region.bounds[1][1])} {units[1]};
        {" "}{document.source.axes[slice.normalAxis]!.label} = {format(slice.fixedCoordinate)}
        {" "}{slice.fixedUnit}.</p>
      {region.visible && !summary && <p role={error ? "alert" : "status"}>
        {error || status || "Reverifying both sources before showing the region…"}</p>}
      {summary && <div role="status" data-testid="scientific-overlay-region-summary">
        <p>Aligned physical samples: {summary.alignedCount}/{summary.sampleCount}
          {" "}on a 17 × 17 grid. Vector available: {summary.vectorCount};
          {" "}{complex ? "complex" : "scalar"} available: {summary.scalarCount}.
          {" "}Vector field outside selected area: {format(summary.vectorOutsideAreaPercent)}%.
          {" "}{complex ? "Complex" : "Scalar"} field outside selected area:
          {" "}{format(summary.scalarOutsideAreaPercent)}%.
          {" "}Gaps mark positions outside a field or without finite samples.</p>
        <p>Vector {region.vectorChannel} ({summary.vectorUnit}): {summary.vector ?
          `mean ${format(summary.vector.mean)}, min ${format(summary.vector.min)}, max ${format(summary.vector.max)}` :
          "no values in selected area"}.</p>
        <p>{complex ? `${complex.title} ${complex.mode}` : scalar!.title} ({summary.scalarUnit}): {summary.scalar ?
          `mean ${format(summary.scalar.mean)}, min ${format(summary.scalar.min)}, max ${format(summary.scalar.max)}` :
          "no values in selected area"}.</p>
        <p>Vector source {summary.vectorSourceHash}; verified samples
          {" "}{vectorSamples.map(sample => `${sample.name}: ${sample.sampleSha256}`).join(" · ") ||
            "authored expression"}. {complex ? "Complex" : "Scalar"} source
          {" "}{(complex?.real ?? scalar!.reference).sceneId} /
          {" "}{(complex?.real ?? scalar!.reference).datasetId}; verified sample SHA-256
          {" "}{summary.scalarSampleSha256}.
          {complex && complexVolumes && ` Real ${complexVolumes[0].sampleSha256}; imaginary ${
            complexVolumes[1].sampleSha256}.`}</p>
      </div>}
    </>}
  </section>;
}
