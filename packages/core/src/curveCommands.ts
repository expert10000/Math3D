import type { CommandDefinition } from "./commands";
import { canonicalJsonStringify, type CanonicalJsonValue } from "./documentIdentity";
import {
  createCurveDocument, normalizeCurveDocument, replaceCurveDocumentAnalysisSettings,
  replaceCurveDocumentSelection, replaceCurveDocumentSource, type CurveDocument,
} from "./curveDocument";

export const CURVE_COMMAND_TYPES = {
  replaceSource: "curve.source.replace",
  setAnalysisSettings: "curve.analysis-settings.set",
  commitSelection: "curve.control-selection.commit",
} as const;

const object = (value: CanonicalJsonValue) => !!value && typeof value === "object" && !Array.isArray(value);
export const curveCommandDefinitions: readonly CommandDefinition<CurveDocument>[] = [
  {
    type: CURVE_COMMAND_TYPES.replaceSource,
    validate: (value) => {
      if (!object(value)) return { ok: false, errors: ["Curve source must be an object."] };
      try {
        const source = createCurveDocument({ source: value as CurveDocument["source"] }).source;
        return { ok: true, value: JSON.parse(canonicalJsonStringify(source)) as CanonicalJsonValue };
      } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
    },
    project: (state, payload) => replaceCurveDocumentSource(state as CurveDocument, payload as CurveDocument["source"]),
  },
  {
    type: CURVE_COMMAND_TYPES.setAnalysisSettings,
    validate: (value) => object(value) ? { ok: true, value } : { ok: false, errors: ["Curve analysis settings must be an object."] },
    project: (state, payload) => replaceCurveDocumentAnalysisSettings(state as CurveDocument, payload),
  },
  {
    type: CURVE_COMMAND_TYPES.commitSelection,
    validate: (value) => Array.isArray(value) && value.every((id) => typeof id === "string" && !!id) && new Set(value).size === value.length
      ? { ok: true, value } : { ok: false, errors: ["Curve control selection must contain distinct IDs."] },
    project: (state, payload) => replaceCurveDocumentSelection(state as CurveDocument, payload as readonly string[]),
  },
];

export const createCurveCommandState = (document: CurveDocument): CurveDocument => {
  const normalized = normalizeCurveDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
