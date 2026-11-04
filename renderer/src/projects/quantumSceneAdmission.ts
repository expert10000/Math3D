import { canonicalJsonStringify, createQuantumFieldDocument, createQuantumSceneDocument, type QuantumFieldDocument,
  type Math3DProject, type ProjectQuantumSceneReference,
  type QuantumSceneDocument, type QuantumSceneDocumentSource } from "@math3d/core";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";

/** Only the Electron importer may supply this response; it has verified the manifest and all dataset bytes. */
export const quantumSceneDocumentFromVerifiedOpen = (opened: Extract<QuantumSceneOpenResponse, { ok: true }>): QuantumSceneDocument => {
  const extension = (opened.document.extensions["quantum-scene/v2"] ?? opened.document.extensions["quantum-scene/v1"]) as { scene?: {
    schema: string; id: string; title: string;
    provenance: { runId: string; model: string; resultSha256: string; engine: string; engineVersion: string; adapter: "qvis/1" };
    coordinates: QuantumSceneDocumentSource["coordinates"];
    datasets: QuantumSceneDocumentSource["datasets"];
    objects: QuantumSceneDocumentSource["objects"];
  } } | undefined;
  const scene = extension?.scene;
  if (!scene || !["quantum-scene/v1", "quantum-scene/v2"].includes(scene.schema)) throw new TypeError("Verified scene metadata is unavailable.");
  const source: QuantumSceneDocumentSource = {
    sceneSchema: scene.schema as QuantumSceneDocumentSource["sceneSchema"], sceneId: scene.id, sceneFingerprint: opened.reference.sceneFingerprint,
    provenance: { runId: scene.provenance.runId, model: scene.provenance.model, resultSha256: scene.provenance.resultSha256,
      engine: scene.provenance.engine, engineVersion: scene.provenance.engineVersion, adapter: scene.provenance.adapter },
    coordinates: { axes: scene.coordinates.axes, units: scene.coordinates.units, handedness: scene.coordinates.handedness },
    datasets: scene.datasets.map(({ id, sha256, count, components, unit, bytes }) => ({ id, sha256, count, components, unit, bytes })),
    objects: scene.objects.map(({ id, kind, label }) => ({ id, kind, label })),
  };
  return createQuantumSceneDocument(source, opened.reference.directory, scene.title);
};

/** SSR-compatible hydrogen grid, still backed by the verified .qscene reader. */
export const quantumFieldDocumentFromVerifiedOpen = (opened: Extract<QuantumSceneOpenResponse, { ok: true }>): QuantumFieldDocument => {
  const sceneDocument = quantumSceneDocumentFromVerifiedOpen(opened);
  const scene = (opened.document.extensions[sceneDocument.source.sceneSchema] as { scene?: {
    fields?: { id: string; label: string; kind: "complex-field"; real: string; imaginary: string;
      grid: { shape: [number, number, number]; origin: [number, number, number]; spacing: [number, number, number]; order: string } }[];
    objects: unknown[]; datasets: unknown[]; coordinates: { axes: [string, string, string]; units: [string, string, string] };
  } })?.scene;
  const field = scene?.fields?.[0];
  if (sceneDocument.source.sceneSchema !== "quantum-scene/v1" || scene?.objects.length !== 0 ||
      scene?.datasets.length !== 2 || scene.fields?.length !== 1 || field?.kind !== "complex-field" ||
      field.grid.order !== "xyz-z-fastest" || scene.coordinates.axes.join(",") !== "x,y,z")
    throw new TypeError("Only a single regular hydrogen complex field has an approved SSR mapping.");
  const real = sceneDocument.source.datasets.find(dataset => dataset.id === field.real);
  if (!real || !sceneDocument.source.datasets.some(dataset => dataset.id === field.imaginary && dataset.unit === real.unit))
    throw new TypeError("Verified hydrogen components or units are unavailable.");
  return createQuantumFieldDocument({ scene: sceneDocument.source,
    field: { id: field.id, label: field.label, kind: field.kind, real: field.real,
      imaginary: field.imaginary, shape: field.grid.shape, origin: field.grid.origin,
      spacing: field.grid.spacing, amplitudeUnit: real.unit },
    mapping: { schema: "scientific-scene/v1", coordinateSystemId: "field-grid", order: "last-axis-fastest",
      axes: scene.coordinates.axes, units: scene.coordinates.units } }, opened.reference.directory, field.label);
};

/** Preflight is read-only. The caller commits the Project only after every source verifies. */
export const verifyProjectQuantumSceneDocuments = async (project: Math3DProject,
  verify: ((reference: ProjectQuantumSceneReference) => Promise<QuantumSceneDocument>) | undefined): Promise<void> => {
  for (const entry of project.workspace.entries.filter((item) => item.module === "quantum")) {
    const checkpoint = entry.checkpoint;
    if (!verify || checkpoint.format !== "math3d.quantum-scene-document")
      throw new TypeError("The quantum-scene verifier is unavailable on this host.");
    const reference = project.quantumScenes?.find((item) => item.sceneFingerprint === checkpoint.source.sceneFingerprint);
    if (!reference) throw new TypeError("The quantum-scene source link is missing.");
    const verified = await verify(reference);
    if (canonicalJsonStringify(verified.source) !== canonicalJsonStringify(checkpoint.source) ||
      verified.location.directory !== checkpoint.location.directory)
      throw new TypeError("The quantum-scene document no longer matches its verified source.");
  }
  for (const entry of project.workspace.entries.filter(item => item.module === "field" &&
    item.checkpoint.format === "math3d.quantum-field-document")) {
    const checkpoint = entry.checkpoint;
    if (checkpoint.format !== "math3d.quantum-field-document" || !verify)
      throw new TypeError("The quantum field source verifier is unavailable on this host.");
    const reference = project.quantumScenes?.find(item =>
      item.sceneFingerprint === checkpoint.source.scene.sceneFingerprint);
    if (!reference) throw new TypeError("The quantum field source link is missing.");
    const verified = await verify(reference);
    if (canonicalJsonStringify(verified.source) !== canonicalJsonStringify(checkpoint.source.scene) ||
        verified.location.directory !== checkpoint.location.directory)
      throw new TypeError("The quantum field document no longer matches its verified source.");
  }
};
