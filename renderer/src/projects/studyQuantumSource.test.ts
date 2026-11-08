import { describe, expect, it } from "vitest";
import { createQuantumSceneDocument, instantiateMath3DProjectTemplate,
  upsertMath3DProjectQuantumScene } from "@math3d/core";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";
import { openVerifiedStudyQuantumScene } from "./studyQuantumSource";

const source = {
  sceneSchema: "quantum-scene/v1" as const, sceneId: "qwz-curvature",
  sceneFingerprint: "a".repeat(64),
  provenance: { runId: "run-qwz", resultSha256: "b".repeat(64), model: "qwz",
    engine: "native", engineVersion: "1", adapter: "qvis/1" as const },
  coordinates: { axes: ["kx", "ky", "Berry curvature"] as [string, string, string],
    units: ["rad", "rad", "1"] as [string, string, string], handedness: "right" as const },
  datasets: [{ id: "coordinates", sha256: "c".repeat(64), count: 2, components: 3, unit: "rad", bytes: 48 }],
  objects: [{ id: "berry-curvature", kind: "mesh", label: "Berry curvature" }],
};
const directory = "C:\\qwz\\curvature.qscene";
const document = createQuantumSceneDocument(source, directory, "QWZ curvature");
const project = upsertMath3DProjectQuantumScene(instantiateMath3DProjectTemplate("geometry-note-pins", "qwz-source-check"), {
  format: source.sceneSchema, title: "QWZ curvature", directory, sceneFingerprint: source.sceneFingerprint,
});
const opened = { ok: true, canceled: false, directory,
  reference: { directory, sceneFingerprint: source.sceneFingerprint },
  document: { title: "QWZ curvature", geometry: { points: [], segments: [], triangles: [] }, cameras: [],
    extensions: { "quantum-scene/v1": { scene: { schema: source.sceneSchema, id: source.sceneId,
      title: "QWZ curvature", provenance: source.provenance, coordinates: source.coordinates,
      datasets: source.datasets, objects: source.objects } } } },
  remembered: true, mappedObjectIds: [], deferredObjectIds: [], deferredFieldIds: [],
} as Extract<QuantumSceneOpenResponse, { ok: true }>;

describe("Study quantum source read-back gate", () => {
  it("returns only the independently verified exact scene", async () => {
    await expect(openVerifiedStudyQuantumScene(project, document, async () => opened)).resolves.toEqual(opened);
  });
  it("withholds missing hosts, moved references and changed source metadata", async () => {
    await expect(openVerifiedStudyQuantumScene(project, document, undefined)).rejects.toThrow(/unavailable/);
    await expect(openVerifiedStudyQuantumScene({ ...project, quantumScenes: [] }, document,
      async () => opened)).rejects.toThrow(/unavailable/);
    await expect(openVerifiedStudyQuantumScene(project, document, async () => ({ ...opened,
      reference: { ...opened.reference, sceneFingerprint: "d".repeat(64) } }))).rejects.toThrow(/changed/);
    const altered = { ...opened, document: { ...opened.document, extensions: {
      "quantum-scene/v1": { scene: { schema: source.sceneSchema, id: source.sceneId,
        title: "QWZ curvature", provenance: { ...source.provenance, resultSha256: "d".repeat(64) },
        coordinates: source.coordinates, datasets: source.datasets, objects: source.objects } } } } };
    await expect(openVerifiedStudyQuantumScene(project, document, async () => altered)).rejects.toThrow(/changed/);
  });
});
