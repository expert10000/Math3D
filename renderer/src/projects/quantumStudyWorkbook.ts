import { canonicalJsonStringify, structuralHash, type Math3DProject, type StudyRecordV1 } from "@math3d/core";
import { createNotebookReference, inspectNotebookReference, WORKBOOK_STAGE_ORDER,
  type NotebookReference, type Workbook, type WorkbookQuantumStudyEvidence } from "@math3d/workbook";
import { quantumStudyRecord, quantumStudySelectionEvidence } from "./quantumStudySelection";

type Report = WorkbookQuantumStudyEvidence["snapshot"];
export type QuantumStudySelectionTarget = Readonly<{ projectId: string; studyId: string; selectionHash: string }>;
const hash = /^(?:sha256:)?[a-f0-9]{64}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function quantumStudySelectionHash(project: Math3DProject, study: StudyRecordV1): string | null {
  const record = quantumStudyRecord(project, study);
  return record ? structuralHash({ id: record.id, source: record.source,
    panels: record.panels.map(panel => ({ role: panel.role, sceneFingerprint: panel.sceneFingerprint,
      selectedObjectId: panel.selectedObjectId, sampleIndex: panel.sampleIndex })) }) : null;
}

export function normalizeQuantumStudyWorkbookEvidence(value: unknown): WorkbookQuantumStudyEvidence | null {
  if (!object(value) || Object.keys(value).sort().join() !== "kind,schemaVersion,selectionHash,snapshot,studyId" ||
      value.kind !== "quantum-study-selection/v1" || value.schemaVersion !== 1 ||
      typeof value.studyId !== "string" || !value.studyId ||
      typeof value.selectionHash !== "string" || !hash.test(value.selectionHash) || !object(value.snapshot)) return null;
  const snapshot = value.snapshot;
  if (Object.keys(snapshot).sort().join() !== "omissions,resultSha256,runId,schema,sources,studyId,templateId,values" ||
      snapshot.schema !== "math3d.quantum-study-selection-evidence/v1" || snapshot.studyId !== value.studyId ||
      !["hydrogen", "ssh", "ute2-landau", "ute2-bdg", "ute2-lattice"].includes(String(snapshot.templateId)) ||
      typeof snapshot.runId !== "string" || !snapshot.runId ||
      typeof snapshot.resultSha256 !== "string" || !hash.test(snapshot.resultSha256) ||
      !Array.isArray(snapshot.sources) || snapshot.sources.length !==
        (["ute2-landau", "ute2-bdg"].includes(String(snapshot.templateId)) ? 1 : snapshot.templateId === "ute2-lattice" ? 3 : 2) ||
      !snapshot.sources.every((source: unknown) => object(source) &&
        Object.keys(source).sort().join() === "datasets,role,sceneFingerprint" &&
        typeof source.role === "string" && typeof source.sceneFingerprint === "string" && hash.test(source.sceneFingerprint) &&
        Array.isArray(source.datasets) && source.datasets.every((dataset: unknown) => object(dataset) &&
          Object.keys(dataset).sort().join() === "id,sha256,unit" && typeof dataset.id === "string" &&
          typeof dataset.sha256 === "string" && hash.test(dataset.sha256) && typeof dataset.unit === "string")) ||
      !object(snapshot.values) || !Array.isArray(snapshot.omissions) ||
      !snapshot.omissions.every((item: unknown) => typeof item === "string")) return null;
  try { if (canonicalJsonStringify(value).length > 65_536) return null; }
  catch { return null; }
  return value as WorkbookQuantumStudyEvidence;
}

/** Navigation may proceed with changed bundle bytes; the Study reader will reverify and withhold values. */
export function quantumStudyCitationTarget(project: Math3DProject | null,
  reference: NotebookReference | undefined, raw: unknown): QuantumStudySelectionTarget | null {
  const saved = normalizeQuantumStudyWorkbookEvidence(raw);
  if (!project || !reference || !saved || reference.kind !== "study" ||
      reference.projectId !== project.identity.id || reference.targetId !== saved.studyId ||
      inspectNotebookReference(project, reference).status !== "current") return null;
  const study = project.workspace.studies?.find(item => item.id === saved.studyId);
  return study && quantumStudySelectionHash(project, study) === saved.selectionHash ?
    { projectId: project.identity.id, studyId: study.id, selectionHash: saved.selectionHash } : null;
}

/** A Workbook keeps the exact publication snapshot and a Study reference, never a live source pointer alone. */
export function createQuantumStudySelectionWorkbook(project: Math3DProject, study: StudyRecordV1,
  report: Report, workbookId: string, blockId: string): Workbook {
  const record = quantumStudyRecord(project, study), selectionHash = quantumStudySelectionHash(project, study);
  if (!record || !selectionHash || report.studyId !== study.id || report.templateId !== record.templateId ||
      report.runId !== record.source.runId || report.resultSha256 !== record.source.resultSha256 ||
      !Object.keys(report.values).length)
    throw new TypeError("Save a verified quantum selection before publishing its Workbook citation.");
  const marker = normalizeQuantumStudyWorkbookEvidence({ schemaVersion: 1,
    kind: "quantum-study-selection/v1", studyId: study.id, selectionHash, snapshot: report });
  if (!marker || marker.snapshot.sources.some(source => !record.panels.some(panel =>
    panel.role === source.role && panel.sceneFingerprint === source.sceneFingerprint)))
    throw new TypeError("Quantum evidence does not match the saved Study sources.");
  return { id: workbookId, title: `${study.title} · selected evidence`, updatedAt: Date.now(),
    stages: WORKBOOK_STAGE_ORDER.map(stage => ({ ...stage, blocks: stage.id === "compute" ? [
      { id: blockId, type: "reference" as const, title: "Verified quantum Study selection",
        notebookReference: createNotebookReference(project, "study", study.id), quantumStudyEvidence: marker },
    ] : [] })) };
}

/** Recheck Study generation, saved selection and source bytes before any stored value is shown as current. */
export async function inspectQuantumStudyWorkbookEvidence(project: Math3DProject | null,
  reference: NotebookReference | undefined, raw: unknown): Promise<{
    status: "current" | "withheld"; report: Report | null; omissions: string[];
    saved: WorkbookQuantumStudyEvidence | null;
  }> {
  const saved = normalizeQuantumStudyWorkbookEvidence(raw);
  const withheld = (reason: string, omissions: string[] = []) => ({ status: "withheld" as const,
    report: null, omissions: [...omissions, reason], saved });
  if (!saved) return withheld("Workbook quantum evidence is missing or invalid.");
  if (!project || !reference) return withheld("Open the named Project to recheck this citation.");
  if (reference.kind !== "study" || reference.targetId !== saved.studyId ||
      inspectNotebookReference(project, reference).status !== "current")
    return withheld("The cited Study generation changed or is missing.");
  const study = project.workspace.studies?.find(item => item.id === saved.studyId);
  if (!study || quantumStudySelectionHash(project, study) !== saved.selectionHash)
    return withheld("The saved quantum selection changed since this Workbook was published.");
  const report = await quantumStudySelectionEvidence(project, study);
  if (canonicalJsonStringify(report) !== canonicalJsonStringify(saved.snapshot))
    return withheld("Current source evidence differs from the saved citation; values are withheld.", report.omissions);
  return { status: "current", report: saved.snapshot, omissions: [...report.omissions], saved };
}
