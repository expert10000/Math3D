import type { ScientificFieldDocument, ScientificSceneManifest,
  ScientificSceneLibraryReference, VectorField3DDocument } from "@math3d/core";
import { scientificSceneLibraryKey } from "@math3d/core";
import { scientificExplorerEligibility } from "../graph2d/scientificExplorerEligibility";

export const BUILTIN_EXPLORER_SCENES = [
  { id: "vortexVolume", title: "Swirling flow", detail: "3D vector · 21 × 21 × 17" },
  { id: "quadraticVolume", title: "Quadratic potential", detail: "3D scalar · 17 × 17 × 17" },
  { id: "complexWaveVolume", title: "Complex wave", detail: "3D complex · 41 × 41 × 17" },
  { id: "vortex80", title: "Generated vortex", detail: "3D vector · 80 × 80 × 80" },
  { id: "burgersMeasured", title: "Measured Burgers vortex",
    detail: "3D vector · 47 × 85 × 55 · BCO-DMO CC BY 4.0" },
] as const;
export type BuiltinExplorerSceneId = typeof BUILTIN_EXPLORER_SCENES[number]["id"];

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
  sceneKey?: string;
  sceneTitle?: string;
  sourceStatus?: "checking" | "current" | "missing" | "changed" | "error";
}>;

export function scientificSceneReferenceFromManifest(manifest: ScientificSceneManifest,
  fingerprint: string, locator: ScientificSceneLibraryReference["locator"]): ScientificSceneLibraryReference {
  const entries = scientificExplorerLibrary(manifest, [], [], fingerprint);
  if (!entries.length) throw new TypeError("This scene has no 3D datasets for Explorer.");
  return { sceneId: manifest.sceneId, title: manifest.title, fingerprint, locator,
    datasets: entries.map(entry => ({ id: entry.datasetId, kind: entry.kind, title: entry.title,
      shape: entry.shape as [number, number, number], unit: entry.unit, ready: entry.ready })) };
}

export function savedScientificExplorerEntries(scenes: readonly ScientificSceneLibraryReference[],
  statuses: Readonly<Record<string, ExplorerLibraryEntry["sourceStatus"]>>): ExplorerLibraryEntry[] {
  return scenes.flatMap(scene => {
    const sceneKey = scientificSceneLibraryKey(scene);
    const sourceStatus = statuses[`${sceneKey}:${scene.fingerprint}`] ?? "checking";
    return scene.datasets.map(dataset => ({
      id: `saved-scene:${sceneKey}:${dataset.id}`, origin: "scene" as const,
      kind: dataset.kind, title: dataset.title, datasetId: dataset.id,
      shape: dataset.shape, unit: dataset.unit, sceneFingerprint: scene.fingerprint,
      sceneKey, sceneTitle: scene.title, sourceStatus,
      ready: dataset.ready && sourceStatus === "current",
      reason: sourceStatus === "current" ? dataset.ready ? "Reference current; field values verify when opened" :
        "Requires a regular 3D Cartesian grid" : sourceStatus === "checking" ?
        "Checking source…" : sourceStatus === "missing" ?
        "Source missing · browse its .sscene folder again" : sourceStatus === "changed" ?
        "Source changed · browse the updated .sscene folder to replace this reference" :
        "Source could not be verified",
    }));
  });
}

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
