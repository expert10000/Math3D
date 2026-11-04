import { describe, expect, it } from "vitest";
import { createQuantumSceneDocument, instantiateMath3DProjectTemplate, parseMath3DProject,
  serializeMath3DProject, type ProjectQuantumSceneReference } from "@math3d/core";
import { admitVerifiedQwzStudy } from "./quantumStudyAdmission";

const runId = "run-study";
const resultSha256 = "9".repeat(64);
const references: ProjectQuantumSceneReference[] = ["curvature", "bands"].map((role, index) => ({
  format: "quantum-scene/v1", title: role, directory: `C:\\study\\${role}.qscene`, sceneFingerprint: String(index + 1).repeat(64),
}));
const documents = references.map((reference, index) => createQuantumSceneDocument({
  sceneSchema: "quantum-scene/v1", sceneId: index ? `${runId}-bands` : runId,
  sceneFingerprint: reference.sceneFingerprint,
  provenance: { runId, resultSha256, model: "qwz", engine: "native", engineVersion: "1", adapter: "qvis/1" },
  coordinates: { axes: ["kx", "ky", "z"], units: ["rad", "rad", "1"], handedness: "right" },
  datasets: [{ id: "positions", sha256: "a".repeat(64), count: 2, components: 3, unit: "1", bytes: 48 }],
  objects: [{ id: index ? "band-0" : "berry-curvature", kind: "mesh", label: reference.title }],
}, reference.directory, reference.title));

describe("exact QWZ study admission", () => {
  it("stages two linked views beside native Geometry and roundtrips the Project", async () => {
    const base = instantiateMath3DProjectTemplate("geometry-note-pins", "qwz-study-admission");
    const handoff = { runId, resultSha256, references };
    const verify = async (reference: ProjectQuantumSceneReference) => documents.find(item =>
      item.source.sceneFingerprint === reference.sceneFingerprint)!;
    const admitted = parseMath3DProject(serializeMath3DProject(await admitVerifiedQwzStudy(base, handoff, verify)));
    expect(admitted.workspace.entries.some(entry => entry.module === "geometry")).toBe(true);
    const quantum = admitted.workspace.entries.filter(entry => entry.module === "quantum")
      .map(entry => entry.checkpoint).filter(entry => entry.format === "math3d.quantum-scene-document");
    expect(quantum).toHaveLength(2);
    expect(quantum.every(item => item.linkedViews?.length === 1)).toBe(true);
    expect((await admitVerifiedQwzStudy(admitted, handoff, verify)).workspace.entries).toHaveLength(admitted.workspace.entries.length);
  });

  it("rejects a similarly titled scene with a different exact result before altering the Project", async () => {
    const base = instantiateMath3DProjectTemplate("geometry-note-pins", "qwz-study-refusal");
    const original = serializeMath3DProject(base);
    await expect(admitVerifiedQwzStudy(base, { runId, resultSha256, references }, async reference => {
      const found = documents.find(item => item.source.sceneFingerprint === reference.sceneFingerprint)!;
      return reference === references[1] ? createQuantumSceneDocument({ ...found.source,
        provenance: { ...found.source.provenance, resultSha256: "0".repeat(64) } },
        found.location.directory, found.metadata.title) : found;
    })).rejects.toThrow(/declared run/);
    expect(serializeMath3DProject(base)).toBe(original);
  });
});
