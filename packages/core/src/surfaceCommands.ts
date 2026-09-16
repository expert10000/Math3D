import type { CommandDefinition } from "./commands";
import { canonicalJsonStringify, type CanonicalJsonValue } from "./documentIdentity";
import {
  createSurfaceDocument, normalizeSurfaceDocument, replaceSurfaceDocumentAnalysisSettings,
  replaceSurfaceDocumentSource, type SurfaceDocument,
} from "./surfaceDocument";

export const SURFACE_COMMAND_TYPES = {
  replaceSource: "surface.source.replace",
  setAnalysisSettings: "surface.analysis-settings.set",
} as const;

const object = (value: CanonicalJsonValue) => !!value && typeof value === "object" && !Array.isArray(value);
const validateSource: CommandDefinition<SurfaceDocument>["validate"] = (value) => {
  if (!object(value)) return { ok: false, errors: ["Surface source must be an object."] };
  try {
    const source = value as SurfaceDocument["source"];
    const candidate = createSurfaceDocument({ source });
    return { ok: true, value: JSON.parse(canonicalJsonStringify(candidate.source)) as CanonicalJsonValue };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const surfaceCommandDefinitions: readonly CommandDefinition<SurfaceDocument>[] = [
  {
    type: SURFACE_COMMAND_TYPES.replaceSource,
    validate: validateSource,
    project: (state, payload) => replaceSurfaceDocumentSource(state as SurfaceDocument, payload as SurfaceDocument["source"]),
  },
  {
    type: SURFACE_COMMAND_TYPES.setAnalysisSettings,
    validate: (value) => object(value) ? { ok: true, value } : { ok: false, errors: ["Surface analysis settings must be an object."] },
    project: (state, payload) => replaceSurfaceDocumentAnalysisSettings(state as SurfaceDocument, payload),
  },
];

export const createSurfaceCommandState = (document: SurfaceDocument): SurfaceDocument => {
  const normalized = normalizeSurfaceDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
