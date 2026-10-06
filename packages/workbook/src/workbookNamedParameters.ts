import { isStructuralHash, structuralHash, type StructuralHash } from "@math3d/core";
import type { Workbook, WorkbookParamDef } from "./workbookModel";
import type { WorkbookDependency } from "./workbookDependencies";

export type WorkbookNamedParameter = Readonly<{ schemaVersion: 1; id: string; label: string; unit: string; min: number; max: number; step: number; value: number }>;
export const normalizeWorkbookNamedParameters = (value: unknown): readonly WorkbookNamedParameter[] => {
  if (!Array.isArray(value) || value.length > 32) throw new TypeError("Workbooks support up to 32 named parameters.");
  const ids = new Set<string>();
  for (const parameter of value) {
    if (!parameter || typeof parameter !== "object" || Object.keys(parameter).sort().join("|") !== "id|label|max|min|schemaVersion|step|unit|value" || parameter.schemaVersion !== 1 ||
      typeof parameter.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(parameter.id) || ["__proto__", "constructor", "prototype"].includes(parameter.id) || ids.has(parameter.id) ||
      typeof parameter.label !== "string" || !parameter.label.trim() || parameter.label.trim() !== parameter.label || parameter.label.length > 160 ||
      typeof parameter.unit !== "string" || !parameter.unit.trim() || parameter.unit.trim() !== parameter.unit || parameter.unit.length > 80 ||
      [parameter.min, parameter.max, parameter.step, parameter.value].some(item => typeof item !== "number" || !Number.isFinite(item)) ||
      parameter.min >= parameter.max || parameter.step <= 0 || parameter.step > parameter.max - parameter.min || parameter.value < parameter.min || parameter.value > parameter.max ||
      Math.abs((parameter.value - parameter.min) / parameter.step - Math.round((parameter.value - parameter.min) / parameter.step)) > 1e-7)
      throw new TypeError("Named parameters require stable IDs, labels, units, finite bounds, a positive step and a value within bounds.");
    ids.add(parameter.id);
  }
  return JSON.parse(JSON.stringify(value));
};
export const workbookNamedParameterHash = (parameter: WorkbookNamedParameter): StructuralHash => {
  const { label: _label, ...source } = parameter;
  return structuralHash(source);
};
export const workbookParameterTargetValid = (parameter: WorkbookNamedParameter, def: WorkbookParamDef | undefined) => !!def && def.kind === "number" &&
  (def.unit === undefined || def.unit === parameter.unit) && (def.min === undefined || parameter.value >= def.min) && (def.max === undefined || parameter.value <= def.max) &&
  (def.step === undefined || Math.abs((parameter.value - (def.min ?? 0)) / def.step - Math.round((parameter.value - (def.min ?? 0)) / def.step)) < 1e-7);

/** Editing changes only explicit consumers. Execution remains a separate user action. */
export function updateWorkbookNamedParameter(workbook: Workbook, id: string, patch: Partial<Omit<WorkbookNamedParameter, "id" | "schemaVersion">>): Workbook {
  if (Object.keys(patch).some(key => !["label", "unit", "min", "max", "step", "value"].includes(key))) throw new TypeError("Unsupported parameter edit.");
  const current = workbook.namedParameters?.find(item => item.id === id);
  if (!current) throw new RangeError("Named parameter is missing.");
  const parameter = normalizeWorkbookNamedParameters([{ ...current, ...patch }])[0];
  const next = { ...workbook, namedParameters: workbook.namedParameters!.map(item => item.id === id ? parameter : item), stages: workbook.stages.map(stage => ({ ...stage, blocks: stage.blocks.map(block => {
    const bindings = (workbook.dependencies ?? []).filter(edge => edge.targetBlockId === block.id && edge.source.kind === "parameter" && edge.source.parameterId === id);
    if (!bindings.length) return block;
    const values = { ...block.params?.values };
    for (const edge of bindings) if (edge.source.kind === "parameter") {
      const source = edge.source;
      const def = block.params?.defs.find(item => item.id === source.targetParamId);
      if (!workbookParameterTargetValid(parameter, def)) throw new TypeError(`Parameter value or unit is incompatible with ${block.title} / ${def?.label ?? edge.source.targetParamId}.`);
      values[edge.source.targetParamId] = parameter.value;
    }
    return { ...block, params: { ...block.params!, values } };
  }) })) };
  return next;
}

