import { describe, expect, it } from "vitest";
import { createProjectQwzQuadStudy, createQuantumSceneDocument, instantiateMath3DProjectTemplate,
  parseMath3DProject, qualifyProjectQwzPair, qualifyProjectQwzQuadStudy, serializeMath3DProject,
  type ProjectQuantumSceneReference } from "@math3d/core";
import { admitVerifiedQwzStudy } from "./quantumStudyAdmission";

const runId = "run-qwz-quad", resultSha256 = "9".repeat(64);
const references: ProjectQuantumSceneReference[] = ["curvature", "bands"].map((role, index) => ({
  format: "quantum-scene/v1", title: role, directory: `C:\\study\\${role}.qscene`,
  sceneFingerprint: String(index + 1).repeat(64),
}));
const documents = references.map((reference, index) => createQuantumSceneDocument({
  sceneSchema: "quantum-scene/v1", sceneId: `qwz-${index ? "bands" : "curvature"}`,
  sceneFingerprint: reference.sceneFingerprint,
  provenance: { runId, resultSha256, model: "qwz", engine: "native", engineVersion: "1", adapter: "qvis/1" },
  coordinates: { axes: ["kx", "ky", "z"], units: ["rad", "rad", "1"], handedness: "right" },
  datasets: [{ id: "positions", sha256: "a".repeat(64), count: 2, components: 3, unit: "1", bytes: 48 }],
  objects: [{ id: index ? "band-0" : "berry-curvature", kind: "mesh", label: reference.title }],
}, reference.directory, reference.title));
const base = instantiateMath3DProjectTemplate("geometry-note-pins", "qwz-quad-project");
const admitted = async () => admitVerifiedQwzStudy(base, { runId, resultSha256, references },
  async reference => documents.find(item => item.source.sceneFingerprint === reference.sceneFingerprint)!);

describe("M3D20-04 QWZ four-view Study assembly", () => {
  it("reuses two exact source members for four saved view roles", async () => {
    const project = await admitted(), quantumId = project.workspace.quantumStudies![0]!.id;
    expect(qualifyProjectQwzPair(project, quantumId)).toMatchObject({ curvature: documents[0], bands: documents[1] });
    const next = createProjectQwzQuadStudy(project, quantumId, "quad", "QWZ four-view question");
    const study = next.workspace.studies![0]!;
    expect(study.layout).toMatchObject({ mode: "quad", panes: [
      { viewConfigId: "qwz.curvature", memberId: "curvature" },
      { viewConfigId: "qwz.bands", memberId: "bands" },
      { viewConfigId: "qwz.reciprocal", memberId: "curvature" },
      { viewConfigId: "qwz.inspector", memberId: "curvature" },
    ] });
    expect(study.links).toMatchObject([{ mappingId: "quantum.qwz.reciprocal-k", direction: "two-way" }]);
    expect(next.workspace.entries).toEqual(project.workspace.entries);
    expect(qualifyProjectQwzQuadStudy(next, study)).not.toBeNull();
    expect(parseMath3DProject(serializeMath3DProject(next)).workspace.studies).toEqual([study]);
    expect(qualifyProjectQwzQuadStudy(next, { ...study, layout: { ...study.layout,
      panes: study.layout.panes.map((pane, index) => index === 2 ? { ...pane,
        viewConfigId: "qwz.inspector" } : pane) } })).toBeNull();
  });
  it("refuses missing references, mismatched coordinates and changed generations", async () => {
    const project = await admitted(), id = project.workspace.quantumStudies![0]!.id;
    const withoutReference = { ...project, quantumScenes: project.quantumScenes!.slice(1) };
    expect(qualifyProjectQwzPair(withoutReference, id)).toBeNull();
    const changedCoordinates = { ...project, workspace: { ...project.workspace, entries: project.workspace.entries.map(entry =>
      entry.expected.id === documents[1]!.identity.id ? { ...entry, checkpoint: {
        ...entry.checkpoint, source: { ...(entry.checkpoint as typeof documents[1]).source,
          coordinates: { ...documents[1]!.source.coordinates, units: ["1", "1", "1"] as [string, string, string] } },
      } } : entry) } };
    expect(qualifyProjectQwzPair(changedCoordinates, id)).toBeNull();
    const stale = { ...project, workspace: { ...project.workspace, entries: project.workspace.entries.map(entry =>
      entry.expected.id === documents[0]!.identity.id ? { ...entry,
        expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) } };
    expect(qualifyProjectQwzPair(stale, id)).toBeNull();
    expect(() => createProjectQwzQuadStudy(stale, id, "bad", "Cannot save")).toThrow();
  });
  it("shares reciprocal k axes while allowing different physical third axes", async () => {
    const energyBands = createQuantumSceneDocument({ ...documents[1]!.source,
      coordinates: { axes: ["kx", "ky", "energy"], units: ["rad", "rad", "energy"], handedness: "right" } },
    references[1]!.directory, "bands with energy");
    const project = await admitVerifiedQwzStudy(base, { runId, resultSha256, references },
      async reference => reference.sceneFingerprint === energyBands.source.sceneFingerprint ? energyBands : documents[0]!);
    expect(qualifyProjectQwzPair(project, project.workspace.quantumStudies![0]!.id)).not.toBeNull();
  });
});
