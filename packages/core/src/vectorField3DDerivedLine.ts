import { canonicalJsonStringify, sha256Checksum } from "./documentIdentity";
import { graph2DPointDomain, type Graph2DPointRow } from "./graph2dPointSeries";
import { validGraph2DDerivedFieldOrigin, type Graph2DDerivedFieldOrigin } from "./graph2dDocument";
import { serializeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import type { VectorField3DSliceArtifact } from "./vectorField3DSlices";

export type VectorField3DDerivedLine = Readonly<{
  label: string; rows: readonly Graph2DPointRow[]; domain: ReturnType<typeof graph2DPointDomain>;
  origin: Graph2DDerivedFieldOrigin;
}>;

export function createVectorField3DDerivedLine(document: VectorField3DDocument,
  slice: VectorField3DSliceArtifact, varyingAxis: 0 | 1 | 2,
  profileFixedCoordinate: number): VectorField3DDerivedLine {
  if (document.source.field.kind !== "scientific-bundle" ||
    !["divergence", "curl-x", "curl-y", "curl-z", "grad-speed-x", "grad-speed-y",
      "grad-speed-z", "grad-speed-magnitude", "laplacian-speed"].includes(slice.channel) ||
    !slice.verifiedSamples || slice.verifiedSamples.length !== 3 || !slice.sourceHash ||
    slice.source.documentId !== document.identity.id ||
    slice.source.structuralHash !== document.identity.structuralHash ||
    !slice.planeAxes.includes(varyingAxis) ||
    !Number.isFinite(profileFixedCoordinate))
    throw new TypeError("Choose a current verified derived scientific slice and line.");
  const direction = slice.planeAxes.indexOf(varyingAxis);
  const fixedDirection = 1 - direction;
  const fixedIndex = slice.coordinates[fixedDirection]!.findIndex(value =>
    Math.abs(value - profileFixedCoordinate) <= Math.max(1, Math.abs(value)) * 1e-10);
  if (fixedIndex < 0) throw new RangeError("Profile coordinate is outside the verified slice lattice.");
  const rows: Graph2DPointRow[] = slice.coordinates[direction]!.map((x, index) => ({
    id: `row_${index + 1}`, x,
    y: (direction === 0 ? slice.values[index * slice.shape[1] + fixedIndex] :
      slice.values[fixedIndex * slice.shape[1] + index]) ?? null,
  }));
  if (rows.filter(row => row.y !== null).length < 2)
    throw new RangeError("Derived profile needs at least two finite samples.");
  const { workspace: _workspace, ...sourceDocument } = document;
  const origin: Graph2DDerivedFieldOrigin = {
    kind: "vector-field3d-derived-line", sourceDocumentJson: serializeVectorField3DDocument(sourceDocument),
    operation: slice.channel as Graph2DDerivedFieldOrigin["operation"],
    normalAxis: slice.normalAxis, fixedCoordinate: slice.fixedCoordinate,
    varyingAxis, profileFixedCoordinate,
    ...(slice.stencilGrid === "source" ? { stencilGrid: "source" as const } : {}),
    xName: document.source.axes[varyingAxis].label,
    xUnit: document.source.axes[varyingAxis].unit, yUnit: slice.unit,
    sourceHash: slice.sourceHash,
    lineSha256: sha256Checksum(new TextEncoder().encode(canonicalJsonStringify(rows))),
    verifiedSamples: slice.verifiedSamples,
  };
  if (!validGraph2DDerivedFieldOrigin(origin)) throw new TypeError("Derived line provenance is invalid.");
  const fixedAxis = slice.planeAxes[fixedDirection]!;
  return { label: `${slice.channel} vs ${origin.xName} (${document.source.axes[fixedAxis].label}=${
    profileFixedCoordinate} ${document.source.axes[fixedAxis].unit}; ${
    document.source.axes[slice.normalAxis].label}=${slice.fixedCoordinate} ${slice.fixedUnit})`,
    rows, domain: graph2DPointDomain(rows), origin };
}
