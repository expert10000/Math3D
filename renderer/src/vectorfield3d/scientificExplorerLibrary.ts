import type { ScientificFieldDocument, ScientificSceneManifest,
  VectorField3DDocument } from "@math3d/core";
import { scientificExplorerEligibility } from "../graph2d/scientificExplorerEligibility";

export type ExplorerLibraryEntry = Readonly<{
  id: string;
  origin: "scene" | "project";
  kind: "vector" | "scalar" | "complex";
  title: string;
  datasetId: string;
  shape: readonly number[];
  unit: string;
  reason: string;
  ready: boolean;
  documentId?: string;
  sceneFingerprint?: string;
}>;

/** Metadata only: samples remain in their verified source bundles. */
export function scientificExplorerLibrary(manifest: ScientificSceneManifest | null,
  vectors: readonly VectorField3DDocument[],
  fields: readonly ScientificFieldDocument[], sceneFingerprint?: string): ExplorerLibraryEntry[] {
  const entries: ExplorerLibraryEntry[] = [];
  for (const vector of vectors) {
    if (vector.source.field.kind !== "scientific-bundle" ||
        entries.some(item => item.documentId === vector.identity.id)) continue;
    const reference = vector.source.field.references[0];
    entries.push({ id: `project:vector:${vector.identity.id}`, origin: "project", kind: "vector",
      title: vector.metadata.title, datasetId: reference.datasetId, shape: reference.shape,
      unit: vector.source.field.componentUnits[0], reason: "Saved Project field", ready: true,
      documentId: vector.identity.id });
  }
  for (const field of fields) {
    if (field.source.reference.shape.length !== 3) continue;
    entries.push({ id: `project:field:${field.identity.id}`, origin: "project",
      kind: field.source.paired ? "complex" : "scalar", title: field.metadata.title,
      datasetId: field.source.reference.datasetId, shape: field.source.reference.shape,
      unit: field.source.quantity.unit, reason: field.source.derivation ?
        "Saved derived Project field" : "Saved Project field", ready: true,
      documentId: field.identity.id });
  }
  if (!manifest) return entries;
  for (const dataset of manifest.datasets) {
    if (dataset.shape.length !== 3) continue;
    const kind = dataset.semanticType === "vector-field" ? "vector" :
      dataset.semanticType === "complex-scalar-field" ? "complex" : "scalar";
    const coordinate = manifest.coordinates.find(item => item.id === dataset.coordinateSystem);
    const regular = coordinate?.kind === "cartesian" && coordinate.axes.length === 3 &&
      dataset.shape.every(size => size >= 2);
    const eligibility = kind === "vector" ? scientificExplorerEligibility(manifest, dataset) : null;
    const ready = kind === "vector" ? !!eligibility?.ready : !!regular;
    entries.push({ id: `scene:${sceneFingerprint ?? manifest.sceneId}:${dataset.id}`,
      origin: "scene", kind, sceneFingerprint,
      title: dataset.quantity.name, datasetId: dataset.id, shape: dataset.shape,
      unit: dataset.quantity.unit,
      reason: kind === "vector" ? eligibility!.reason : ready ?
        "Ready for verified field view" : "Requires a regular 3D Cartesian grid",
      ready });
  }
  return entries;
}
