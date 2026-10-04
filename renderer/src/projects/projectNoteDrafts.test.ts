import { describe, expect, it } from "vitest";
import { createAnalysisResultEnvelope, createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject, structuralHash } from "@math3d/core";
import { bindProjectNoteDrafts, createProjectNoteDraft } from "./projectNoteDrafts";

const fixture = () => {
  const workspace = createGraph2DWorkspaceProject(createEmptyGraph2DDocument("note-draft"));
  const project = createMath3DProject(workspace, { stableKey: "note-draft", title: "Draft study" });
  return { project, workspace };
};

describe("NTS02 Note drafts", () => {
  it("keeps a global Note projectless until explicit Project save", () => {
    const { project, workspace } = fixture();
    const draft = createProjectNoteDraft("global", workspace, "session-1", 100);
    expect(draft).not.toHaveProperty("projectId");
    const bound = bindProjectNoteDrafts(project, [{ ...draft, title: "Observation", body: "A saved observation." }]);
    expect(bound.notes?.[0]).toMatchObject({ projectId: project.identity.id, title: "Observation", body: "A saved observation." });
    expect(project.notes).toBeUndefined();
  });

  it("captures committed selections and exact result generations", () => {
    const { workspace } = fixture();
    const source = { documentId: workspace.entries[0]!.expected.id, revision: 1, generation: 1,
      structuralHash: workspace.entries[0]!.expected.structuralHash };
    expect(() => createProjectNoteDraft("selection", workspace, "s", 100)).toThrow("Commit a selection");
    const selected = { ...workspace, committedSelection: { state: "committed" as const, source, entityIds: ["curve-1"] } };
    expect(createProjectNoteDraft("selection", selected, "s", 100).anchor).toEqual({ kind: "document", source });
    expect(() => createProjectNoteDraft("result", workspace, "r", 100)).toThrow("Save an analysis result");
    const result = createAnalysisResultEnvelope({ resultId: "result:area:1", status: "numerical", provenance: {
      source, operation: { type: "geometry.measure-area", algorithm: "sample", algorithmVersion: "1", parameters: {} },
      numericContext: { precision: { decimalDigits: 15 }, tolerance: { relative: 1e-10 } },
      engine: { name: "math3d", version: "1" }, elapsedMs: 1,
    }, summary: { area: 2 }, warnings: [], diagnostics: [], artifacts: [] });
    expect(createProjectNoteDraft("result", { ...workspace, results: [result] }, "r", 100).anchor).toEqual({
      kind: "result", source, resultId: result.resultId, resultHash: structuralHash(result),
    });
    expect(createProjectNoteDraft("result", { ...workspace, results: [result] }, "r2", 101, undefined, result.resultId).anchor).toMatchObject({ resultId: result.resultId });
    expect(() => createProjectNoteDraft("result", { ...workspace, results: [result] }, "r3", 102, undefined, "missing")).toThrow("Selected saved result is unavailable");
  });
});
