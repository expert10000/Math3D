import { canonicalJsonStringify, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { type DerivedFieldDocument, type DerivedFieldOperation } from "./derivedFieldDocument";
import { currentProjectDerivedFieldResult, reviewProjectDerivedField,
  type DerivedSourceVerification } from "./projectDerivedFields";
import { parseMath3DProject, serializeMath3DProject, type Math3DProject } from "./math3dProject";
import { isScientificSourceGeneration, matchesScientificSourceGeneration,
  type ScientificSourceGeneration } from "./scientificJobs";
import { normalizeDerivedFieldProfileResult, type DerivedFieldProfileResult } from "./derivedFieldProfileResult";
import type { VectorField3DSliceArtifact } from "./vectorField3DSlices";

export type DerivedProfileTransferEvidence = Readonly<{
  source: ScientificSourceGeneration;
  components: NonNullable<VectorField3DSliceArtifact["verifiedSamples"]>;
}>;
export type DerivedProfileWithheldReason = "not-computed" | "source-changed" |
  "source-unverified" | "source-missing" | "recipe-changed" | "result-mismatch";
export type DerivedProfileProvenance = Readonly<{
  profileId: StableDocumentId;
  title: string;
  status: "current" | "withheld";
  reason: DerivedProfileWithheldReason | null;
  source: Readonly<{ documentId: StableDocumentId; revision: number;
    structuralHash: StructuralHash;
    currentRevision: number | null; currentStructuralHash: StructuralHash | null }>;
  operations: readonly Readonly<{ documentId: StableDocumentId;
    revision: number; structuralHash: StructuralHash;
    operation: DerivedFieldOperation }>[];
  plane: Readonly<{ axis: string; unit: string; coordinate: number }>;
  line: Readonly<{ varyingAxis: string; varyingUnit: string;
    fixedAxis: string; fixedUnit: string; fixedCoordinate: number;
    extent: readonly [number, number]; samples: number; interpolation: "linear" }>;
  outputUnit: string;
  /** A method is reported only when a GF-04 result actually supplied one. */
  method: DerivedFieldProfileResult["method"] | null;
  availableRows: number;
  /** Present only for matching verified scientific-bundle transfer evidence. */
  coverage?: DerivedProfileTransferEvidence["components"];
}>;

const transferIsValid = (evidence: DerivedProfileTransferEvidence): boolean =>
  isScientificSourceGeneration(evidence.source) &&
  Array.isArray(evidence.components) && evidence.components.length === 3 &&
  new Set(evidence.components.map(part => part.name)).size === 3 &&
  evidence.components.every(part => typeof part.name === "string" && !!part.name &&
    /^[a-f0-9]{64}$/.test(part.sampleSha256) &&
    (part.verifiedChunks === undefined && part.totalChunks === undefined ||
      Number.isSafeInteger(part.verifiedChunks) && Number.isSafeInteger(part.totalChunks) &&
      part.verifiedChunks! > 0 && part.verifiedChunks! <= part.totalChunks!) &&
    (part.verifiedTiles === undefined && part.totalTiles === undefined ||
      Number.isSafeInteger(part.verifiedTiles) && Number.isSafeInteger(part.totalTiles) &&
      part.verifiedTiles! > 0 && part.verifiedTiles! <= part.totalTiles!));

/** One provenance projection for Graphs and Explorer. It never verifies source bytes itself. */
export const buildDerivedProfileProvenance = (project: Math3DProject, profileId: string,
  options: { verifySource: DerivedSourceVerification; result?: DerivedFieldProfileResult | null;
    transfer?: DerivedProfileTransferEvidence | null }): DerivedProfileProvenance => {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const byId = new Map<string, DerivedFieldDocument>((current.workspace.derivedFields ?? [])
    .map(document => [document.identity.id, document]));
  const profile = byId.get(profileId);
  const plane = profile?.input.kind === "derived" ? byId.get(profile.input.documentId) : null;
  const magnitude = plane?.input.kind === "derived" ? byId.get(plane.input.documentId) : null;
  if (!profile || profile.operation.kind !== "line-profile" ||
      !plane || plane.operation.kind !== "plane-slice" ||
      !magnitude || magnitude.operation.kind !== "vector-magnitude" ||
      magnitude.input.kind !== "vector3d")
    throw new TypeError("A saved magnitude, plane and line profile chain is required.");
  const sourceInput = magnitude.input;
  const sourceEntry = current.workspace.entries.find(entry => entry.module === "vector3d" &&
    entry.expected.id === sourceInput.documentId);
  const review = reviewProjectDerivedField(current, profileId, options.verifySource);
  const result = options.result ?? null;
  const accepted = result && currentProjectDerivedFieldResult(current, profileId,
    { cacheKey: result.cacheKey, value: result }, options.verifySource);
  const checkedResult = result ? normalizeDerivedFieldProfileResult(result) : null;
  const resultMatches = accepted && checkedResult?.ok && result?.profileId === profileId &&
    matchesScientificSourceGeneration(result.source, {
      documentId: sourceInput.documentId, revision: sourceInput.revision,
      structuralHash: sourceInput.structuralHash, generation: sourceInput.revision }) &&
    result.axis.name === profile.output.axes[0]?.name &&
    result.axis.unit === profile.output.axes[0]?.unit &&
    result.axis.min === profile.output.axes[0]?.min &&
    result.axis.max === profile.output.axes[0]?.max &&
    result.unit === profile.output.unit &&
    result.rows.length === profile.operation.samples;
  const ready = review.status === "current" && !!resultMatches;
  const sourceChanged = review.status === "stale" && !!sourceEntry &&
    (sourceEntry.expected.revision !== sourceInput.revision ||
      sourceEntry.expected.structuralHash !== sourceInput.structuralHash);
  const reason: DerivedProfileWithheldReason | null = ready ? null :
    review.status === "missing" ? "source-missing" :
    review.status === "unverified" ? "source-unverified" :
    sourceChanged ? "source-changed" :
    review.status === "stale" ? "recipe-changed" :
    result ? "result-mismatch" : "not-computed";
  const normalAxis = plane.operation.normalAxis;
  const varyingAxis = profile.operation.varyingAxis;
  const normal = magnitude.input.shape.axes.find(axis => axis.index === normalAxis)!;
  const varying = plane.output.axes.find(axis => axis.index === varyingAxis)!;
  const fixed = plane.output.axes.find(axis => axis.index !== varyingAxis)!;
  const sourceDocument = sourceEntry?.replay === null &&
    sourceEntry.checkpoint.format === "math3d.vector-field3d-document" ?
      sourceEntry.checkpoint : null;
  const suppliedTransfer = options.transfer ?? (result?.verifiedSamples ?
    { source: result.source, components: result.verifiedSamples } : null);
  const coverage = ready &&
    sourceDocument?.source.field.kind === "scientific-bundle" &&
    suppliedTransfer && transferIsValid(suppliedTransfer) &&
    matchesScientificSourceGeneration(suppliedTransfer.source, {
      documentId: sourceDocument.identity.id, revision: sourceDocument.identity.revision,
      structuralHash: sourceDocument.identity.structuralHash,
      generation: sourceDocument.identity.revision }) ?
      JSON.parse(canonicalJsonStringify(suppliedTransfer.components)) as
        DerivedProfileTransferEvidence["components"] : undefined;
  return {
    profileId: profile.identity.id, title: profile.metadata.title,
    status: ready ? "current" : "withheld", reason,
    source: { documentId: sourceInput.documentId, revision: sourceInput.revision,
      structuralHash: sourceInput.structuralHash,
      currentRevision: sourceEntry?.expected.revision ?? null,
      currentStructuralHash: sourceEntry?.expected.structuralHash ?? null },
    operations: [magnitude, plane, profile].map(document => ({
      documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash, operation: document.operation })),
    plane: { axis: normal.name, unit: normal.unit, coordinate: plane.operation.coordinate },
    line: { varyingAxis: varying.name, varyingUnit: varying.unit,
      fixedAxis: fixed.name, fixedUnit: fixed.unit,
      fixedCoordinate: profile.operation.fixedCoordinate,
      extent: profile.operation.extent, samples: profile.operation.samples,
      interpolation: profile.operation.interpolation },
    outputUnit: profile.output.unit, method: result?.method ?? null,
    availableRows: ready ? result!.rows.length : 0,
    ...(coverage ? { coverage } : {}),
  };
};
