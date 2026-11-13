import { createProjectNote, createProjectStudyFromDocuments, matchesScientificSourceGeneration,
  pinProjectNoteAnchor, upsertMath3DProjectNote, upsertMath3DProjectWorkbook, upsertProjectStudy,
  updateMath3DProjectMetadata, viewerSourceFromDocument, structuralHash, type Math3DProject } from "@math3d/core";
import { createDefaultWorkbook, createNotebookReference } from "@math3d/workbook";
import type { CuratedStarterId } from "./curatedStudyCatalog";
import { curatedStudy } from "./curatedStudyCatalog";
import { prepareProjectWorkbook } from "./projectWorkbookBinding";
import { captureProjectResources, type VerifiedProjectResources } from "./projectResources";

const layouts: Partial<Record<CuratedStarterId, Readonly<{
  title: string; modules: readonly ("graph2d" | "curve" | "surface" | "geometry" | "topology" | "mesh" | "volume")[];
  resultOnModule?: "graph2d" | "mesh";
}>>> = {
  "catenary-study": { title: "Catenary, catenoid and derivative", modules: ["graph2d", "surface"], resultOnModule: "graph2d" },
  "derivative-study": { title: "Parabola, Curve and derivative", modules: ["graph2d", "curve"], resultOnModule: "graph2d" },
  "catenoid-evidence": { title: "Catenoid and recorded Mesh curvature", modules: ["surface", "mesh"], resultOnModule: "mesh" },
  "scene-topology-study": { title: "Geometry constructions and incidence", modules: ["geometry", "topology"] },
  "geometry-note-pins": { title: "Geometry and anchored observations", modules: ["geometry"] },
  "graph-derivative-notebook": { title: "Graph and Curve with recorded evidence", modules: ["graph2d", "curve"], resultOnModule: "graph2d" },
  "ripple-wave-study": { title: "Wave profile and constructed representations", modules: ["graph2d", "surface", "geometry"] },
  "surface-geometry-probe": { title: "Source-backed Surface and Geometry", modules: ["surface", "geometry"] },
  "edge-path-evidence": { title: "Saved edge path evidence", modules: ["mesh", "surface"], resultOnModule: "mesh" },
  "mesh-comparison-study": { title: "Retained Mesh generations", modules: ["mesh"], resultOnModule: "mesh" },
  "mesh-curvature-study": { title: "Discrete curvature across Mesh scales", modules: ["mesh"], resultOnModule: "mesh" },
  "volume-isosurface-study": { title: "Extract an isosurface from this Volume", modules: ["volume"] },
};

/** Add a saved reference layout only for an explicitly chosen guided Gallery copy. */
export function prepareCuratedStudyProject(project: Math3DProject, id: CuratedStarterId,
  instanceKey: string): Math3DProject {
  const layout = layouts[id];
  if (!layout) return project;
  if (!project.metadata.tags?.includes(id)) throw new TypeError("Guided Study starter identity does not match the Project.");
  if (project.workspace.studies?.length) throw new TypeError("Guided Study starter already has a saved layout.");
  const entries = layout.modules.map(module => project.workspace.entries.find(entry => entry.module === module));
  if (entries.some(entry => !entry)) throw new TypeError(`Guided Study ${id} lacks a required source document.`);
  let next = createProjectStudyFromDocuments(project, ["curated-study", id, instanceKey], layout.title,
    entries.map(entry => entry!.expected.id));
  if (layout.resultOnModule) {
    const first = next.workspace.studies![0]!;
    const member = first.members.find(item => project.workspace.entries.find(entry =>
      entry.expected.id === item.documentId)?.module === layout.resultOnModule);
    const memberSource = member && viewerSourceFromDocument({ identity: member.expected });
    const result = memberSource && [...next.workspace.results].reverse().find(item =>
      matchesScientificSourceGeneration(item.provenance.source, memberSource));
    if (!member || !result) throw new TypeError(`Guided Study ${id} lacks its recorded source result.`);
    next = upsertProjectStudy(next, { ...first, members: first.members.map(item => item.memberId === member.memberId ?
      { ...item, resultId: result.resultId } : item) });
  }
  if (id === "catenoid-evidence") {
    const first = next.workspace.studies![0]!;
    const surface = first.members.find(item => next.workspace.entries.find(entry =>
      entry.expected.id === item.documentId)?.module === "surface");
    const result = next.workspace.results.find(item =>
      item.provenance.operation.type === "surface.catenoid-waist-comparison" &&
      item.provenance.source.documentId === surface?.documentId);
    if (!surface || !result) throw new TypeError("Guided Catenoid Study lacks its pinned analytic/discrete comparison.");
    next = upsertProjectStudy(next, { ...first, members: first.members.map(item => item.memberId === surface.memberId ?
      { ...item, resultId: result.resultId } : item) });
  }
  return updateMath3DProjectMetadata(next, { ...next.metadata,
    tags: [...new Set([...(next.metadata.tags ?? []), "curated-study-v1"])],
  });
}

