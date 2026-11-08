import { canonicalJsonStringify, type CanonicalJsonValue } from "./documentIdentity";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { createStudyRecordV1, normalizeStudyRecordV1, type StudyRecordV1 } from "./studyRecord";
import { normalizeQuantumStudyDocument } from "./quantumStudyDocument";
import type { QuantumSceneDocument } from "./quantumSceneDocument";

const current = (project: Math3DProject): Math3DProject => parseMath3DProject(serializeMath3DProject(project));

/** This classifies references only; a viewer must replay/verify a source before rendering it. */
export function inspectProjectStudyMembers(project: Math3DProject, study: StudyRecordV1): readonly Readonly<{
  memberId: string; documentId: string; status: "current-reference" | "changed" | "missing-document" | "missing-result";
}>[] {
  return study.members.map(member => {
    const entry = project.workspace.entries.find(item => item.expected.id === member.documentId);
    const status = !entry ? "missing-document" :
      entry.expected.revision !== member.expected.revision ||
      entry.expected.structuralHash !== member.expected.structuralHash ? "changed" :
      member.resultId && !project.workspace.results.some(result => result.resultId === member.resultId &&
        result.provenance.source.documentId === member.documentId) ? "missing-result" : "current-reference";
    return { memberId: member.memberId, documentId: member.documentId, status };
  });
}

export function upsertProjectStudy(project: Math3DProject, study: StudyRecordV1): Math3DProject {
  const source = current(project), checked = normalizeStudyRecordV1(study);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  if (checked.value.projectId !== source.identity.id) throw new TypeError("Study belongs to another Project.");
  const studies = [...(source.workspace.studies ?? []).filter(item => item.id !== study.id), checked.value]
    .sort((a, b) => a.id.localeCompare(b.id));
  if (canonicalJsonStringify(studies) === canonicalJsonStringify(source.workspace.studies ?? [])) return source;
  return replaceMath3DProjectWorkspace(source, createMixedWorkspaceDocument({ ...source.workspace, studies }));
}

export function createProjectStudyFromDocuments(project: Math3DProject, stableKey: CanonicalJsonValue,
  title: string, documentIds: readonly string[]): Math3DProject {
  const source = current(project);
  if (documentIds.length < 1 || documentIds.length > 4 || new Set(documentIds).size !== documentIds.length)
    throw new TypeError("Choose one to four distinct Project documents for a Study.");
  const entries = documentIds.map(id => {
    const entry = source.workspace.entries.find(item => item.expected.id === id);
    if (!entry) throw new TypeError(`Study source ${id} is outside the Project.`);
    return entry;
  });
  const study = createStudyRecordV1(source.identity.id, stableKey, {
    title, members: entries.map((entry, index) => ({ memberId: `member-${index + 1}`,
      documentId: entry.expected.id, expected: entry.expected, role: index === 0 ? "source" : "visual" })),
    layout: { mode: entries.length === 1 ? "single" : entries.length === 2 ? "split-2" :
      entries.length === 4 ? "quad" : "tabs",
      panes: entries.map((_, index) => ({ paneId: `pane-${index + 1}`, memberId: `member-${index + 1}` })) },
    links: [], pinnedSelectionIds: [],
  });
  if (source.workspace.studies?.some(item => item.id === study.id)) throw new TypeError("Study identity already exists.");
  return upsertProjectStudy(source, study);
}

export function renameProjectStudy(project: Math3DProject, id: string, title: string): Math3DProject {
  const source = current(project), study = source.workspace.studies?.find(item => item.id === id);
  if (!study) throw new TypeError("Study is unavailable.");
  return upsertProjectStudy(source, { ...study, title });
}

export function forkProjectStudy(project: Math3DProject, id: string, stableKey: CanonicalJsonValue,
  title: string): Math3DProject {
  const source = current(project), study = source.workspace.studies?.find(item => item.id === id);
  if (!study) throw new TypeError("Study is unavailable.");
  const fork = createStudyRecordV1(source.identity.id, stableKey, { title,
    members: study.members, layout: study.layout, links: study.links,
    pinnedSelectionIds: study.pinnedSelectionIds,
    ...(study.description === undefined ? {} : { description: study.description }),
    ...(study.notesRefs === undefined ? {} : { notesRefs: study.notesRefs }),
    ...(study.workbookRefs === undefined ? {} : { workbookRefs: study.workbookRefs }) });
  if (source.workspace.studies?.some(item => item.id === fork.id)) throw new TypeError("Study fork identity already exists.");
  return upsertProjectStudy(source, fork);
}

