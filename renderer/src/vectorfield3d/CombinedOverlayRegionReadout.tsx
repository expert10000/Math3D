import type { Graph2DScientificVolume, VectorField3DDocument,
  VectorField3DOverlayRegion, VectorField3DSliceArtifact } from "@math3d/core";
import { sampleVerifiedComplexRegion, sampleVerifiedScalarRegion,
  sampleVerifiedVectorRegion, type FieldStatistics } from "./combinedFieldInspection";
import type { VectorSliceOverlayPlane } from "./scientificSliceOverlay";
import { useEffect, useState } from "react";
import { verifiedCombinedDerivedRegionProfiles } from "./derivedCombinedRegionProfile";

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
  scalarStatus = "", complexStatus = "" }: {
  document: VectorField3DDocument; region: VectorField3DOverlayRegion;
  slice?: VectorField3DSliceArtifact | null; vectorPlane?: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  vectorStatus?: string; scalarStatus?: string; complexStatus?: string;
}) {
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = document.workspace?.complexOverlay?.visible ? document.workspace.complexOverlay : null;
  const selectionKey = JSON.stringify([document.identity.structuralHash,
    document.source.field, document.source.axes, document.source.timeUnit,
    region.normalAxis, region.fixedCoordinate, region.bounds]);
  const [revision, setRevision] = useState(0);
  const [derivedCheck, setDerivedCheck] = useState<DerivedCheck | null>(null);
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
    <button type="button" onClick={() => {
      setDerivedCheck(null); setRevision(value => value + 1);
    }}
      disabled={currentDerived?.state === "checking"}>Recheck derived fields</button>
    <p>Each count has its own coverage gaps. A changed source withholds only its field's
      values; the saved rectangle and source references remain in the Project.</p>
  </div>;
}
