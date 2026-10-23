import { describe, expect, it } from "vitest";
import { buildProjectExplorer, createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, parseMath3DProject, reviseVectorField3DDocument,
  serializeMath3DProject, vectorField3DExpression, type VectorField3DSource } from "@math3d/core";
import { inspectProjectCompatibility, previewProjectImport } from "./projectTransfer";

const field = () => {
  const source: VectorField3DSource = {
    axes: [{ role: "x", label: "x", unit: "m", min: -4, max: 4 },
      { role: "y", label: "y", unit: "m", min: -4, max: 4 },
      { role: "z", label: "z", unit: "m", min: -4, max: 4 }],
    timeUnit: "s", field: { kind: "expressions", components: [
      vectorField3DExpression("-y", "m/s"), vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s")] },
    seeds: [{ id: "seed-1", position: [2, 0, 0] }],
    display: { density: [8, 8, 8], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
    solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-5, maxSteps: 57,
      maxTime: 12, maxArcLength: 27 },
  };
  return createVectorField3DDocument(source, { stableKey: "vector-project", title: "Orbit study" });
};
const projectFor = (document: ReturnType<typeof field>) => createMath3DProject(createMixedWorkspaceDocument({
  entries: [{ module: "vector3d", checkpoint: document, expected: document.identity, replay: null }],
  activeDocumentIds: [document.identity.id], results: [], artifacts: [], relations: [],
  committedSelection: null, constructions: [],
}), { stableKey: "vector-project" });

describe("GRA-14 Project workspace persistence", () => {
  it("round-trips seeds and solver policy as a native editable document", () => {
    const authored = field(), project = projectFor(authored);
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    expect(reopened.workspace.entries[0]?.checkpoint).toEqual(authored);
    expect(buildProjectExplorer(reopened).groups.find(group => group.module === "vector3d")?.documents)
      .toMatchObject([{ title: "Orbit study", revision: authored.identity.revision }]);
    expect(inspectProjectCompatibility(reopened)).toMatchObject({ canOpenWorkspace: true,
      documents: [{ module: "vector3d", editable: true, replayVerified: true }] });
    expect(previewProjectImport(serializeMath3DProject(reopened)).canOpenWorkspace).toBe(true);
    const saved = reopened.workspace.entries[0]!.checkpoint;
    if (saved.format !== "math3d.vector-field3d-document") throw new Error("Wrong Project document type");
    expect(saved.source.seeds).toEqual(authored.source.seeds);
    expect(saved.source.solver).toEqual(authored.source.solver);
  });

  it("publishes a later document revision without persisting derived trajectories", () => {
    const original = field();
    const revised = reviseVectorField3DDocument(original, { ...original.source,
      seeds: [...original.source.seeds, { id: "seed-2", position: [0, 1, 0] }] });
    const reopened = parseMath3DProject(serializeMath3DProject(projectFor(revised)));
    expect(reopened.workspace.entries[0]!.expected.revision).toBe(original.identity.revision + 1);
    expect(reopened.workspace.entries[0]!.checkpoint).toEqual(revised);
    expect(serializeMath3DProject(reopened)).not.toContain("trajectoryArtifact");
  });
});