export type ProjectQwzPair = Readonly<{ curvature: QuantumSceneDocument; bands: QuantumSceneDocument }>;

/** Qualify the two existing read-only scenes; no Study owns or recomputes their source arrays. */
export function qualifyProjectQwzPair(project: Math3DProject, quantumStudyId: string): ProjectQwzPair | null {
  const study = project.workspace.quantumStudies?.find(item => item.id === quantumStudyId);
  if (!study || study.templateId !== "qwz" || study.panels.length !== 2) return null;
  const scenes = project.workspace.entries.filter(entry => entry.module === "quantum" &&
    entry.checkpoint.format === "math3d.quantum-scene-document")
    .map(entry => entry.checkpoint as QuantumSceneDocument);
  if (!normalizeQuantumStudyDocument(study, scenes).ok) return null;
  const byFingerprint = (fingerprint: string) => scenes.find(scene => scene.source.sceneFingerprint === fingerprint);
  const curvature = byFingerprint(study.panels[0]!.sceneFingerprint);
  const bands = byFingerprint(study.panels[1]!.sceneFingerprint);
  if (!curvature || !bands || curvature.identity.id === bands.identity.id ||
      curvature.source.provenance.engine !== bands.source.provenance.engine ||
      curvature.source.provenance.engineVersion !== bands.source.provenance.engineVersion ||
      curvature.source.coordinates.handedness !== bands.source.coordinates.handedness ||
      curvature.source.coordinates.axes[0] !== bands.source.coordinates.axes[0] ||
      curvature.source.coordinates.axes[1] !== bands.source.coordinates.axes[1] ||
      curvature.source.coordinates.units[0] !== bands.source.coordinates.units[0] ||
      curvature.source.coordinates.units[1] !== bands.source.coordinates.units[1]) return null;
  for (const document of [curvature, bands]) {
    const entry = project.workspace.entries.find(item => item.expected.id === document.identity.id);
    const reference = project.quantumScenes?.find(item => item.sceneFingerprint === document.source.sceneFingerprint);
    if (!entry || canonicalJsonStringify(entry.expected) !== canonicalJsonStringify(document.identity) ||
        !reference || reference.directory !== document.location.directory ||
        reference.format !== document.source.sceneSchema) return null;
  }
  return { curvature, bands };
}

/** Four view roles reuse two source members; the reciprocal cursor mapping is declared explicitly. */
export function createProjectQwzQuadStudy(project: Math3DProject, quantumStudyId: string,
  stableKey: CanonicalJsonValue, title: string): Math3DProject {
  const source = current(project), pair = qualifyProjectQwzPair(source, quantumStudyId);
  if (!pair) throw new TypeError("QWZ Study requires two current, referenced scenes in one exact coordinate frame.");
  const study = createStudyRecordV1(source.identity.id, stableKey, {
    title, members: [
      { memberId: "curvature", documentId: pair.curvature.identity.id,
        expected: pair.curvature.identity, role: "source" },
      { memberId: "bands", documentId: pair.bands.identity.id,
        expected: pair.bands.identity, role: "visual" },
    ],
    layout: { mode: "quad", panes: [
      { paneId: "curvature", memberId: "curvature", viewConfigId: "qwz.curvature" },
      { paneId: "bands", memberId: "bands", viewConfigId: "qwz.bands" },
      { paneId: "reciprocal", memberId: "curvature", viewConfigId: "qwz.reciprocal" },
      { paneId: "inspector", memberId: "curvature", viewConfigId: "qwz.inspector" },
    ] },
    links: [{ id: "qwz-reciprocal-k", kind: "cursor", sourcePaneId: "curvature",
      targetPaneId: "bands", mappingId: "quantum.qwz.reciprocal-k", direction: "two-way" }],
    pinnedSelectionIds: [],
  });
  if (source.workspace.studies?.some(item => item.id === study.id)) throw new TypeError("QWZ Study identity already exists.");
  return upsertProjectStudy(source, study);
}
