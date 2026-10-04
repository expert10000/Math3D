import { describe, expect, it } from "vitest";
import {
  createProjectNote, createStableDocumentId, inspectProjectNoteAnchor, normalizeProjectNote,
  normalizeProjectNoteAnchor, parseProjectNote, serializeProjectNote, structuralHash, updateProjectNote,
  type ProjectNoteAnchorResolver, type ScientificSourceGeneration,
} from "@math3d/core";

const projectId = createStableDocumentId("project", "notes-contract");
const documentId = createStableDocumentId("geometry", "saddle");
const workbookId = createStableDocumentId("workbook", "investigation");
const source = (revision = 1): ScientificSourceGeneration => ({
  documentId, revision, generation: revision, structuralHash: structuralHash({ revision }),
});
const shapeHash = structuralHash({ localGeometry: "saddle" });
const topologyHash = structuralHash({ faces: [1, 2, 3] });
const resolver = (revision = 1): ProjectNoteAnchorResolver => ({
  projectId, source: () => source(revision), objectShape: () => shapeHash,
  subentityTopology: () => topologyHash,
});

describe("NTS01 Project Note contracts", () => {
  it("round-trips an exact Project-bound note and advances its identity only on content edits", () => {
    const note = createProjectNote({ projectId, stableKey: "observation-1", kind: "text", title: "Saddle", body: "Negative curvature near the center.", anchor: { kind: "document", source: source() }, createdAt: 100 });
    expect(note.identity.id).toMatch(/^math3d:note:/);
    expect(parseProjectNote(serializeProjectNote(note))).toEqual(note);
    expect(inspectProjectNoteAnchor(note, resolver()).status).toBe("current");
    expect(inspectProjectNoteAnchor(note, resolver(2)).status).toBe("stale");
    expect(updateProjectNote(note, { body: note.body }, 110)).toEqual(note);
    const edited = updateProjectNote(note, { body: "Compare after subdivision." }, 120);
    expect(edited.identity.id).toBe(note.identity.id);
    expect(edited.identity.revision).toBe(2);
    expect(edited.identity.structuralHash).not.toBe(note.identity.structuralHash);
    expect(edited.createdAt).toBe(100);
    expect(edited.updatedAt).toBe(120);
    expect(normalizeProjectNote({ ...note, title: "Forged" }).ok).toBe(false);
    expect(normalizeProjectNote({ ...note, extra: true }).ok).toBe(false);
    expect(() => updateProjectNote(note, { projectId: createStableDocumentId("project", "other") } as never, 120)).toThrow(/unsupported fields/);
  });

  it("retains object-local anchors across transforms but reports changed geometry and topology", () => {
    const pinned = createProjectNote({ projectId, stableKey: "pin", kind: "pinned", title: "Saddle region", body: "K < 0 here", anchor: {
      kind: "object-local", source: source(), objectId: "surface-17", localPosition: [0, 0, 1], shapeHash,
    }, createdAt: 100 });
    expect(inspectProjectNoteAnchor(pinned, resolver(2)).status).toBe("current");
    expect(inspectProjectNoteAnchor(pinned, { ...resolver(2), objectShape: () => structuralHash("reshaped") }).status).toBe("stale");
    expect(inspectProjectNoteAnchor(pinned, { ...resolver(2), objectShape: () => null }).status).toBe("missing");
    expect(inspectProjectNoteAnchor(pinned, { ...resolver(2), projectId: createStableDocumentId("project", "other") }).status).toBe("different-project");

    const face = createProjectNote({ projectId, stableKey: "face", kind: "pinned", title: "Face pin", body: "Inspect this face", anchor: {
      kind: "subentity", source: source(), objectId: "surface-17", entityKind: "face", entityId: "face-42", topologyHash, barycentric: [0.2, 0.3, 0.5],
    }, createdAt: 100 });
    expect(inspectProjectNoteAnchor(face, resolver(2)).status).toBe("current");
    expect(inspectProjectNoteAnchor(face, { ...resolver(2), subentityTopology: () => structuralHash("remeshed") }).status).toBe("stale");
    expect(normalizeProjectNoteAnchor({ ...face.anchor, barycentric: [0.2, 0.3, 0.6] })).toBeNull();
    expect(normalizeProjectNoteAnchor({ ...face.anchor, topologyHash: "sha256:bad" })).toBeNull();
  });

  it("requires the exact saved result or Workbook block generation", () => {
    const resultHash = structuralHash({ result: "curvature", value: -0.5 });
    const result = createProjectNote({ projectId, stableKey: "result-note", kind: "result", title: "Curvature", body: "Numerical evidence only.", anchor: {
      kind: "result", source: source(), resultId: "result:curvature-4", resultHash,
    }, createdAt: 100 });
    const withResult: ProjectNoteAnchorResolver = { ...resolver(), result: () => ({ source: source(), hash: resultHash }) };
    expect(inspectProjectNoteAnchor(result, withResult).status).toBe("current");
    expect(inspectProjectNoteAnchor(result, { ...withResult, source: () => source(2) }).status).toBe("stale");
    expect(inspectProjectNoteAnchor(result, { ...withResult, result: () => ({ source: source(), hash: structuralHash("substituted") }) }).status).toBe("missing");
    expect(inspectProjectNoteAnchor(result, { ...withResult, result: () => null }).status).toBe("missing");

    const blockHash = structuralHash({ block: "interpretation" });
    const block = createProjectNote({ projectId, stableKey: "block-note", kind: "callout", title: "Check this claim", body: "Needs stronger evidence.", anchor: {
      kind: "workbook-block", workbookId, workbookRevision: 3, blockId: "explain-7", blockHash,
    }, createdAt: 100 });
    expect(inspectProjectNoteAnchor(block, { ...resolver(), workbookBlock: () => ({ revision: 3, hash: blockHash }) }).status).toBe("current");
    expect(inspectProjectNoteAnchor(block, { ...resolver(), workbookBlock: () => ({ revision: 4, hash: blockHash }) }).status).toBe("stale");
    expect(inspectProjectNoteAnchor(block, resolver()).status).toBe("missing");
  });

  it("rejects oversized, malformed, or mismatched anchors", () => {
    const note = createProjectNote({ projectId, stableKey: "plain", kind: "text", title: "Observation", body: "A note.", createdAt: 100 });
    expect(inspectProjectNoteAnchor(note, resolver()).status).toBe("unanchored");
    expect(() => createProjectNote({ projectId, stableKey: "bad", kind: "pinned", title: "Bad", body: "Missing anchor", createdAt: 100 })).toThrow(/matching anchor/);
    expect(() => parseProjectNote(serializeProjectNote(note).replace("A note.", " ".repeat(20000)))).toThrow(/size limit/);
    expect(normalizeProjectNoteAnchor({ kind: "document", source: source(), extra: true })).toBeNull();
    expect(inspectProjectNoteAnchor({ ...note, projectId: "math3d:project:invalid" }, resolver()).status).toBe("invalid");
  });
});
