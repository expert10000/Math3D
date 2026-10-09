import { canonicalJsonStringify, createQuantumSceneDocument, type Math3DProject, type ProjectQuantumSceneReference,
  type QuantumSceneDocument, type QuantumSceneDocumentSource } from "@math3d/core";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";

/** Only the Electron importer may supply this response; it has verified the manifest and all dataset bytes. */
export const quantumSceneDocumentFromVerifiedOpen = (opened: Extract<QuantumSceneOpenResponse, { ok: true }>): QuantumSceneDocument => {
  const extension = opened.document.extensions["quantum-scene/v1"] as { scene?: {
    schema: string; id: string; title: string;
    provenance: { runId: string; model: string; resultSha256: string; engine: string; engineVersion: string; adapter: "qvis/1" };
    coordinates: QuantumSceneDocumentSource["coordinates"];
    datasets: QuantumSceneDocumentSource["datasets"];
    objects: QuantumSceneDocumentSource["objects"];
  } } | undefined;
  const scene = extension?.scene;
  if (!scene || scene.schema !== "quantum-scene/v1") throw new TypeError("Verified scene metadata is unavailable.");
  const source: QuantumSceneDocumentSource = {
    sceneSchema: "quantum-scene/v1", sceneId: scene.id, sceneFingerprint: opened.reference.sceneFingerprint,
    provenance: { runId: scene.provenance.runId, model: scene.provenance.model, resultSha256: scene.provenance.resultSha256,
      engine: scene.provenance.engine, engineVersion: scene.provenance.engineVersion, adapter: scene.provenance.adapter },
    coordinates: { axes: scene.coordinates.axes, units: scene.coordinates.units, handedness: scene.coordinates.handedness },
    datasets: scene.datasets.map(({ id, sha256, count, components, unit, bytes }) => ({ id, sha256, count, components, unit, bytes })),
    objects: scene.objects.map(({ id, kind, label }) => ({ id, kind, label })),
  };
  return createQuantumSceneDocument(source, opened.reference.directory, scene.title);
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
};
