import { canonicalJsonStringify, VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  type AnalysisResultEnvelope, type Graph2DScientificVolume, type VectorField3DDocument,
  type VectorField3DOverlayRegion, type VectorField3DSliceArtifact } from "@math3d/core";
import { sampleVerifiedComplexRegion, sampleVerifiedScalarRegion,
  sampleVerifiedVectorRegion, sampleCombinedRegion, type FieldStatistics } from
  "./combinedFieldInspection";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
import type { VectorSliceOverlayPlane } from "./scientificSliceOverlay";
import { useEffect, useState } from "react";
import { verifiedCombinedDerivedRegionProfiles } from "./derivedCombinedRegionProfile";
import { summarizeCombinedSubrectangle } from "./combinedSubrectangle";
import type { SavedRegionSourceStatus } from "./checkSavedRegionResultSources";

type DerivedCheck = Readonly<{
  key: string;
  document: VectorField3DDocument;
  region: VectorField3DOverlayRegion;
  state: "checking" | "current" | "withheld";
  profiles?: Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;
  error?: string;
}>;

const formatStatistics = (values: FieldStatistics, unit: string) =>
  `${values.count}/289 samples (${values.gaps} gaps); ${values.mean === null ?
    `no finite values ${unit}` : `mean ${values.mean.toPrecision(5)}, min ${
      values.min!.toPrecision(5)}, max ${values.max!.toPrecision(5)} ${unit}`}`;

