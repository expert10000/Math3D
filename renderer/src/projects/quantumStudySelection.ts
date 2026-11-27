import { createMixedWorkspaceDocument, normalizeQuantumStudyDocument, replaceMath3DProjectWorkspace,
  type Math3DProject, type QuantumFieldDocument, type QuantumSceneDocument, type StudyRecordV1 } from "@math3d/core";
import { openVerifiedStudyQuantumScene } from "./studyQuantumSource";

type QuantumApi = NonNullable<Window["quantumScenes"]>;
type Role = "density" | "phase" | "chain" | "bands" | "stationary";
const sceneDocument = (project: Math3DProject, fingerprint: string) => project.workspace.entries
  .find(entry => entry.checkpoint.format === "math3d.quantum-scene-document" &&
    entry.checkpoint.source.sceneFingerprint === fingerprint)?.checkpoint as QuantumSceneDocument | undefined;
export const quantumStudyRecord = (project: Math3DProject, study: StudyRecordV1) => {
  const documents = study.members.map(member => project.workspace.entries
    .find(entry => entry.expected.id === member.documentId)?.checkpoint);
  return project.workspace.quantumStudies?.find(item => {
    if(item.templateId === "ute2-landau")return documents.length===1 && item.panels.length===1 &&
      documents[0]?.format === "math3d.quantum-scene-document" &&
      documents[0].source.sceneFingerprint === item.panels[0]?.sceneFingerprint;
    if (documents.length !== 2 || item.panels.length !== 2) return false;
    if (item.templateId === "hydrogen") return documents.some(document =>
      document?.format === "math3d.quantum-scene-document" &&
      document.source.sceneFingerprint === item.panels[0]!.sceneFingerprint) && documents.some(document =>
      document?.format === "math3d.quantum-field-document" &&
      document.source.scene.sceneFingerprint === item.panels[1]!.sceneFingerprint);
    if (item.templateId === "ssh") return item.panels.every(panel => documents.some(document =>
      document?.format === "math3d.quantum-scene-document" &&
      document.source.sceneFingerprint === panel.sceneFingerprint));
    return false;
  });
};

export function hydrogenGridIndex(project: Math3DProject, grid: readonly [number, number, number], fingerprint?: string) {
  const field = project.workspace.entries.find(entry => entry.checkpoint.format === "math3d.quantum-field-document" &&
    (!fingerprint || entry.checkpoint.source.scene.sceneFingerprint === fingerprint) &&
    entry.checkpoint.source.scene.provenance.model === "hydrogenic")?.checkpoint as QuantumFieldDocument | undefined;
  if (!field) throw new TypeError("Saved hydrogen Field is unavailable.");
  const shape = field.source.field.shape;
  if (grid.some((value, axis) => !Number.isSafeInteger(value) || value < 0 || value >= shape[axis]!))
    throw new TypeError("Hydrogen grid point is outside the saved Field.");
  const index = (grid[0] * shape[1] + grid[1]) * shape[2] + grid[2];
  if (index > 1_000_000) throw new TypeError("Hydrogen grid point exceeds the saved Study limit.");
  return index;
}

export function pinQuantumStudySample(project: Math3DProject, study: StudyRecordV1,
  role: Role, index: number, objectId: string | null = null): Math3DProject {
  const record = quantumStudyRecord(project, study);
  if (!record || !Number.isSafeInteger(index) || index < 0 || index > 1_000_000)
    throw new TypeError("Study selection is outside the saved quantum result.");
  if (record.templateId === "hydrogen" && !["density", "phase"].includes(role) ||
      record.templateId === "ssh" && !["chain", "bands"].includes(role) ||
      record.templateId === "ute2-landau" && (role !== "stationary" || objectId !== "stationary"))
    throw new TypeError("Study selection role differs from the saved template.");
  const panels = record.panels.map(panel => record.templateId === "hydrogen" || panel.role === role ?
    { ...panel, selectedObjectId: record.templateId === "hydrogen" ? null : objectId,
      sampleIndex: index } : panel);
  const documents = record.panels.map(panel => sceneDocument(project, panel.sceneFingerprint));
  if (documents.some(item => !item)) throw new TypeError("Saved quantum source document is missing.");
  const candidate = { ...record, panels };
  const checked = normalizeQuantumStudyDocument(candidate, documents as QuantumSceneDocument[]);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
    quantumStudies: project.workspace.quantumStudies!.map(item => item.id === record.id ? checked.value : item) }));
}

