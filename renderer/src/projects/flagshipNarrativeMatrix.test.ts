import { describe, expect, it } from "vitest";
import { createGraph2DDocument, createMixedWorkspaceDocument, instantiateMath3DProjectTemplate,
  inspectResearchReference, MATH3D_PROJECT_TEMPLATES, parseMath3DProject,
  replaceGeometryDocumentSource, replaceMath3DProjectWorkspace, replaceMeshDocumentSource,
  replaceSurfaceDocumentSource, serializeMath3DProject, sha256Checksum, structuralHash,
  type Math3DProject, type MixedWorkspaceDocument } from "@math3d/core";
import { CURATED_STUDIES } from "./curatedStudyCatalog";
import { prepareCuratedStudyBundle } from "./curatedStudyProject";
import { instantiateNotebookStarter } from "./notebookStarters";
import { readProjectWorkbook } from "./projectWorkbookBinding";
import { exportProjectPackage, parseProjectPackage } from "./projectResources";
import { previewResearchNarrativeImport } from "./projectResearchNarrativeImport";
import { createPortableResearchNarrative, inspectPortableResearchNarrative } from "../workbook/researchNarrative";

const templateIds = new Set(MATH3D_PROJECT_TEMPLATES.map(item => item.id));
const builtInJourneys = CURATED_STUDIES.filter(card => card.route.kind === "project");

const editStudySource = (project: Math3DProject, documentId =
  project.workspace.studies![0]!.members[0]!.documentId): Math3DProject => {
  const entries = project.workspace.entries.map(entry => {
    if (entry.expected.id !== documentId) return entry;
    const old = entry.checkpoint;
    const checkpoint: MixedWorkspaceDocument["entries"][number]["checkpoint"] = old.format === "math3d.graph2d-document"
      ? createGraph2DDocument({ ...old, stableKey: old.identity.id, title: old.metadata.title,
        source: { ...old.source, objects: old.source.objects.map((object, index) => index === 0 ?
          { ...object, label: `${object.label} revised` } : object) },
        identity: { ...old.identity, revision: old.identity.revision + 1,
          structuralHash: structuralHash({ ...old.source, objects: old.source.objects.map((object, index) => index === 0 ?
            { ...object, label: `${object.label} revised` } : object) }) } })
      : old.format === "math3d.geometry-document"
        ? replaceGeometryDocumentSource(old, { ...old.source,
          parameters: { ...old.source.parameters, narrativeEdit: true } })
        : old.format === "math3d.mesh-document"
          ? replaceMeshDocumentSource(old, { ...old.source,
            resource: { ...old.source.resource, checksum: structuralHash("narrative source edit") } })
          : old.format === "math3d.surface-document"
            ? replaceSurfaceDocumentSource(old, { ...old.source,
              parameters: { ...old.source.parameters, narrativeEdit: true } })
            : (() => { throw new Error(`No research source edit fixture for ${old.format}.`); })();
    return { ...entry, checkpoint, expected: checkpoint.identity, replay: null };
  });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries }));
};

describe("M3D20-07 built-in flagship narrative matrix", () => {
  it("covers every advertised built-in route and keeps external routes conditional", () => {
    expect(builtInJourneys).toHaveLength(11);
    expect(CURATED_STUDIES.filter(card => card.route.kind === "verified-quantum-import")
      .map(card => card.id)).toEqual(["quantum-qwz", "quantum-ssh", "quantum-hydrogen"]);
    expect(CURATED_STUDIES.filter(card => card.route.kind === "cas-gallery").map(card => card.id))
      .toEqual(["cas-structures"]);
  });

  it.each(builtInJourneys)("certifies $id through restart, source edit, missing sidecar, export and independent import", card => {
    if (card.route.kind !== "project") throw new Error("Invalid matrix row.");
    const id = card.route.starterId;
    const ordinary = templateIds.has(id) ?
      { project: instantiateMath3DProjectTemplate(id as Parameters<typeof instantiateMath3DProjectTemplate>[0], `matrix-${id}`) } :
      instantiateNotebookStarter(id as Parameters<typeof instantiateNotebookStarter>[0], `matrix-${id}`);
    const guided = prepareCuratedStudyBundle(ordinary, id, `matrix-${id}`);
    const restarted = parseProjectPackage(exportProjectPackage(guided.project, guided.resources!));
    const project = parseMath3DProject(serializeMath3DProject(restarted.project));
    const study = project.workspace.studies![0]!;
    expect(study.paneReferences).toHaveLength(study.layout.panes.length);
    expect(study.paneReferences!.every(item => inspectResearchReference(project, item.reference,
      resource => restarted.resources.bytes(resource)).status === "current")).toBe(true);
    const note = project.notes!.find(item => item.title.endsWith("observation"))!;
    expect(note.anchor?.researchReference?.pinState).toBeUndefined();
    const reference = project.workbooks!.find(item => item.title === `${study.title} Research`)!;
    const book = readProjectWorkbook(restarted.resources.bytes({ kind: "workbook-payload", id: reference.id })!, reference);
    const narrative = createPortableResearchNarrative(project, [book], restarted.resources);
    expect(narrative.evidence.citations.length).toBeGreaterThan(0);
    expect(narrative.evidence.citations.every(item => item.status === "current")).toBe(true);
    expect(narrative.evidence.notes.find(item => item.noteId === note.identity.id)?.status).toBe("current");
    const independent = previewResearchNarrativeImport(JSON.stringify(narrative));
    expect(independent.preview.project.identity.id).toBe(project.identity.id);
    expect(inspectPortableResearchNarrative(narrative).project.identity.id).toBe(project.identity.id);

    const edited = editStudySource(project);
    const historical = createPortableResearchNarrative(edited, [book], restarted.resources);
    expect(historical.evidence.citations.some(item => item.status === "historical")).toBe(true);
    const noteSourceId = note.anchor && "source" in note.anchor ? note.anchor.source.documentId : null;
    expect(noteSourceId).toBeTruthy();
    const noteStatus = historical.evidence.notes.find(item => item.noteId === note.identity.id)?.status;
    if (noteSourceId === study.members[0]!.documentId) expect(noteStatus).not.toBe("current");
    else {
      // Catenoid's Note is anchored to Mesh evidence, so editing its Surface must not stale it.
      expect(noteStatus).toBe("current");
      const noteEdited = editStudySource(project, noteSourceId!);
      const staleNote = createPortableResearchNarrative(noteEdited, [book], restarted.resources);
      expect(staleNote.evidence.notes.find(item => item.noteId === note.identity.id)?.status).not.toBe("current");
    }
    expect(inspectPortableResearchNarrative(historical).project.identity.id).toBe(project.identity.id);

    const packageValue = JSON.parse(narrative.packageJson) as { resources: { kind: string }[] };
    packageValue.resources = packageValue.resources.filter(item => item.kind !== "workbook-payload");
    const packageJson = JSON.stringify(packageValue);
    const { contentHash: _hash, ...content } = narrative;
    const damaged = { ...content, packageJson,
      packageChecksum: sha256Checksum(new TextEncoder().encode(packageJson)) };
    expect(() => inspectPortableResearchNarrative({ ...damaged,
      contentHash: structuralHash(damaged) })).toThrow(/payload is missing/);
    expect(ordinary.project.workspace.studies).toBeUndefined();
  });
});
