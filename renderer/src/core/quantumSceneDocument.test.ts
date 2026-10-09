import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createQuantumSceneDocument, normalizeQuantumSceneDocument,
  parseMath3DProject, relocateQuantumSceneDocument, replayMixedWorkspaceDocument, serializeMath3DProject,
  upsertMath3DProjectQuantumScene, replaceMath3DProjectWorkspace,
  type QuantumSceneDocumentSource } from "@math3d/core";

const source: QuantumSceneDocumentSource = {
  sceneSchema: "quantum-scene/v1", sceneId: "scene-1", sceneFingerprint: "a".repeat(64),
  provenance: { runId: "run-1", model: "two_level", resultSha256: "b".repeat(64), engine: "QuTiP", engineVersion: "5.2", adapter: "qvis/1" },
  coordinates: { axes: ["x", "y", "z"], units: ["1", "1", "1"], handedness: "right" },
  datasets: [{ id: "points", sha256: "c".repeat(64), count: 2, components: 3, unit: "1", bytes: 48 }],
  objects: [{ id: "orbit", kind: "polyline", label: "Bloch orbit" }],
};

describe("compact quantum scene Project document", () => {
  it("round-trips as a distinct read-only mixed-workspace module", () => {
    const document = createQuantumSceneDocument(source, "C:\\scene.qscene", "Scene");
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "quantum", checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const base = createMath3DProject(createMixedWorkspaceDocument({ ...workspace, entries: [], activeDocumentIds: [] }), { stableKey: "quantum", title: "Quantum" });
    const linked = upsertMath3DProjectQuantumScene(base, { format: "quantum-scene/v1", title: "Scene", directory: document.location.directory, sceneFingerprint: source.sceneFingerprint });
    const project = parseMath3DProject(serializeMath3DProject(replaceMath3DProjectWorkspace(linked, workspace)));
    expect(replayMixedWorkspaceDocument(project.workspace).get(document.identity.id)).toEqual(document);
    expect(serializeMath3DProject(project)).not.toContain("Float64Array");
  });

  it("keeps scientific identity across a path relink, and rejects descriptor tampering", () => {
    const document = createQuantumSceneDocument(source, "C:\\old.qscene", "Scene");
    const moved = relocateQuantumSceneDocument(document, "D:\\new.qscene");
    expect(moved.identity).toEqual(document.identity);
    expect(normalizeQuantumSceneDocument({ ...moved, source: { ...source, sceneId: "forged" } }).ok).toBe(false);
    expect(normalizeQuantumSceneDocument({ ...moved, source: { ...source, datasets: [{ ...source.datasets[0], bytes: -1 }] } }).ok).toBe(false);
    expect(normalizeQuantumSceneDocument({ ...moved, source: { ...source, datasets: [{ ...source.datasets[0], count: 3 }] } }).ok).toBe(false);
    expect(normalizeQuantumSceneDocument({ ...moved, source: { ...source, provenance: { ...source.provenance, adapter: "other" } } }).ok).toBe(false);
  });
});