export async function quantumStudySelectionEvidence(project: Math3DProject, study: StudyRecordV1,
  api: QuantumApi | undefined = typeof window === "undefined" ? undefined : window.quantumScenes) {
  const record = quantumStudyRecord(project, study);
  if (!record) throw new TypeError("A saved supported quantum Study is required.");
  const sources = record.panels.map(panel => ({ role: panel.role, sceneFingerprint: panel.sceneFingerprint,
    datasets: sceneDocument(project, panel.sceneFingerprint)?.source.datasets.map(dataset =>
      ({ id: dataset.id, sha256: dataset.sha256, unit: dataset.unit })) ?? [] }));
  const base = { schema: "math3d.quantum-study-selection-evidence/v1", studyId: study.id,
    templateId: record.templateId, runId: record.source.runId, resultSha256: record.source.resultSha256, sources };
  const values: Record<string, unknown> = {}, omissions: string[] = [];
  try {
    if (!api) throw new TypeError("Desktop quantum source verifier is unavailable.");
    for (const panel of record.panels) {
      const document = sceneDocument(project, panel.sceneFingerprint);
      if (!document) throw new TypeError(`${panel.role} source document is missing.`);
      await openVerifiedStudyQuantumScene(project, document);
    }
    if (record.templateId === "ute2-landau") {
      const panel=record.panels[0]!;
      if(panel.sampleIndex===null || panel.selectedObjectId!=="stationary")
        omissions.push("No saved Landau stationary candidate is selected.");
      else {
        const sample=await api.ute2LandauSample({fingerprint:panel.sceneFingerprint,sampleIndex:panel.sampleIndex});
        if(sample.fingerprint!==panel.sceneFingerprint||sample.sampleIndex!==panel.sampleIndex||
            sample.runId!==record.source.runId||sample.resultSha256!==record.source.resultSha256)
          throw new TypeError("Landau candidate differs from its verified source.");
        values.stationary=sample;
      }
      omissions.push("Uniform dimensionless producer result; no fitted UTe2 phase boundary or material topology is inferred.");
    } else if (record.templateId === "hydrogen") {
      const field = project.workspace.entries.find(entry => entry.checkpoint.format === "math3d.quantum-field-document" &&
        entry.checkpoint.source.scene.sceneFingerprint === record.panels[0]!.sceneFingerprint)?.checkpoint as QuantumFieldDocument | undefined;
      const index = record.panels[0]!.sampleIndex;
      if (!field || index === null || record.panels[1]!.sampleIndex !== index)
        omissions.push("No common saved hydrogen grid point.");
      else {
        const shape = field.source.field.shape;
        const grid: [number, number, number] = [Math.floor(index / (shape[1] * shape[2])),
          Math.floor(index / shape[2]) % shape[1], index % shape[2]];
        if (hydrogenGridIndex(project, grid, record.panels[0]!.sceneFingerprint) !== index)
          throw new TypeError("Saved hydrogen grid point is outside the Field.");
        const request = { fingerprint: record.panels[0]!.sceneFingerprint, fieldId: field.source.field.id,
          axis: 2 as const, index: grid[2], u: grid[0], v: grid[1] };
        const density = await api.fieldSample({ ...request, quantity: "density" });
        const phase = await api.fieldSample({ ...request, quantity: "phase" });
        if (density.grid.some((value, axis) => value !== grid[axis]) ||
            phase.grid.some((value, axis) => value !== grid[axis]) ||
            density.position.some((value, axis) => Math.abs(value - phase.position[axis]!) > 1e-8))
          throw new TypeError("Hydrogen samples differ from the saved grid point.");
        values.density = { grid, position: density.position, coordinateAxes: field.source.mapping.axes,
          coordinateUnits: field.source.mapping.units, value: density.value, unit: density.unit };
        if (phase.undefinedNearNode || phase.value === null)
          omissions.push("Phase is undefined at this complex node.");
        else values.phase = { grid, position: phase.position, value: phase.value, unit: phase.unit,
          globalOffset: "arbitrary" };
      }
    } else {
      for (const panel of record.panels) {
        if (panel.sampleIndex === null || !panel.selectedObjectId) {
          omissions.push(`No saved ${panel.role} sample.`); continue;
        }
        const document = sceneDocument(project, panel.sceneFingerprint);
        if (!document) throw new TypeError(`${panel.role} source document is missing.`);
        await openVerifiedStudyQuantumScene(project, document);
        const sample = panel.role === "chain" ?
          await api.scalarSample({ fingerprint: panel.sceneFingerprint, objectId: panel.selectedObjectId,
            sampleIndex: panel.sampleIndex }) :
          await api.bandSample({ fingerprint: panel.sceneFingerprint, objectId: panel.selectedObjectId,
            sampleIndex: panel.sampleIndex });
        if (sample.fingerprint !== panel.sceneFingerprint || sample.objectId !== panel.selectedObjectId ||
            sample.sampleIndex !== panel.sampleIndex || sample.runId !== record.source.runId ||
            sample.resultSha256 !== record.source.resultSha256)
          throw new TypeError(`${panel.role} sample differs from its verified source.`);
        values[panel.role] = sample;
      }
      omissions.push("SSH chain and band selections are independent; edge/bulk classification is not inferred.");
    }
  } catch (error) {
    for (const key of Object.keys(values)) delete values[key];
    omissions.push(`Source verification failed: ${String((error as Error).message)}`);
  }
  return { ...base, values, omissions };
}
