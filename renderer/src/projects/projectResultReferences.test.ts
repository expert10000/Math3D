import { describe, expect, it } from "vitest";
import { structuralHash, type AnalysisResultEnvelope, type Math3DProject } from "@math3d/core";
import { resultNoteReferences } from "./projectResultReferences";

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
