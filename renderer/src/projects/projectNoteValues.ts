import { formatProjectNoteValueText, matchesScientificSourceGeneration, PROJECT_NOTE_RESULT_VALUE_FIELDS, structuralHash, viewerSourceFromDocument,
  type ProjectNote, type ProjectNoteResolvedValue, type ProjectNoteValueTarget, type MixedWorkspaceDocument, type KernelWorkspaceDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

export type NoteValueChoice = { key: string; label: string; binding: ProjectNoteValueTarget };
const scalar = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const resultValue = (summary: unknown, path: string): number | null => {
  let value = summary;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  return scalar(value);
};
const lengthUnits = (workspace: MixedWorkspaceDocument, id: string) => {
  const entry = workspace.entries.find(item => item.expected.id === id), source = entry && "source" in entry.checkpoint ? entry.checkpoint.source as { units?: { length?: string } } : undefined;
  if (typeof source?.units?.length === "string") return source.units.length;
  const relation = workspace.relations.find(item => item.target.type === "document" && item.target.generation.documentId === id && item.operation === "surface.tessellate-saved");
  const units = (relation?.parameters as { units?: unknown } | undefined)?.units;
  return typeof units === "string" ? units : "unknown";
};

export const projectNoteValueChoices = (workspace: MixedWorkspaceDocument): NoteValueChoice[] => {
  const choices: NoteValueChoice[] = [], docs = verifyMixedWorkspaceReplay(workspace);
  const add = (binding: ProjectNoteValueTarget, label: string) => choices.push({ key: JSON.stringify(binding), label, binding });
  for (const document of docs.values()) {
    const source = viewerSourceFromDocument(document);
    if (document.format === "math3d.graph2d-document") {
      for (const variable of document.source.variables) if (variable.control && scalar(variable.value) !== null) add({ kind: "parameter", source, parameterId: variable.name }, `Graph parameter ${variable.name}`);
    } else if ("source" in document && "parameters" in document.source && document.source.parameters && typeof document.source.parameters === "object") {
      for (const [parameterId, value] of Object.entries(document.source.parameters)) if (scalar(value) !== null) add({ kind: "parameter", source, parameterId }, `${document.identity.id} · parameter ${parameterId}`);
    }
    if (document.format === "math3d.geometry-document") for (const object of document.source.objects) for (const axis of ["x", "y", "z"] as const)
      add({ kind: "selection", source, objectId: object.id, field: `position.${axis}` }, `${document.display.objects[object.id]?.name ?? object.id} · position ${axis}`);
  }
  for (const result of workspace.results) if (!["failed", "cancelled", "unsupported"].includes(result.status)) {
    for (const field of PROJECT_NOTE_RESULT_VALUE_FIELDS) if (resultValue(result.summary, field) !== null)
      add({ kind: "result", source: result.provenance.source, resultId: result.resultId, resultHash: structuralHash(result), field }, `${result.provenance.operation.type} · ${field} · ${result.resultId.slice(-8)}`);
  }
  return choices;
};

export const resolveProjectNoteValues = (note: ProjectNote, workspace: MixedWorkspaceDocument | null): readonly ProjectNoteResolvedValue[] => {
  if (note.valueSnapshot) return note.valueSnapshot.values;
  const docs = workspace ? verifyMixedWorkspaceReplay(workspace) : new Map<string, KernelWorkspaceDocument>();
  return (note.valueBindings ?? []).map((binding): ProjectNoteResolvedValue => {
    const document = docs.get(binding.source.documentId), currentSource = document ? viewerSourceFromDocument(document) : null;
    const unavailable: ProjectNoteResolvedValue = { id: binding.id, value: null, units: "", status: "unavailable", source: currentSource };
    if (!workspace || !document || !currentSource) return unavailable;
    let value: number | null = null, units = "unknown";
    if (binding.kind === "parameter") {
      if (document.format === "math3d.graph2d-document") {
        const variable = document.source.variables.find((item: { name: string }) => item.name === binding.parameterId);
        value = variable?.control ? scalar(variable.value) : null; units = variable?.control?.unit || "unitless";
      } else if ("source" in document && "parameters" in document.source && document.source.parameters && Object.hasOwn(document.source.parameters, binding.parameterId)) value = scalar(document.source.parameters[binding.parameterId]);
    } else if (binding.kind === "selection" && document.format === "math3d.geometry-document") {
      const object = document.source.objects.find((item: { id: string }) => item.id === binding.objectId);
      value = object ? scalar(object.transform.position[binding.field.slice(-1) as "x" | "y" | "z"]) : null;
      units = lengthUnits(workspace, binding.source.documentId);
    } else if (binding.kind === "result") {
      const result = workspace.results.find(item => item.resultId === binding.resultId);
      if (!result || structuralHash(result) !== binding.resultHash || !matchesScientificSourceGeneration(result.provenance.source, binding.source) || ["failed", "cancelled", "unsupported"].includes(result.status)) return unavailable;
      value = resultValue(result.summary, binding.field);
      const length = lengthUnits(workspace, binding.source.documentId);
      units = binding.field === "gaussian.avg" ? length === "unknown" ? "unknown" : `${length}^-2` : binding.field === "mean.avg" ? length === "unknown" ? "unknown" : `${length}^-1` : binding.field === "length" ? length : "count";
    }
    return value === null ? unavailable : { id: binding.id, value, units, status: matchesScientificSourceGeneration(binding.source, currentSource) ? "current" : "stale", source: binding.kind === "result" ? binding.source : currentSource };
  });
};

export const projectNoteRenderedBody = (note: ProjectNote, workspace: MixedWorkspaceDocument | null) => formatProjectNoteValueText(note.body, resolveProjectNoteValues(note, workspace));
