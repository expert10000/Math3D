import { structuralHash, type StableDocumentId } from "./documentIdentity";
import { matchesScientificSourceGeneration } from "./scientificJobs";
import { projectResourceInventory, verifyProjectResourceBytes,
  type ProjectResourceReader } from "./projectResources";
import { viewerSourceFromDocument } from "./viewerProvenance";
import type { Math3DProject } from "./math3dProject";
import type { StudyRecordV1 } from "./studyRecord";
import { normalizeProjectNoteAnchor, type ProjectNoteAnchor } from "./projectNotes";
import { createResearchReference, normalizeResearchReference,
  type ResearchReference, type ResearchResourcePin } from "./researchReferenceSchema";
export { createResearchReference, normalizeResearchReference, RESEARCH_REFERENCE_FORMAT } from "./researchReferenceSchema";
export type { ResearchReference, ResearchResourcePin } from "./researchReferenceSchema";

/** Resource history is explicit in replay commands; inventory need not execute a domain adapter. */
const researchInventory = (project: Math3DProject) => projectResourceInventory(project, {
  resolveWorkspace: workspace => new Map(workspace.entries.map(entry => [entry.expected.id, entry.checkpoint])),
});

export type ResearchReferenceInspection = Readonly<{ status: "current" | "historical" | "missing" | "invalid" | "different-project";
  resourceStatus: "verified" | "not-checked" | "missing"; reason: string }>;

