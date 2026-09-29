import { advanceDocumentIdentity, structuralHash } from "./documentIdentity";
import { createGraph2DDocument, normalizeGraph2DDocument, type Graph2DDocument } from "./graph2dDocument";
import { validateGraph2DParameterDraft, type Graph2DParameterDraft } from "./graph2dParameterTypes";

export type Graph2DParameterAction =
  | { type: "parameter-create"; draft: Graph2DParameterDraft }
  | { type: "parameter-configure"; name: string; draft: Graph2DParameterDraft }
  | { type: "parameter-value"; name: string; value: number }
  | { type: "parameter-delete"; name: string };
export const isGraph2DParameterAction = (action: { type: string }): action is Graph2DParameterAction =>
  ["parameter-create", "parameter-configure", "parameter-value", "parameter-delete"].includes(action.type);

export const applyGraph2DParameterAction = (document: Graph2DDocument, action: Graph2DParameterAction): Pick<Graph2DDocument, "source" | "display" | "selection"> => {
  let variables = [...document.source.variables];
  const index = "name" in action ? variables.findIndex(parameter => parameter.name === action.name) : -1;
  if ("name" in action && index < 0) throw new TypeError("Parameter does not exist.");
  if (action.type === "parameter-create" || action.type === "parameter-configure") {
    const errors = validateGraph2DParameterDraft(action.draft); if (errors.length) throw new TypeError(errors.join(" "));
    const { name, value, min, max, step, unit } = action.draft, parameter = { name, value, control: { min, max, step, unit } };
    if (action.type === "parameter-create") {
      if (variables.length >= 16 || variables.some(existing => existing.name === name)) throw new TypeError("Parameter limit or duplicate name.");
      variables.push(parameter);
    } else { if (name !== action.name) throw new TypeError("Renaming parameters requires updating expressions; configure keeps the same name."); variables[index] = parameter; }
  } else if (action.type === "parameter-value") {
    const existing = variables[index], control = existing.control;
    if (!control || !Number.isFinite(action.value) || action.value < control.min || action.value > control.max) throw new TypeError("Configure a parameter range and choose an in-range finite value.");
    variables[index] = { ...existing, value: action.value };
  } else variables.splice(index, 1);
  const source = { ...document.source, variables }, selection = { ...document.selection, probe: null };
  // Validate bindings before the host creates a command or writes a checkpoint.
  const candidate = createGraph2DDocument({ source, display: document.display, selection, stableKey: document.identity.id, title: document.metadata.title });
  return { source: candidate.source, display: candidate.display, selection: candidate.selection };
};

/** Derived preview identity, never a command/checkpoint. Other values/source/style are unchanged. */
export const previewGraph2DParameterValues = (document: Graph2DDocument, values: Readonly<Record<string, number>>): Graph2DDocument => {
  if (Object.keys(values).length > 16) throw new TypeError("Too many parameter previews.");
  let source = document.source;
  for (const [name, value] of Object.entries(values)) source = applyGraph2DParameterAction({ ...document, source }, { type: "parameter-value", name, value }).source;
  const changed = structuralHash(source) !== document.identity.structuralHash;
  const normalized = normalizeGraph2DDocument({ ...document, source, selection: { objectId: document.selection.objectId, probe: null },
    identity: changed ? advanceDocumentIdentity(document.identity, source) : document.identity });
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
