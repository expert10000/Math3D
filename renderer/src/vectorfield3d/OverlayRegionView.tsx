import { canonicalJsonStringify, createVectorField3DRegionResult,
  reverifyVectorField3DRegionResult, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  type AnalysisResultEnvelope, type Graph2DScientificVolume, type VectorField3DDocument,
  type VectorField3DOverlayRegion, type VectorField3DSliceArtifact } from "@math3d/core";
import { useState } from "react";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";
import { sampleOverlayRegion, type OverlayRegionSummary,
  type VectorSliceOverlayPlane } from "./scientificSliceOverlay";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";

export function OverlayRegionView({ document, slice, region, vectorPlane, scalarVolume,
  complexVolumes, vectorSamples, status, onChange, onStartSelection, selecting,
  savedResults = [], resultStatuses = {}, onSaveResult, onSendToGraphs,
  regionBusy = false, linkedRegionFocus = null }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  region: VectorField3DOverlayRegion | null;
  vectorPlane: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  status: string; onChange: (region: VectorField3DOverlayRegion | null) => void;
  onStartSelection: () => void; selecting: boolean;
  savedResults?: readonly AnalysisResultEnvelope[];
  resultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  onSaveResult?: (result: AnalysisResultEnvelope) => void;
  onSendToGraphs?: (region: VectorField3DOverlayRegion, summary: OverlayRegionSummary,
    vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
    overlaySamples: readonly Readonly<{ name: string; sampleSha256: string }>[]) => void;
  regionBusy?: boolean;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
}) {
  const [publishError, setPublishError] = useState("");
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
  const saved = [...savedResults].reverse().find(result =>
    result.provenance.operation.type === VECTOR_FIELD3D_REGION_RESULT_TYPE &&
    result.provenance.source.documentId === document.identity.id && region &&
    result.provenance.operation.parameters.region &&
    canonicalJsonStringify(result.provenance.operation.parameters.region) ===
      canonicalJsonStringify(region));
  const overlaySamples = complex && complexVolumes ? [
    { name: "real", sampleSha256: complexVolumes[0].sampleSha256 },
    { name: "imaginary", sampleSha256: complexVolumes[1].sampleSha256 }] :
    scalar && scalarVolume ? [{ name: scalar.reference.component,
      sampleSha256: scalarVolume.sampleSha256 }] : [];
  const focusedRows = summary && linkedRegionFocus ? summary.profileRows.slice(
    linkedRegionFocus.columns[0], linkedRegionFocus.columns[1] + 1) : null;
  const focusedVectorCount = focusedRows?.filter(row => row.vector !== null).length ?? 0;
  const focusedOverlayCount = focusedRows?.filter(row => row.scalar !== null).length ?? 0;
  let savedStatus = "";
  if (saved) {
    const sourceStatus = resultStatuses[saved.resultId] ?? "checking";
    if (sourceStatus === "checking") savedStatus = "Checking saved region sources…";
    else if (sourceStatus !== "source-current") savedStatus =
      `Saved Project region withheld: ${sourceStatus} source.`;
    else if (!summary || !region) savedStatus =
      "Saved Project region withheld until the vector slice and overlay are freshly verified.";
    else {
      try {
        reverifyVectorField3DRegionResult(saved, document, region, summary,
          vectorSamples, overlaySamples);
        savedStatus = "Saved Project region current: numerical summary reverified.";
      } catch (cause) { savedStatus = `Saved Project region withheld: ${
        cause instanceof Error ? cause.message : String(cause)}`; }
    }
  }
  return <section aria-label="Linked heatmap and vector region" data-testid="scientific-overlay-region">
    <h4>Linked {complex ? "complex" : "scalar"} + vector region</h4>
    {selected && linkedRegionFocus && <p data-testid="scientific-region-graph-focus"
      role={summary ? "status" : status.includes("withheld") ? "alert" : "status"}>
      Graphs selection: columns {linkedRegionFocus.columns[0] + 1}–{linkedRegionFocus.columns[1] + 1},
      {" "}{format(linkedRegionFocus.xBounds[0])} to
      {" "}{format(linkedRegionFocus.xBounds[1])} {linkedRegionFocus.xUnit}.
      {focusedRows ? <>
        {" "}Graphs profile gaps: vector {linkedRegionFocus.vectorGaps},
        {" "}{complex ? "complex" : "scalar"} {linkedRegionFocus.overlayGaps}.
        {" "}Vector column means: {focusedVectorCount}/{focusedRows.length} available
        {" "}({focusedRows.length - focusedVectorCount} gaps), {linkedRegionFocus.vectorUnit};
        {" "}{complex ? "complex" : "scalar"} column means: {focusedOverlayCount}/{focusedRows.length}
        {" "}available ({focusedRows.length - focusedOverlayCount} gaps),
        {" "}{linkedRegionFocus.overlayUnit}.
        {focusedRows.length === 1 && <>
          {" "}Values: vector {focusedRows[0]!.vector === null ? "gap" :
            `${format(focusedRows[0]!.vector)} ${linkedRegionFocus.vectorUnit}`};
          {" "}{complex ? "complex" : "scalar"} {focusedRows[0]!.scalar === null ? "gap" :
            `${format(focusedRows[0]!.scalar)} ${linkedRegionFocus.overlayUnit}`}.
        </>}
      </> : " Source values are withheld until the vector and overlay verify."}
    </p>}
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
      {onSaveResult && summary?.alignedCount && <button type="button"
        data-testid="scientific-region-publish" onClick={() => {
          try {
            const result = createVectorField3DRegionResult(document, region, summary,
              vectorSamples, overlaySamples);
            onSaveResult(result); setPublishError("");
          } catch (cause) { setPublishError(cause instanceof Error ? cause.message : String(cause)); }
        }}>Publish region result to Project</button>}
      {onSendToGraphs && summary?.alignedCount && <button type="button"
        data-testid="send-linked-region-to-graphs" disabled={regionBusy}
        onClick={() => onSendToGraphs(region, summary!, vectorSamples, overlaySamples)}>
        {regionBusy ? "Verifying region…" : "Send aligned region profile to Graphs"}</button>}
      {publishError && <p role="alert">{publishError}</p>}
      {savedStatus && <p role={savedStatus.includes("withheld") ? "alert" : "status"}
        data-testid="scientific-region-saved-status">{savedStatus}</p>}
    </>}
  </section>;
}