export function CombinedOverlayRegionReadout({ document, region, slice = null,
  vectorPlane = null, scalarVolume, complexVolumes, vectorStatus = "",
  scalarStatus = "", complexStatus = "", linkedRegionFocus = null,
  onPublishSubrectangle, savedResults = [], resultStatuses = {} }: {
  document: VectorField3DDocument; region: VectorField3DOverlayRegion;
  slice?: VectorField3DSliceArtifact | null; vectorPlane?: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  vectorStatus?: string; scalarStatus?: string; complexStatus?: string;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
  onPublishSubrectangle?: (region: VectorField3DOverlayRegion,
    focus: LinkedRegionGraphFocus) => Promise<void>;
  savedResults?: readonly AnalysisResultEnvelope[];
  resultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
}) {
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = document.workspace?.complexOverlay?.visible ? document.workspace.complexOverlay : null;
  const selectionKey = JSON.stringify([document.identity.structuralHash,
    document.source.field, document.source.axes, document.source.timeUnit,
    region.normalAxis, region.fixedCoordinate, region.bounds]);
  const [revision, setRevision] = useState(0);
  const [derivedCheck, setDerivedCheck] = useState<DerivedCheck | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState("");
  useEffect(() => {
    if (!scalar || !complex || !region.visible) return;
    let active = true;
    const start = setTimeout(() => {
      if (!active) return;
      setDerivedCheck({ key: selectionKey, document, region, state: "checking" });
      void verifiedCombinedDerivedRegionProfiles(document, region).then(profiles => {
        if (active) setDerivedCheck({ key: selectionKey, document, region,
          state: "current", profiles });
      }).catch(cause => {
        if (active) setDerivedCheck({ key: selectionKey, document, region,
          state: "withheld",
          error: cause instanceof Error ? cause.message : String(cause) });
      });
    }, 0);
    return () => { active = false; clearTimeout(start); };
  }, [document, region, selectionKey, revision, scalar, complex]);
  if (!scalar || !complex || !region.visible) return null;
  const currentDerived = derivedCheck?.key === selectionKey &&
    derivedCheck.document === document && derivedCheck.region === region ?
    derivedCheck : null;
  const derivedText = (channel: "divergence" | "curlMagnitude") =>
    currentDerived?.state === "current" && currentDerived.profiles ?
      `${formatStatistics(currentDerived.profiles[channel],
        currentDerived.profiles[channel].unit)}. Verified vector samples ${
        currentDerived.profiles.samples.map(sample => `${sample.name}: ${
          sample.sampleSha256}`).join(" · ") || "authored expression"}.` :
      currentDerived?.state === "withheld" ?
        `withheld: ${currentDerived.error}` : "Verifying bounded vector stencil…";
  let vectorText = "", scalarText = "", complexText = "";
  try { vectorText = slice && vectorPlane ? (() => {
    const result = sampleVerifiedVectorRegion(document, slice,
      { ...region, vectorChannel: "speed" }, vectorPlane);
    return `${formatStatistics(result.statistics, result.unit)}. Source ${
      slice.sourceHash ?? document.identity.structuralHash}.`;
  })() : vectorStatus || "Waiting for a verified vector plane."; }
  catch (cause) { vectorText = `withheld: ${cause instanceof Error ? cause.message : String(cause)}`; }
  try { scalarText = scalarVolume ?
    `${formatStatistics(sampleVerifiedScalarRegion(region, scalar.reference,
      scalarVolume, document.source.axes), scalar.unit)}. Source ${
      scalar.reference.sceneId} / ${scalar.reference.datasetId}; verified sample ${
      scalarVolume.sampleSha256}.` : scalarStatus || "Verifying scalar source…"; }
  catch (cause) { scalarText = `withheld: ${cause instanceof Error ? cause.message : String(cause)}`; }
  try { complexText = complexVolumes ? (() => {
    const values = sampleVerifiedComplexRegion(region, complex.real,
      complex.imaginary, complexVolumes, document.source.axes);
    return `magnitude ${formatStatistics(values.magnitude, complex.unit)}; ` +
      `phase ${formatStatistics(values.phase, "rad")}. Source ${
        complex.real.sceneId} / ${complex.real.datasetId}; verified real ${
        complexVolumes[0].sampleSha256}; imaginary ${complexVolumes[1].sampleSha256}.`;
  })() : complexStatus || "Verifying complex components…"; }
  catch (cause) { complexText = `withheld: ${cause instanceof Error ? cause.message : String(cause)}`; }
  const intersection = linkedRegionFocus?.intersection;
  const subrectangle = intersection && currentDerived?.state === "current" &&
    currentDerived.profiles && slice && vectorPlane && scalarVolume && complexVolumes ? (() => {
      try {
        const raw = sampleCombinedRegion(document, slice, region, vectorPlane,
          scalar.reference, scalarVolume, complex.real, complex.imaginary, complexVolumes);
        return summarizeCombinedSubrectangle(region, intersection.bounds, {
          vector: raw.cells.vector, scalar: raw.cells.scalar,
          complexMagnitude: raw.cells["complex-magnitude"],
          complexPhase: raw.cells["complex-phase"],
          divergence: currentDerived.profiles.divergence.cells,
          curlMagnitude: currentDerived.profiles.curlMagnitude.cells }, {
          vectorUnit: raw.summary.vectorUnit, scalarUnit: raw.summary.scalarUnit,
          complexUnit: raw.summary.complexUnit,
          divergenceUnit: currentDerived.profiles.divergence.unit,
          curlMagnitudeUnit: currentDerived.profiles.curlMagnitude.unit });
      } catch { return null; }
    })() : null;
  const savedSubrectangle = intersection ? [...savedResults].reverse().find(result =>
    result.provenance.operation.type ===
      VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE &&
    result.provenance.source.documentId === document.identity.id &&
    canonicalJsonStringify(result.provenance.operation.parameters.region) ===
      canonicalJsonStringify(region) &&
    canonicalJsonStringify(result.provenance.operation.parameters.bounds) ===
      canonicalJsonStringify(intersection.bounds) &&
    (result.provenance.operation.parameters.profiles as
      { columnPairId?: string; rowPairId?: string } | undefined)?.columnPairId ===
      intersection.columnPairId &&
    (result.provenance.operation.parameters.profiles as
      { rowPairId?: string } | undefined)?.rowPairId === intersection.rowPairId) : null;
  const savedStatus = savedSubrectangle ?
    resultStatuses[savedSubrectangle.resultId] : undefined;
  return <div role={[vectorText, scalarText, complexText].some(value =>
    /withheld|missing|changed/i.test(value)) || currentDerived?.state === "withheld" ?
    "alert" : "status"}
    data-testid="scientific-combined-region-summary">
    <h5>All visible fields on the same 17 × 17 physical grid</h5>
    <p data-testid="scientific-combined-vector-region">Vector speed: {
      vectorText}</p>
    <p data-testid="scientific-combined-scalar-region">{scalar.title}: {scalarText}</p>
    <p data-testid="scientific-combined-complex-region">{complex.title}: {complexText}</p>
    <p data-testid="scientific-combined-divergence-region">Divergence: {
      derivedText("divergence")}</p>
    <p data-testid="scientific-combined-curl-region">Curl magnitude: {
      derivedText("curlMagnitude")}</p>
    {intersection && (subrectangle ? <div role="status"
      data-testid="scientific-combined-intersection-summary">
      <h5>Verified physical subrectangle</h5>
      <p>Columns {intersection.columns[0] + 1}–{intersection.columns[1] + 1},
        rows {intersection.rows[0] + 1}–{intersection.rows[1] + 1};
        {" "}{subrectangle.sampleCount} lattice positions.</p>
      <ul>{(["vector", "scalar", "complexMagnitude", "complexPhase",
        "divergence", "curlMagnitude"] as const).map(key => {
        const field = subrectangle[key];
        const name = key === "complexMagnitude" ? "complex-magnitude" :
          key === "complexPhase" ? "complex-phase" :
          key === "curlMagnitude" ? "curl-magnitude" : key;
        const unit = key === "vector" ? subrectangle.vectorUnit :
          key === "scalar" ? subrectangle.scalarUnit :
          key === "complexMagnitude" ? subrectangle.complexUnit :
          key === "complexPhase" ? "rad" : key === "divergence" ?
          subrectangle.divergenceUnit : subrectangle.curlMagnitudeUnit;
        return <li key={key} data-series={name}>{name}: {field.count}/{
          subrectangle.sampleCount} available ({field.gaps} gaps), {unit}; {
          field.mean === null ? "no finite mean" : `mean ${field.mean.toPrecision(6)}`}, {
          field.min === null ? "no range" :
            `range ${field.min.toPrecision(6)}–${field.max!.toPrecision(6)} ${unit}`}.</li>;
      })}</ul>
      {onPublishSubrectangle && linkedRegionFocus && <button type="button"
        data-testid="scientific-publish-combined-subrectangle"
        disabled={publishBusy} onClick={() => {
          setPublishBusy(true); setPublishError("");
          void onPublishSubrectangle(region, linkedRegionFocus).catch(cause =>
            setPublishError(cause instanceof Error ? cause.message : String(cause)))
            .finally(() => setPublishBusy(false));
        }}>{publishBusy ? "Verifying six fields…" :
          "Publish subrectangle to Project"}</button>}
      {publishError && <p role="alert" data-testid="scientific-combined-subrectangle-publish-error">{
        publishError}</p>}
      {savedSubrectangle && <p data-testid="scientific-combined-subrectangle-saved-status"
        role="status">Saved Project subrectangle: {typeof savedStatus === "object" &&
          savedStatus.kind === "combined" ?
          `vector ${savedStatus.vector}, scalar ${savedStatus.scalar}, ` +
          `complex magnitude ${savedStatus.complexMagnitude ?? savedStatus.complex}, ` +
          `complex phase ${savedStatus.complexPhase ?? savedStatus.complex}, ` +
          `divergence ${savedStatus.divergence}, curl magnitude ${
            savedStatus.curlMagnitude}` : "checking sources"}.</p>}
    </div> : <p role="alert" data-testid="scientific-combined-intersection-withheld">
      Subrectangle values withheld until the vector, scalar, both complex components,
      and derived stencil verify.</p>)}
    <button type="button" onClick={() => {
      setDerivedCheck(null); setRevision(value => value + 1);
    }}
      disabled={currentDerived?.state === "checking"}>Recheck derived fields</button>
    <p>Each count has its own coverage gaps. A changed source withholds only its field's
      values; the saved rectangle and source references remain in the Project.</p>
  </div>;
}
