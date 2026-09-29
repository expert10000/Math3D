import { defaultGraph2DParameterDraft, graph2DParameterNumber, type Graph2DParameter, type Graph2DParameterDraft } from "./graph2dParameterTypes";
export type Graph2DParameterFields = Record<"name" | "value" | "min" | "max" | "step" | "unit", string>;
export const graph2DParameterFields = (parameter?: Graph2DParameter): Graph2DParameterFields => {
  const draft = defaultGraph2DParameterDraft(parameter);
  return { name: draft.name, value: String(draft.value), min: String(draft.min), max: String(draft.max), step: String(draft.step), unit: draft.unit };
};
export const graph2DParameterDraftFromFields = (fields: Graph2DParameterFields): Graph2DParameterDraft => ({ name: fields.name.trim(), unit: fields.unit.trim(),
  value: graph2DParameterNumber(fields.value), min: graph2DParameterNumber(fields.min), max: graph2DParameterNumber(fields.max), step: graph2DParameterNumber(fields.step) });
