import type { Graph2DScientificVolume, VectorField3DDocument } from "@math3d/core";
import type { LinkedExplorerProbe } from "./linkedFieldProbe";
import { sampleVerifiedComplexPoint, sampleVerifiedScalarPoint } from
  "./combinedFieldInspection";

export function CombinedOverlayProbe({ document, probe, scalarVolume, complexVolumes,
  scalarStatus, complexStatus }: {
  document: VectorField3DDocument; probe: LinkedExplorerProbe;
  scalarVolume: Graph2DScientificVolume | null;
  complexVolumes: readonly [Graph2DScientificVolume, Graph2DScientificVolume] | null;
  scalarStatus: string; complexStatus: string;
}) {
  const scalar = document.workspace?.scalarOverlay?.visible ? document.workspace.scalarOverlay : null;
  const complex = document.workspace?.complexOverlay?.visible ? document.workspace.complexOverlay : null;
  if (!scalar && !complex) return null;
  const format = (value: number) => value.toPrecision(7);
  let scalarText = "", complexText = "";
  if (scalar) {
    if (!scalarVolume) scalarText = scalarStatus || "Verifying scalar source…";
    else try {
      const sample = sampleVerifiedScalarPoint(scalar.reference, scalarVolume,
        document.source.axes, probe.point, probe.units);
      scalarText = sample.value === null ? `gap (${sample.status})` :
        `${format(sample.value)} ${scalar.unit}`;
    } catch (cause) { scalarText = `withheld: ${cause instanceof Error ? cause.message : String(cause)}`; }
  }
  if (complex) {
    if (!complexVolumes) complexText = complexStatus || "Verifying complex components…";
    else try {
      const sample = sampleVerifiedComplexPoint(complex.real, complex.imaginary,
        complexVolumes, document.source.axes, probe.point, probe.units);
      complexText = sample.magnitude === null ? `gap (${sample.status})` :
        `real ${format(sample.real!)} ${complex.unit} · imaginary ${format(sample.imaginary!)} ${
          complex.unit} · magnitude ${format(sample.magnitude)} ${complex.unit} · phase ${
          sample.phase === null ? "gap (near-zero magnitude)" : `${format(sample.phase)} rad`}`;
    } catch (cause) { complexText = `withheld: ${cause instanceof Error ? cause.message : String(cause)}`; }
  }
  return <div role={[scalarText, complexText].some(value =>
    /withheld|missing|changed/i.test(value)) ? "alert" : "status"}
    data-testid="scientific-combined-field-probe">
    <h6>Overlay values at this physical point</h6>
    {scalar && <p data-testid="scientific-combined-scalar-point">
      {scalar.title}: {scalarText}.
      {scalarVolume && ` Source ${scalar.reference.sceneId} / ${scalar.reference.datasetId};
        verified sample ${scalarVolume.sampleSha256}.`}</p>}
    {complex && <p data-testid="scientific-combined-complex-point">
      {complex.title}: {complexText}.
      {complexVolumes && ` Source ${complex.real.sceneId} / ${complex.real.datasetId};
        verified real ${complexVolumes[0].sampleSha256}; imaginary ${
          complexVolumes[1].sampleSha256}.`}</p>}
  </div>;
}