/** Guided copies gain a connected Study, Note, and Workbook while ordinary starters stay unchanged. */
export function prepareCuratedStudyBundle(bundle: { project: Math3DProject; resources?: VerifiedProjectResources },
  id: CuratedStarterId, instanceKey: string) {
  let project = prepareCuratedStudyProject(bundle.project, id, instanceKey);
  if (!layouts[id]) return { project, resources: bundle.resources };
  const study = project.workspace.studies?.[0], card = curatedStudy(id);
  if (!study || !card) throw new TypeError("Guided research Study is unavailable.");
  const member = (id === "catenoid-evidence" ? study.members.find(item =>
    project.workspace.entries.find(entry => entry.expected.id === item.documentId)?.module === "mesh") : null)
    ?? study.members[0]!;
  const result = member.resultId && project.workspace.results.find(item => item.resultId === member.resultId);
  const anchor = result ? { kind: "result" as const, source: result.provenance.source,
    resultId: result.resultId, resultHash: structuralHash(result) } :
    { kind: "document" as const, source: viewerSourceFromDocument({ identity: member.expected }) };
  const note = createProjectNote({ projectId: project.identity.id,
    stableKey: ["curated-narrative", id, instanceKey, "note"], kind: "text",
    title: `${study.title} observation`, body: `${card.insight} ${card.limitation}`,
    anchor: pinProjectNoteAnchor(project, anchor), createdAt: 0 });
  project = upsertMath3DProjectNote(project, note);
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `guided-${id}-${instanceKey}-${++sequence}`);
  workbook.title = `${study.title} Research`;
  workbook.stages[0]!.blocks[0]!.text = `${card.question} ${card.prerequisites}`;
  workbook.stages[1]!.blocks = [{ id: `guided-${id}-study`, type: "reference", title: "Saved Study and panes",
    notebookReference: createNotebookReference(project, "study", study.id) },
  ...(result ? [{ id: `guided-${id}-result`, type: "reference" as const,
    title: "Recorded result", notebookReference: createNotebookReference(project, "result", result.resultId) }] : [])];
  workbook.stages[3]!.blocks = [{ id: `guided-${id}-interpretation`, type: "text", title: "Interpretation and limits",
    text: `${card.insight} ${card.limitation}` }];
  workbook.dependencies = [{ id: `guided-${id}-note-dependency`, targetBlockId: `guided-${id}-interpretation`,
    source: { kind: "note", projectId: project.identity.id, noteId: note.identity.id,
      revision: note.identity.revision, hash: note.identity.structuralHash } }];
  const prepared = prepareProjectWorkbook(project, workbook, `guided-${id}-${instanceKey}`);
  project = upsertMath3DProjectWorkbook(project, prepared.reference);
  const resources = captureProjectResources(project, item => item.kind === "workbook-payload" &&
    item.id === prepared.reference.id ? prepared.bytes : bundle.resources?.bytes(item) ?? null);
  return { project, resources };
}

export const curatedStudyHasLayout = (id: CuratedStarterId): boolean => !!layouts[id];
