import { canonicalJsonStringify,
  createVectorField3DRegionResult,
  reverifyVectorField3DRegionResult, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE,
  type AnalysisResultEnvelope, type Graph2DScientificVolume, type VectorField3DDocument,
  type VectorField3DOverlayRegion, type VectorField3DSliceArtifact } from "@math3d/core";
import { useState } from "react";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";
import { sampleOverlayRegion, type OverlayRegionSummary,
  type VectorSliceOverlayPlane } from "./scientificSliceOverlay";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import type { Graph2DLinkedRegionSelection } from "@math3d/core";
import { CombinedOverlayRegionReadout } from "./CombinedOverlayRegionReadout";
import { sampleCombinedRegion, type CombinedRegionInspection } from
  "./combinedFieldInspection";
import { VectorDerivedRegionView } from "./VectorDerivedRegionView";
import { VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE } from "@math3d/core";

export function OverlayRegionView({ document, slice, region, vectorPlane, scalarVolume,
  complexVolumes, vectorSamples, status, vectorStatus = "", scalarStatus = "", complexStatus = "",
  onChange, onStartSelection, selecting,
  savedResults = [], resultStatuses = {}, onSaveResult, onSendToGraphs,
  onSendCombinedToGraphs, onPublishCombined,
  onSendVectorDerivedToGraphs, onPublishVectorDerived,
  regionBusy = false, linkedRegionFocus = null, graphSelectionMode = null,
  graphSelectionAxis = 0, graphSelectionFirstX = null,
  graphSelectionBusy = false, graphSelectionError = "",
  onGraphSelectionMode, subrectangleSelecting = false, subrectangleFirst = null,
  subrectangleProposal = null, subrectangleBusy = false, subrectangleError = "",
  onSubrectangleToggle, onSubrectangleConfirm }: {
  document: VectorField3DDocument; slice: VectorField3DSliceArtifact;
  region: VectorField3DOverlayRegion | null;
  vectorPlane: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[];
  status: string; onChange: (region: VectorField3DOverlayRegion | null) => void;
  vectorStatus?: string; scalarStatus?: string; complexStatus?: string;
  onStartSelection: () => void; selecting: boolean;
  savedResults?: readonly AnalysisResultEnvelope[];
  resultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  onSaveResult?: (result: AnalysisResultEnvelope) => void;
  onSendToGraphs?: (region: VectorField3DOverlayRegion, summary: OverlayRegionSummary,
    vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
    overlaySamples: readonly Readonly<{ name: string; sampleSha256: string }>[]) => void;
  onSendCombinedToGraphs?: (region: VectorField3DOverlayRegion,
    inspection: CombinedRegionInspection,
    vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
    scalarSampleSha256: string, realSampleSha256: string,
    imaginarySampleSha256: string, profileAxis?: 0 | 1) => void;
  onPublishCombined?: (region: VectorField3DOverlayRegion,
    inspection: CombinedRegionInspection,
    vectorSamples: readonly Readonly<{ name: string; sampleSha256: string }>[],
    scalarSampleSha256: string, realSampleSha256: string,
    imaginarySampleSha256: string) => Promise<void>;
  onSendVectorDerivedToGraphs?: (region: VectorField3DOverlayRegion) => Promise<void>;
  onPublishVectorDerived?: (region: VectorField3DOverlayRegion) => Promise<void>;
  regionBusy?: boolean;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
  graphSelectionMode?: "point" | "interval" | null;
  graphSelectionAxis?: 0 | 1;
  graphSelectionFirstX?: number | null;
  graphSelectionBusy?: boolean;
  graphSelectionError?: string;
  onGraphSelectionMode?: (mode: Graph2DLinkedRegionSelection["physical"]["kind"] | null,
    profileAxis?: 0 | 1) => void;
  subrectangleSelecting?: boolean;
  subrectangleFirst?: readonly [number, number, number] | null;
  subrectangleProposal?: VectorField3DOverlayRegion["bounds"] | null;
  subrectangleBusy?: boolean;
  subrectangleError?: string;
  onSubrectangleToggle?: () => void;
  onSubrectangleConfirm?: () => void;
}) {
  const [publishError, setPublishError] = useState("");
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = !scalar && document.workspace?.complexOverlay?.visible ?
    { ...document.workspace.complexOverlay,
      mode: (document.workspace.complexOverlay.mode === "phase-contours" ?
        "phase" : document.workspace.complexOverlay.mode) as "phase" | "magnitude" } : null;
  const secondaryComplex = scalar && document.workspace?.complexOverlay?.visible ?
    document.workspace.complexOverlay : null;
  if (!scalar && !complex) {
    const saved = [...savedResults].reverse().find(result =>
      result.provenance.operation.type === VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE &&
      result.provenance.source.documentId === document.identity.id && region &&
      canonicalJsonStringify(result.provenance.operation.parameters.region) ===
        canonicalJsonStringify(region));
    return <VectorDerivedRegionView document={document} slice={slice} region={region}
      onChange={onChange} onStartSelection={onStartSelection} selecting={selecting}
      busy={regionBusy} onPublish={onPublishVectorDerived}
      onSendToGraphs={onSendVectorDerivedToGraphs}
      linkedRegionFocus={linkedRegionFocus}
      graphSelectionMode={graphSelectionMode}
      graphSelectionFirstX={graphSelectionFirstX}
      graphSelectionBusy={graphSelectionBusy}
      graphSelectionError={graphSelectionError}
      onGraphSelectionMode={onGraphSelectionMode}
      savedStatus={saved ? resultStatuses[saved.resultId] ?? "checking" : undefined} />;
  }
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
  let combined: CombinedRegionInspection | null = null;
  let combinedError = "";
  if (selected && region?.visible && secondaryComplex && vectorPlane && slice &&
      scalarVolume && complexVolumes) {
    try { combined = sampleCombinedRegion(document, slice, region, vectorPlane,
      scalar!.reference, scalarVolume, secondaryComplex.real,
      secondaryComplex.imaginary, complexVolumes); }
    catch (cause) { combinedError = cause instanceof Error ? cause.message : String(cause); }
  }
  const labels = slice.planeAxes.map(axis => document.source.axes[axis]!.label);
  const units = slice.planeAxes.map(axis => document.source.axes[axis]!.unit);
  const format = (value: number) => value.toPrecision(5);
  const saved = [...savedResults].reverse().find(result =>
    result.provenance.operation.type === (secondaryComplex ?
      VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE : VECTOR_FIELD3D_REGION_RESULT_TYPE) &&
    result.provenance.source.documentId === document.identity.id && region &&
    result.provenance.operation.parameters.region &&
    canonicalJsonStringify(result.provenance.operation.parameters.region) ===
      canonicalJsonStringify(region));
  const overlaySamples = complex && complexVolumes ? [
    { name: "real", sampleSha256: complexVolumes[0].sampleSha256 },
    { name: "imaginary", sampleSha256: complexVolumes[1].sampleSha256 }] :
    scalar && scalarVolume ? [{ name: scalar.reference.component,
      sampleSha256: scalarVolume.sampleSha256 }] : [];
  const focusedRows = summary && linkedRegionFocus?.profileAxis === 0 ? summary.profileRows.slice(
    linkedRegionFocus.columns[0], linkedRegionFocus.columns[1] + 1) : null;
  const focusedVectorCount = focusedRows?.filter(row => row.vector !== null).length ?? 0;
  const focusedOverlayCount = focusedRows?.filter(row => row.scalar !== null).length ?? 0;
  let savedStatus = "";
  if (saved) {
    const sourceStatus = resultStatuses[saved.resultId] ?? "checking";
    if (typeof sourceStatus === "object" && sourceStatus.kind === "combined") savedStatus =
      `Saved Project region: vector ${sourceStatus.vector}, scalar ${
        sourceStatus.scalar}, complex ${sourceStatus.complex}${sourceStatus.divergence ?
          `, divergence ${sourceStatus.divergence}` : ""}${sourceStatus.curlMagnitude ?
          `, curl magnitude ${sourceStatus.curlMagnitude}` : ""}. Changed layers are withheld.`;
    else if (sourceStatus === "checking") savedStatus = "Checking saved region sources…";
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
    <h4>{secondaryComplex ? "Linked vector + scalar + complex region" :
      `Linked ${complex ? "complex" : "scalar"} + vector region`}</h4>
    {selected && linkedRegionFocus && linkedRegionFocus.profileAxis === 0 &&
      <p data-testid="scientific-region-graph-focus"
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
    {selected && linkedRegionFocus?.combined && <div
      data-testid="scientific-combined-region-graph-focus">
      <h5>Shared Graphs selection across {linkedRegionFocus.combined.length} verified profiles</h5>
      <p>Selected {linkedRegionFocus.profileAxis === 1 ? "rows" : "columns"} {
        linkedRegionFocus.columns[0] + 1}–{linkedRegionFocus.columns[1] + 1}: {
        format(linkedRegionFocus.xBounds[0])} to {format(linkedRegionFocus.xBounds[1])} {
        linkedRegionFocus.xUnit}.</p>
      {combined ? <ul>{linkedRegionFocus.combined.map(item => {
        const derived = item.series === "divergence" || item.series === "curl-magnitude";
        const rows = derived ? item.values.map((value, index) => ({
          id: `checked_${index}`, x: 0, y: value })) :
          (linkedRegionFocus.profileAxis === 1 ? combined.rowProfiles :
            combined.profiles)[item.series as keyof CombinedRegionInspection["profiles"]].slice(
            linkedRegionFocus.columns[0], linkedRegionFocus.columns[1] + 1);
        const gaps = rows.filter(row => row.y === null).length;
        return <li key={item.series} data-series={item.series}>{item.series}: {
          gaps === item.gaps ? `${rows.length - gaps}/${rows.length} ${
            linkedRegionFocus.profileAxis === 1 ? "rows" : "columns"} available ` +
            `(${gaps} gaps), ${item.unit}${derived ?
              " (checked saved profile)" : ""}` :
            "withheld: recomputed gaps differ from the checked Graphs profile"}{
          gaps === item.gaps && rows.length === 1 && rows[0]!.y !== null ?
            `; value ${format(rows[0]!.y!)} ${item.unit}` : ""}.</li>;
      })}</ul> : <p role="alert">Shared selection values withheld until the vector,
        scalar, and both complex components verify. {combinedError}</p>}
    </div>}
    {selected && secondaryComplex && onGraphSelectionMode && <div
      data-testid="scientific-region-to-graphs-selection">
      <p>Choose a physical column, row or strip inside this rectangle to focus its saved Graphs profiles.</p>
      <button type="button" aria-pressed={graphSelectionMode === "point" && graphSelectionAxis === 0}
        disabled={graphSelectionBusy} onClick={() => onGraphSelectionMode("point", 0)}>Select Graphs column</button>
      <button type="button" aria-pressed={graphSelectionMode === "interval" && graphSelectionAxis === 0}
        disabled={graphSelectionBusy} onClick={() => onGraphSelectionMode("interval", 0)}>Select Graphs strip</button>
      <button type="button" aria-pressed={graphSelectionMode === "point" && graphSelectionAxis === 1}
        disabled={graphSelectionBusy} onClick={() => onGraphSelectionMode("point", 1)}>Select Graphs row</button>
      <button type="button" aria-pressed={graphSelectionMode === "interval" && graphSelectionAxis === 1}
        disabled={graphSelectionBusy} onClick={() => onGraphSelectionMode("interval", 1)}>Select Graphs row strip</button>
      {onSubrectangleToggle && <button type="button"
        data-testid="scientific-select-graphs-subrectangle"
        aria-pressed={subrectangleSelecting} disabled={subrectangleBusy}
        onClick={onSubrectangleToggle}>Select Graphs subrectangle on slice</button>}
      {subrectangleSelecting && <div data-testid="scientific-subrectangle-preview" role="status">
        {subrectangleProposal ? <>
          <p>Proposed physical bounds: {labels[0]} {format(subrectangleProposal[0][0])} to{
            " "}{format(subrectangleProposal[0][1])} {units[0]}; {labels[1]}{
            " "}{format(subrectangleProposal[1][0])} to {format(subrectangleProposal[1][1])}{
            " "}{units[1]}.</p>
          <button type="button" data-testid="scientific-confirm-graphs-subrectangle"
            disabled={subrectangleBusy} onClick={onSubrectangleConfirm}>{subrectangleBusy ?
              "Verifying twelve profiles…" : "Focus twelve verified Graphs profiles"}</button>
        </> : <p>{subrectangleFirst ? "Click the opposite corner inside the saved rectangle." :
          "Click the first corner inside the saved rectangle."}</p>}
        <button type="button" disabled={subrectangleBusy} onClick={onSubrectangleToggle}>Cancel subrectangle</button>
      </div>}
      {subrectangleError && <p role="alert" data-testid="scientific-subrectangle-error">{
        subrectangleError}</p>}
      {graphSelectionMode && <button type="button" onClick={() => onGraphSelectionMode(null)}>Cancel selection</button>}
      {graphSelectionMode && <p role="status">{graphSelectionBusy ? "Verifying linked sources…" :
        graphSelectionMode === "point" ? "Click once inside the rectangle." :
          graphSelectionFirstX === null ? "Click the first strip edge inside the rectangle." :
            `First strip edge: ${format(graphSelectionFirstX)} ${units[graphSelectionAxis]}. Click the second edge.`}</p>}
      {graphSelectionError && <p role="alert" data-testid="scientific-region-to-graphs-error">{
        graphSelectionError}</p>}
    </div>}
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
      {region.visible && secondaryComplex && <CombinedOverlayRegionReadout
        document={document} region={region} slice={slice} vectorPlane={vectorPlane}
        linkedRegionFocus={linkedRegionFocus}
        scalarVolume={scalarVolume} complexVolumes={complexVolumes}
        vectorStatus={vectorStatus} scalarStatus={scalarStatus}
        complexStatus={complexStatus} />}
      {region.visible && secondaryComplex && combinedError &&
        <p role="alert">Combined region: {combinedError}</p>}
      {region.visible && !summary && <p role={error ? "alert" : "status"}>
        {error || status || "Reverifying both sources before showing the region…"}</p>}
      {summary && <div role="status" data-testid="scientific-overlay-region-summary">
        {secondaryComplex && <h5>Existing vector + scalar linked pair</h5>}
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
      {onPublishCombined && secondaryComplex && combined && scalarVolume && complexVolumes &&
        <button type="button" data-testid="scientific-region-publish" disabled={regionBusy}
          onClick={() => { setPublishError(""); void onPublishCombined(region, combined!,
            vectorSamples, scalarVolume.sampleSha256,
            complexVolumes[0].sampleSha256, complexVolumes[1].sampleSha256)
            .catch(cause => setPublishError(cause instanceof Error ? cause.message :
              String(cause))); }}>
          {regionBusy ? "Verifying derived fields…" : "Publish all fields, divergence and curl to Project"}
        </button>}
      {onSaveResult && !secondaryComplex && summary?.alignedCount && <button type="button"
        data-testid="scientific-region-publish" onClick={() => {
          try {
            const result = createVectorField3DRegionResult(document, region, summary,
              vectorSamples, overlaySamples);
            onSaveResult(result); setPublishError("");
          } catch (cause) { setPublishError(cause instanceof Error ? cause.message : String(cause)); }
        }}>Publish region result to Project</button>}
      {onSendCombinedToGraphs && secondaryComplex && combined && scalarVolume &&
        complexVolumes && <>
          <button type="button" data-testid="send-linked-region-to-graphs"
            disabled={regionBusy} onClick={() => onSendCombinedToGraphs(region, combined!,
              vectorSamples, scalarVolume.sampleSha256,
              complexVolumes[0].sampleSha256, complexVolumes[1].sampleSha256, 0)}>
            {regionBusy ? "Verifying region…" :
              "Send six aligned column profiles to Graphs (including divergence and curl)"}
          </button>
          <button type="button" data-testid="send-linked-region-rows-to-graphs"
            disabled={regionBusy} onClick={() => onSendCombinedToGraphs(region, combined!,
              vectorSamples, scalarVolume.sampleSha256,
              complexVolumes[0].sampleSha256, complexVolumes[1].sampleSha256, 1)}>
            {regionBusy ? "Verifying region…" : "Send six row profiles to Graphs"}
          </button>
        </>}
      {onSendToGraphs && !secondaryComplex && summary?.alignedCount && <button type="button"
        data-testid="send-linked-region-to-graphs" disabled={regionBusy}
        onClick={() => onSendToGraphs(region, summary!, vectorSamples, overlaySamples)}>
        {regionBusy ? "Verifying region…" : "Send aligned region profile to Graphs"}</button>}
      {publishError && <p role="alert">{publishError}</p>}
      {savedStatus && <p role={savedStatus.includes("withheld") ? "alert" : "status"}
        data-testid="scientific-region-saved-status">{savedStatus}</p>}
    </>}
  </section>;
}
