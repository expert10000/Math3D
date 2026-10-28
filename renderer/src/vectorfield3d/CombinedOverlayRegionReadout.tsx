import type { Graph2DScientificVolume, VectorField3DDocument,
  VectorField3DOverlayRegion, VectorField3DSliceArtifact } from "@math3d/core";
import { sampleVerifiedComplexRegion, sampleVerifiedScalarRegion,
  sampleVerifiedVectorRegion, type FieldStatistics } from "./combinedFieldInspection";
import type { VectorSliceOverlayPlane } from "./scientificSliceOverlay";

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
  if (!scalar || !complex || !region.visible) return null;
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
    /withheld|missing|changed/i.test(value)) ? "alert" : "status"}
    data-testid="scientific-combined-region-summary">
    <h5>All visible fields on the same 17 × 17 physical grid</h5>
    <p data-testid="scientific-combined-vector-region">Vector speed: {
      vectorText}</p>
    <p data-testid="scientific-combined-scalar-region">{scalar.title}: {scalarText}</p>
    <p data-testid="scientific-combined-complex-region">{complex.title}: {complexText}</p>
    <p>Each count has its own coverage gaps. A changed source withholds only its field's
      values; the saved rectangle and source references remain in the Project.</p>
  </div>;
}
