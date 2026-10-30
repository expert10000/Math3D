import type { Graph2DScientificVolume, VectorField3DDocument,
  VectorField3DOverlayRegion, VectorField3DSliceArtifact } from "@math3d/core";
import { sampleVerifiedComplexRegion, sampleVerifiedScalarRegion,
  sampleVerifiedVectorRegion, sampleCombinedRegion, type FieldStatistics } from
  "./combinedFieldInspection";
import type { LinkedRegionGraphFocus } from "./linkedRegionGraphFocus";
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
  scalarStatus = "", complexStatus = "", linkedRegionFocus = null }: {
  document: VectorField3DDocument; region: VectorField3DOverlayRegion;
  slice?: VectorField3DSliceArtifact | null; vectorPlane?: VectorSliceOverlayPlane | null;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  vectorStatus?: string; scalarStatus?: string; complexStatus?: string;
  linkedRegionFocus?: LinkedRegionGraphFocus | null;
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
  const intersection = linkedRegionFocus?.intersection;
  const subrectangle = intersection && currentDerived?.state === "current" &&
    currentDerived.profiles && slice && vectorPlane && scalarVolume && complexVolumes ? (() => {
      try {
        const raw = sampleCombinedRegion(document, slice, region, vectorPlane,
          scalar.reference, scalarVolume, complex.real, complex.imaginary, complexVolumes);
        const [i0, i1] = intersection.columns, [j0, j1] = intersection.rows;
        const count = (i1 - i0 + 1) * (j1 - j0 + 1);
        const fields = [
          ["vector", raw.cells.vector, raw.summary.vectorUnit],
          ["scalar", raw.cells.scalar, raw.summary.scalarUnit],
          ["complex-magnitude", raw.cells["complex-magnitude"], raw.summary.complexUnit],
          ["complex-phase", raw.cells["complex-phase"], "rad"],
          ["divergence", currentDerived.profiles.divergence.cells,
            currentDerived.profiles.divergence.unit],
          ["curl-magnitude", currentDerived.profiles.curlMagnitude.cells,
            currentDerived.profiles.curlMagnitude.unit] ] as const;
        return { count, fields: fields.map(([name, cells, unit]) => {
          const values: number[] = [];
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const value = cells[i * 17 + j];
            if (value !== null && value !== undefined && Number.isFinite(value))
              values.push(value);
          }
          const mean = !values.length ? null : name === "complex-phase" ?
            Math.atan2(values.reduce((sum, value) => sum + Math.sin(value), 0),
              values.reduce((sum, value) => sum + Math.cos(value), 0)) :
            values.reduce((sum, value) => sum + value, 0) / values.length;
          return { name, unit, available: values.length, gaps: count - values.length,
            mean };
        }) };
      } catch { return null; }
    })() : null;
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
        {" "}{subrectangle.count} lattice positions.</p>
      <ul>{subrectangle.fields.map(field => <li key={field.name}
        data-series={field.name}>{field.name}: {field.available}/{subrectangle.count}
        {" "}available ({field.gaps} gaps), {field.unit}; mean {
          field.mean === null ? "no finite value" : field.mean.toPrecision(6)}.</li>)}</ul>
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
