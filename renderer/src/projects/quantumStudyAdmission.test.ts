import { describe, expect, it } from "vitest";
import { createQuantumSceneDocument, createQuantumStudyFromTemplate, normalizeQuantumStudyDocument, deleteProjectDocument, instantiateMath3DProjectTemplate, parseMath3DProject,
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
  it("builds five model-specific layouts without changing source documents", () => {
    const make = (model: string, sceneId: string, fingerprint: string, objectId: string) =>
      createQuantumSceneDocument({ ...documents[0].source, sceneId, sceneFingerprint: fingerprint,
        provenance: { ...documents[0].source.provenance, model },
        objects: [{ id: objectId, kind: "mesh", label: objectId }] }, `C:\\study\\${sceneId}.qscene`, sceneId);
    const pairs = [
      ["qwz", documents[0], documents[1]],
      ["ssh", make("ssh", "ssh-chain", "3".repeat(64), "edge-density"), make("ssh", "ssh-bands", "4".repeat(64), "band-0")],
      ["rice-mele", make("rice_mele_pump", "rm-pump", "5".repeat(64), "pump"), make("rice_mele_pump", "rm-finite-pump", "6".repeat(64), "finite")],
      ["hofstadter", make("hofstadter", "hof-bulk", "7".repeat(64), "band-0"), make("hofstadter", "hof-hofstadter-strip", "8".repeat(64), "strip-left")],
    ] as const;
    for (const [template, first, second] of pairs) {
      const originals = JSON.stringify([first, second]);
      const study = createQuantumStudyFromTemplate(template, first, [first, second]);
      expect(study.templateId).toBe(template);
      expect(normalizeQuantumStudyDocument(study, [first, second]).ok).toBe(true);
      expect(JSON.stringify([first, second])).toBe(originals);
      expect(normalizeQuantumStudyDocument({ ...study, source: { ...study.source, resultSha256: "0".repeat(64) } }, [first, second]).ok).toBe(false);
    }
    const hydrogen = createQuantumSceneDocument({ ...documents[0].source, sceneId: "hydrogen-field",
      sceneFingerprint: "a".repeat(64), provenance: { ...documents[0].source.provenance, model: "hydrogenic" },
      datasets: [{ id: "psi-real", sha256: "a".repeat(64), count: 2, components: 1, unit: "1", bytes: 16 },
        { id: "psi-imaginary", sha256: "b".repeat(64), count: 2, components: 1, unit: "1", bytes: 16 }],
      objects: [] }, "C:\\study\\hydrogen.qscene", "Hydrogen field");
    const study = createQuantumStudyFromTemplate("hydrogen", hydrogen, [hydrogen]);
    expect(study.panels.map(panel => panel.role)).toEqual(["density", "phase"]);
    expect(study.panels[0].sceneFingerprint).toBe(study.panels[1].sceneFingerprint);
    expect(normalizeQuantumStudyDocument(study, [hydrogen]).ok).toBe(true);
    expect(normalizeQuantumStudyDocument({ ...study, templateId: "qwz" }, [hydrogen]).ok).toBe(false);
  });
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
    expect(admitted.workspace.quantumStudies).toHaveLength(1);
    expect(admitted.workspace.quantumStudies?.[0].panels.map(panel => panel.role)).toEqual(["curvature", "bands"]);
    expect((await admitVerifiedQwzStudy(admitted, handoff, verify)).workspace.entries).toHaveLength(admitted.workspace.entries.length);
  });

  it("retains Hofstadter bulk and strip panels with selections while source documents remain standalone", async () => {
    const refs = references.map((item, index) => ({ ...item, title: index ? "strip" : "bands" }));
    const docs = refs.map((item, index) => createQuantumSceneDocument({ ...documents[index].source,
      provenance: { ...documents[index].source.provenance, model: "hofstadter" },
      objects: [{ id: index ? "strip-left" : "band-0", kind: index ? "point-cloud" : "mesh", label: item.title }],
    }, item.directory, item.title));
    const base = instantiateMath3DProjectTemplate("geometry-note-pins", "hofstadter-study-admission");
    const admitted = await admitVerifiedQwzStudy(base, { model: "hofstadter", title: "Harper study",
      roles: ["bands", "strip"], runId, resultSha256, references: refs }, async reference =>
      docs.find(item => item.source.sceneFingerprint === reference.sceneFingerprint)!);
    const edited = { ...admitted.workspace, quantumStudies: admitted.workspace.quantumStudies?.map(study => ({
      ...study, panels: study.panels.map((panel, index) => index ? { ...panel, selectedObjectId: "strip-left", sampleIndex: 0 } : panel),
    })) };
    const reopened = parseMath3DProject(serializeMath3DProject(
      (await import("@math3d/core")).replaceMath3DProjectWorkspace(admitted,
        (await import("@math3d/core")).createMixedWorkspaceDocument(edited))));
    expect(reopened.workspace.quantumStudies?.[0].panels[1].selectedObjectId).toBe("strip-left");
    expect(reopened.workspace.entries.filter(entry => entry.module === "quantum")).toHaveLength(2);
    const withoutPanel = deleteProjectDocument(reopened, docs[1].identity.id);
    expect(withoutPanel.workspace.quantumStudies).toEqual([]);
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
