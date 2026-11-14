import { createProjectStudyFromDocuments, matchesScientificSourceGeneration,
  upsertMath3DProjectWorkbook, upsertProjectStudy, viewerSourceFromDocument,
  type Math3DProject } from "@math3d/core";
import { createDefaultWorkbook, createNotebookReference } from "@math3d/workbook";
import { prepareProjectWorkbook } from "./projectWorkbookBinding";

export type VolumeMeshJourneyOption = Readonly<{
  volumeId: string;
  meshId: string;
  resultId: string;
  volumeTitle: string;
  meshTitle: string;
  isoValue: number;
}>;

/** Only a current extraction with an exact saved Mesh relation can start the guided Study. */
export function volumeMeshJourneyOptions(project: Math3DProject): readonly VolumeMeshJourneyOption[] {
  const options: VolumeMeshJourneyOption[] = [];
  for (const relation of project.workspace.relations) {
    const target = relation.target;
    if (relation.status !== "current" || relation.kind !== "derived-from" ||
        relation.operation !== "volume.extract.isosurface" ||
        target.type !== "document" || relation.sources.length !== 1) continue;
    const volume = project.workspace.entries.find(entry => entry.module === "volume" &&
      entry.expected.id === relation.sources[0]!.documentId);
    const mesh = project.workspace.entries.find(entry => entry.module === "mesh" &&
      entry.expected.id === target.generation.documentId);
    if (!volume || volume.checkpoint.format !== "math3d.volume-document" ||
        !mesh || mesh.checkpoint.format !== "math3d.mesh-document" ||
        !matchesScientificSourceGeneration(relation.sources[0]!, viewerSourceFromDocument({ identity: volume.expected })) ||
        !matchesScientificSourceGeneration(target.generation, viewerSourceFromDocument({ identity: mesh.expected }))) continue;
    const result = project.workspace.results.find(item =>
      item.provenance.operation.type === "volume.extract.isosurface" &&
      relation.producer?.resultIds?.includes(item.resultId) &&
      matchesScientificSourceGeneration(item.provenance.source, relation.sources[0]!));
    if (!result || result.status !== "numerical") continue;
    const parameters = result.provenance.operation.parameters;
    const isoValue = parameters && typeof parameters === "object" && !Array.isArray(parameters) ?
      (parameters as Record<string, unknown>).isoValue : null;
    if (typeof isoValue !== "number" || !Number.isFinite(isoValue)) continue;
    options.push({ volumeId: volume.expected.id, meshId: mesh.expected.id,
      resultId: result.resultId, volumeTitle: volume.checkpoint.metadata.title,
      meshTitle: mesh.checkpoint.metadata.label, isoValue });
  }
  return options;
}

export function prepareVolumeMeshStudy(project: Math3DProject, resultId: string): Readonly<{
  project: Math3DProject; studyId: string; workbookId: string; workbookBytes: Uint8Array;
}> {
  const option = volumeMeshJourneyOptions(project).find(item => item.resultId === resultId);
  if (!option) throw new TypeError("The Volume extraction or retained Mesh is missing or source-stale.");
  if (project.workspace.studies?.some(study => study.members.some(member => member.resultId === resultId)))
    throw new TypeError("This Volume extraction already has a saved Study.");
  let next = createProjectStudyFromDocuments(project, ["volume-mesh-study", resultId],
    `${option.volumeTitle} → isosurface ${option.isoValue} → Mesh`, [option.volumeId, option.meshId]);
  const study = next.workspace.studies!.find(item => item.members.some(member => member.documentId === option.meshId) &&
    item.members.some(member => member.documentId === option.volumeId))!;
  next = upsertProjectStudy(next, { ...study, members: study.members.map(member =>
    member.documentId === option.volumeId ? { ...member, resultId } : member) });
  const pinned = next.workspace.studies!.find(item => item.id === study.id)!;
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `volume-mesh-${resultId}-${++sequence}`);
  workbook.title = `${option.volumeTitle} isosurface research`;
  workbook.stages[0]!.blocks[0]!.text =
    `Extract isovalue ${option.isoValue} from the saved Volume. Inspect the retained Mesh and its exact source relation.`;
  workbook.stages[1]!.blocks = [
    { id: `volume-mesh-study-${resultId}`, type: "reference", title: "Saved Volume and Mesh Study",
      notebookReference: createNotebookReference(next, "study", pinned.id) },
    { id: `volume-mesh-result-${resultId}`, type: "reference", title: "Recorded extraction result",
      notebookReference: createNotebookReference(next, "result", resultId) },
  ];
  workbook.stages[3]!.blocks = [{ id: `volume-mesh-limit-${resultId}`, type: "text",
    title: "Interpretation and limits",
    text: "The isosurface is a numerical reconstruction at the saved threshold. Its Mesh is a retained snapshot; vertex and face counts do not certify smooth geometry or topology." }];
  const prepared = prepareProjectWorkbook(next, workbook, `volume-mesh-${resultId}`);
  next = upsertMath3DProjectWorkbook(next, prepared.reference);
  return { project: next, studyId: pinned.id, workbookId: prepared.reference.id,
    workbookBytes: prepared.bytes };
}