export function bindWorkbookNamedParameter(workbook: Workbook, parameterId: string, blockId: string, def: WorkbookParamDef, edgeId: string): Workbook {
  const parameter = workbook.namedParameters?.find(item => item.id === parameterId), block = workbook.stages.flatMap(stage => stage.blocks).find(item => item.id === blockId);
  if (!parameter || !block || !["compute", "visualize"].includes(block.type) || !workbookParameterTargetValid(parameter, def)) throw new TypeError("Choose a compatible numeric operation or view parameter.");
  if (workbook.dependencies?.some(edge => edge.targetBlockId === blockId && edge.source.kind === "parameter" && edge.source.targetParamId === def.id)) throw new TypeError("This block parameter is already bound. Remove its existing binding first.");
  const source: WorkbookDependency["source"] = { kind: "parameter", parameterId, targetParamId: def.id, sourceHash: workbookNamedParameterHash(parameter) };
  return { ...workbook, dependencies: [...workbook.dependencies ?? [], { id: edgeId, targetBlockId: blockId, source }], stages: workbook.stages.map(stage => ({ ...stage, blocks: stage.blocks.map(item => item.id !== blockId ? item : {
    ...item, params: { ...item.params, defs: item.params?.defs.some(existing => existing.id === def.id) ? item.params.defs.map(existing => existing.id === def.id ? { ...existing, unit: parameter.unit } : existing) : [...item.params?.defs ?? [], { ...def, unit: parameter.unit }], values: { ...item.params?.values, [def.id]: parameter.value } }
  }) })) };
}

export function inspectWorkbookParameterBinding(edge: WorkbookDependency, workbook: Workbook) {
  if (edge.source.kind !== "parameter") throw new TypeError("Expected parameter binding.");
  const source = edge.source, parameter = workbook.namedParameters?.find(item => item.id === source.parameterId), block = workbook.stages.flatMap(stage => stage.blocks).find(item => item.id === edge.targetBlockId);
  if (!parameter) return { status: "missing" as const, reason: "Named parameter is unavailable; this binding has not been reassigned." };
  const def = block?.params?.defs.find(item => item.id === source.targetParamId);
  if (!workbookParameterTargetValid(parameter, def) || block?.params?.values[source.targetParamId] !== parameter.value) return { status: "missing" as const, reason: "Bound block parameter is missing or disagrees with its named source." };
  return isStructuralHash(source.sourceHash) && source.sourceHash === workbookNamedParameterHash(parameter)
    ? { status: "current" as const, reason: "Named parameter generation matches." } : { status: "stale" as const, reason: `Named parameter ${parameter.label} changed; run its affected blocks.` };
}

/** Includes explicit links and the existing inferred compute input edges; never all blocks. */
export function workbookParameterAffectedBlocks(workbook: Workbook, parameterId: string, inferred: ReadonlyMap<string, readonly string[]> = new Map()): readonly string[] {
  const outgoing = new Map<string, string[]>(), affected = new Set<string>();
  for (const edge of workbook.dependencies ?? []) {
    if (edge.source.kind === "parameter" && edge.source.parameterId === parameterId) affected.add(edge.targetBlockId);
    if (edge.source.kind === "block") outgoing.set(edge.source.blockId, [...outgoing.get(edge.source.blockId) ?? [], edge.targetBlockId]);
  }
  for (const [target, sources] of inferred) for (const source of sources) outgoing.set(source, [...outgoing.get(source) ?? [], target]);
  const add = (id: string) => { for (const target of outgoing.get(id) ?? []) if (!affected.has(target)) { affected.add(target); add(target); } };
  for (const id of [...affected]) add(id);
  return workbook.stages.flatMap(stage => stage.blocks).filter(block => affected.has(block.id)).map(block => block.id);
}
