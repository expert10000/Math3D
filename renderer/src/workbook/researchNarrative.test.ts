import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, createProjectNote, replaceMath3DProjectWorkspace,
  replaceMeshDocumentSource, sha256Checksum, structuralHash, upsertMath3DProjectNote,
  pinProjectNoteAnchor } from "@math3d/core";
import { instantiateNotebookStarter } from "../projects/notebookStarters";
import { captureProjectResources } from "../projects/projectResources";
import { readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { createPortableResearchNarrative, inspectPortableResearchNarrative } from "./researchNarrative";

const fixture = () => {
  const made = instantiateNotebookStarter("edge-path-evidence", "portable-research-narrative");
  const reference = made.project.workbooks![0]!;
  const book = readProjectWorkbook(made.resources.bytes({ kind: "workbook-payload", id: reference.id })!, reference);
  const source = book.stages[1]!.blocks[0]!.notebookReference!.source;
  const note = createProjectNote({ projectId: made.project.identity.id, stableKey: "research-note", kind: "text",
    title: "Edge path observation", body: "A source-bound observation.",
    anchor: pinProjectNoteAnchor(made.project, { kind: "document", source }), createdAt: 1 });
  const project = upsertMath3DProjectNote(made.project, note);
  return { project, resources: made.resources, book, note };
};

describe("portable Workbook and Note research narrative", () => {
  it("reopens an ordinary Project package with qualified citations and source-bound Note text", () => {
    const { project, resources, book, note } = fixture();
    const narrative = createPortableResearchNarrative(project, [book], resources);
    expect(narrative.evidence.citations.some(item => item.status === "current")).toBe(true);
    expect(narrative.evidence.notes.find(item => item.noteId === note.identity.id)?.renderedBody)
      .toContain("A source-bound observation.");
    expect(inspectPortableResearchNarrative(JSON.parse(JSON.stringify(narrative))).project.identity.id)
      .toBe(project.identity.id);
    expect(() => inspectPortableResearchNarrative({ ...narrative, evidence: { ...narrative.evidence,
      notes: narrative.evidence.notes.map(item => ({ ...item, renderedBody: "tampered" })) } })).toThrow(/checksum/);
    const packageValue = JSON.parse(narrative.packageJson);
    packageValue.resources = packageValue.resources.filter((item: { kind: string }) => item.kind !== "mesh-buffers");
    const packageJson = JSON.stringify(packageValue);
    const { contentHash: _hash, ...content } = narrative;
    const changedPackage = { ...content, packageJson,
      packageChecksum: sha256Checksum(new TextEncoder().encode(packageJson)) };
    expect(() => inspectPortableResearchNarrative({ ...changedPackage,
      contentHash: structuralHash(changedPackage) })).toThrow(/evidence or omissions/);
  });

  it("lists missing sidecars and withheld evidence after package import", () => {
    const { project, book } = fixture();
    const missing = captureProjectResources(project, () => null, true);
    const narrative = createPortableResearchNarrative(project, [book], missing);
    expect(narrative.evidence.citations.some(item => item.status === "missing")).toBe(true);
    expect(narrative.evidence.omissions.some(item => item.kind === "citation")).toBe(true);
    expect(narrative.evidence.omissions.some(item => item.kind === "note")).toBe(true);
    expect(narrative.evidence.omissions.some(item => item.kind === "resource")).toBe(true);
    expect(narrative.evidence.notes.some(item => item.renderedBody === null)).toBe(true);
    expect(inspectPortableResearchNarrative(narrative).project.identity.id).toBe(project.identity.id);
  });

  it("withholds historical sources after a saved document revision changes", () => {
    const { project, book, resources } = fixture();
    const sourceId = book.stages[1]!.blocks[0]!.notebookReference!.source.documentId;
    const changed = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map(entry => {
        if (entry.expected.id !== sourceId || entry.checkpoint.format !== "math3d.mesh-document") return entry;
        const checkpoint = replaceMeshDocumentSource(entry.checkpoint, { ...entry.checkpoint.source,
          resource: { ...entry.checkpoint.source.resource, checksum: structuralHash("changed-source") } });
        return { ...entry, checkpoint, expected: checkpoint.identity };
      }),
    }));
    const narrative = createPortableResearchNarrative(changed, [book], resources);
    expect(narrative.evidence.citations.some(item => item.status === "historical")).toBe(true);
    expect(narrative.evidence.notes.some(item => item.status === "stale")).toBe(true);
    expect(inspectPortableResearchNarrative(narrative).project.identity.id).toBe(project.identity.id);
  });
});