/** A descriptor pin records identity; callers supply bytes when publication needs verification. */
export function researchResourcePins(project: Math3DProject, sourceId: StableDocumentId): readonly ResearchResourcePin[] {
  return researchInventory(project).filter(item => (item.required && item.owners.includes(sourceId)) ||
    (item.kind === "workbook-payload" && item.id === sourceId))
    .map(item => ({ kind: item.kind, id: item.id, descriptorHash: structuralHash(item.reference), checksum: item.checksum }))
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

/** Project a saved Study pane into the same source reference used by citations and Notes. */
export function createStudyPaneResearchReference(project: Math3DProject, study: StudyRecordV1,
  paneId: string): ResearchReference {
  if (study.projectId !== project.identity.id) throw new TypeError("Study belongs to another Project.");
  const pane = study.layout.panes.find(item => item.paneId === paneId);
  const member = study.members.find(item => item.memberId === pane?.memberId);
  if (!member) throw new TypeError("Study pane has no saved source member.");
  const source = viewerSourceFromDocument({ identity: member.expected });
  const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
  return createResearchReference({ projectId: project.identity.id, kind: "document",
    targetId: member.documentId, source, targetHash: member.expected.structuralHash,
    resources: entry && matchesScientificSourceGeneration(source,
      viewerSourceFromDocument({ identity: entry.expected })) ? researchResourcePins(project, member.documentId) : [] });
}

/** Preserve an older pane's saved revision without inventing resource pins from a later Project. */
export function migrateLegacyStudyPaneResearchReference(study: StudyRecordV1, paneId: string): ResearchReference {
  const pane = study.layout.panes.find(item => item.paneId === paneId);
  const member = study.members.find(item => item.memberId === pane?.memberId);
  if (!member) throw new TypeError("Study pane has no saved source member.");
  return createResearchReference({ projectId: study.projectId, kind: "document",
    targetId: member.documentId, source: viewerSourceFromDocument({ identity: member.expected }),
    targetHash: member.expected.structuralHash, resources: [], pinState: "legacy-unpinned" });
}

/** Capture a Note's source descriptor at the moment its draft is saved. */
export function pinProjectNoteAnchor(project: Math3DProject, anchor: ProjectNoteAnchor): ProjectNoteAnchor {
  if (anchor.researchReference) return anchor;
  if (anchor.kind === "workbook-block") {
    const workbook = project.workbooks?.find(item => item.id === anchor.workbookId);
    if (!workbook || workbook.revision !== anchor.workbookRevision)
      throw new TypeError("Workbook changed before its evidence pins were saved.");
    return { ...anchor, researchReference: createResearchReference({ projectId: project.identity.id,
      kind: "selection", targetId: workbook.id, selectionId: anchor.blockId, targetHash: anchor.blockHash,
      source: { documentId: workbook.id, revision: workbook.revision, generation: workbook.revision, structuralHash: workbook.checksum },
      resources: researchResourcePins(project, workbook.id) }) };
  }
  if (!("source" in anchor)) return anchor;
  const source = anchor.source;
  const entry = project.workspace.entries.find(item => item.expected.id === source.documentId);
  if (!entry || !matchesScientificSourceGeneration(source,
    viewerSourceFromDocument({ identity: entry.expected })))
    throw new TypeError("Note source changed before its evidence pins were saved.");
  const kind = anchor.kind === "document" ? "document" : anchor.kind === "result" ? "result" : "selection";
  const targetId = anchor.kind === "result" ? anchor.resultId : anchor.kind === "study-selection" ? anchor.studyId :
    "objectId" in anchor ? anchor.objectId : source.documentId;
  const targetHash = anchor.kind === "result" ? anchor.resultHash : anchor.kind === "study-selection" ? anchor.studyHash :
    anchor.kind === "graph-selection" ? anchor.objectHash : anchor.kind === "object-local" ? anchor.shapeHash :
      anchor.kind === "entity-selection" || anchor.kind === "subentity" ? anchor.topologyHash : source.structuralHash;
  const selectionId = kind === "selection" ? anchor.kind === "study-selection" ? anchor.selectionId :
    "entityId" in anchor ? anchor.entityId : "objectId" in anchor ? anchor.objectId : targetId : undefined;
  const reference = createResearchReference({ projectId: project.identity.id, kind, targetId, source,
    targetHash, resources: researchResourcePins(project, source.documentId),
    ...(selectionId ? { selectionId } : {}) });
  const checked = normalizeProjectNoteAnchor({ ...anchor, researchReference: reference });
  if (!checked) throw new TypeError("Note anchor cannot retain a pinned research reference.");
  return checked;
}

/** Source and target identity are separate from the availability of required sidecar bytes. */
export function inspectResearchReference(project: Math3DProject, candidate: unknown,
  readResource?: ProjectResourceReader): ResearchReferenceInspection {
  const ref = normalizeResearchReference(candidate);
  if (!ref) return { status: "invalid", resourceStatus: "not-checked", reason: "Invalid research reference." };
  if (ref.projectId !== project.identity.id) return { status: "different-project", resourceStatus: "not-checked",
    reason: "Reference belongs to another Project." };
  const sourceEntry = project.workspace.entries.find(item => item.expected.id === ref.source.documentId);
  const workbook = project.workbooks?.find(item => item.id === ref.source.documentId);
  if (!sourceEntry && !workbook) return { status: "missing", resourceStatus: "missing", reason: "Source document is missing." };
  const currentSource = sourceEntry ? viewerSourceFromDocument({ identity: sourceEntry.expected }) :
    { documentId: workbook!.id, revision: workbook!.revision, generation: workbook!.revision, structuralHash: workbook!.checksum };
  let targetAvailable = false, targetMatches = false;
  if (ref.kind === "document") {
    targetAvailable = !!sourceEntry || !!workbook;
    targetMatches = currentSource.structuralHash === ref.targetHash;
  } else if (ref.kind === "result") {
    const result = project.workspace.results.find(item => item.resultId === ref.targetId);
    targetAvailable = !!result;
    targetMatches = !!result && structuralHash(result) === ref.targetHash &&
      matchesScientificSourceGeneration(result.provenance.source, ref.source);
  } else if (ref.kind === "study") {
    const study = project.workspace.studies?.find(item => item.id === ref.targetId);
    targetAvailable = !!study;
    targetMatches = !!study && structuralHash(study) === ref.targetHash &&
      study.members.every(member => {
        const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
        return !!entry && entry.expected.revision === member.expected.revision &&
          entry.expected.structuralHash === member.expected.structuralHash &&
          (!member.resultId || project.workspace.results.some(result => result.resultId === member.resultId &&
            result.provenance.source.documentId === member.documentId));
      });
  } else {
    targetAvailable = true;
    targetMatches = true; // A selection adapter must separately verify its targetHash and selectionId.
  }
  if (!targetAvailable) return { status: "missing", resourceStatus: "missing", reason: "Referenced target is missing." };
  if (ref.pinState === "legacy-unpinned") return { status: "historical", resourceStatus: "not-checked",
    reason: "Legacy reference retains its saved revision but has no captured resource descriptor pins." };
  const inventory = researchInventory(project);
  const resources = ref.resources.map(pin => {
    const item = inventory.find(candidate => candidate.kind === pin.kind && candidate.id === pin.id &&
      (candidate.owners.includes(ref.source.documentId) ||
        candidate.kind === "workbook-payload" && candidate.id === workbook?.id));
    return item && structuralHash(item.reference) === pin.descriptorHash && item.checksum === pin.checksum ? item : null;
  });
  const missingResource = resources.some(item => !item) || !!readResource && resources.some(item => {
    if (!item) return true;
    try { const bytes = readResource(item); if (!bytes) return true; verifyProjectResourceBytes(item, bytes); return false; }
    catch { return true; }
  });
  const resourceStatus = missingResource ? "missing" : readResource ? "verified" : "not-checked";
  const current = targetMatches && matchesScientificSourceGeneration(ref.source, currentSource) && !missingResource;
  return { status: current ? "current" : "historical", resourceStatus,
    reason: missingResource ? "Pinned source resource is unavailable or changed." : !targetMatches ?
      "Referenced target changed." : current ? "Source generation and target identity match." : "Source generation changed." };
}
