import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, structuralHash, viewerSourceFromDocument,
  type AnalysisResultEnvelope, type Math3DProject } from "@math3d/core";
import { resultNoteReferences, resultStudyReferences } from "./projectResultReferences";

const source = { documentId: "math3d:graph2d:source", revision: 1,
  generation: "source-gen", structuralHash: "sha256:source" };
const result = { resultId: "saved", provenance: { source }, summary: { mean: 3 } } as unknown as AnalysisResultEnvelope;
const anchor = { kind: "result", source, resultId: "saved", resultHash: structuralHash(result) };
const project = { notes: [
  { identity: { id: "exact" }, title: "Exact Note", anchor },
  { identity: { id: "older" }, title: "Older Note", anchor: { ...anchor, resultHash: "sha256:old" } },
  { identity: { id: "other" }, title: "Unrelated", anchor: { ...anchor, resultId: "another" } },
  { identity: { id: "value" }, title: "Value Note", anchor: null,
    valueBindings: [{ kind: "result", resultId: "saved", resultHash: structuralHash(result), source }] },
] } as unknown as Math3DProject;

describe("Project Result Note references", () => {
  it("finds exact anchors and structured value bindings without reading prose", () => {
    expect(resultNoteReferences(project, result).map(item => [item.id, item.status]))
      .toEqual([["exact", "current"], ["older", "historical"], ["value", "current"]]);
  });
  it("marks a changed source generation historical even with the same result ID and hash", () => {
    const changed = { ...result, provenance: { source: { ...source, revision: 2 } } } as AnalysisResultEnvelope;
    expect(resultNoteReferences(project, changed).filter(item => item.id === "exact")[0]?.status)
      .toBe("historical");
  });
});

describe("Project Result Study references", () => {
  it("distinguishes a current member from a historical or foreign Study", () => {
    const document = createEmptyGraph2DDocument("result-source");
    const recorded = viewerSourceFromDocument(document);
    const saved = { ...result, provenance: { source: recorded } } as AnalysisResultEnvelope;
    const member = { memberId: "analysis", documentId: document.identity.id,
      expected: document.identity, resultId: saved.resultId, role: "analysis" };
    const current = { id: "study-current", projectId: "project", title: "Current Study", members: [member] };
    const historical = { id: "study-old", projectId: "project", title: "Old Study",
      members: [{ ...member, documentId: "math3d:graph2d:other" }] };
    const foreign = { ...current, id: "foreign", projectId: "another" };
    const workspace = { entries: [{ expected: document.identity }], studies: [current, historical, foreign] };
    const currentProject = { identity: { id: "project" }, workspace } as unknown as Math3DProject;
    expect(resultStudyReferences(currentProject, saved).map(item => [item.id, item.status]))
      .toEqual([["study-current", "current"], ["study-old", "historical"]]);
  });
});
