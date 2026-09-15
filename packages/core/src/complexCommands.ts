import { immutableCanonicalJsonClone, type CommandDefinition, type DeepReadonly } from "./commands";
import type { CanonicalJsonValue, StructuralHash } from "./documentIdentity";
import {
  complexAnalysisSourceHash,
  createComplexAnalysisDocument,
  normalizeComplexAnalysisDocument,
  type ComplexAnalysisDocument,
  type ComplexAnalysisStructuralSource,
} from "./complexAnalysisDocument";
import type { ValidationResult } from "./validation";

export const COMPLEX_COMMAND_TYPES = {
  setFunction: "complex.function.set",
  setParameters: "complex.parameters.set",
  setDomain: "complex.domain.set",
  setSampling: "complex.sampling.set",
  setContours: "complex.contours.set",
  setBranchPolicy: "complex.branch-policy.set",
  setCovering: "complex.covering.set",
  setMobius: "complex.mobius.set",
  commitSelection: "complex.selection.commit",
  requestAnalysis: "complex.analysis.request",
  requestValueSurface: "complex.value-surface.request",
} as const;

export type ComplexCommittedSelection = Readonly<{
  space: "z-plane" | "w-plane" | "riemann-sphere";
  point: Readonly<{ re: number; im: number }> | null;
  entityId: string | null;
}>;

export type ComplexSourceBoundRequest = Readonly<{
  requestId: string;
  requestType: string;
  sourceRevision: number;
  sourceHash: StructuralHash;
}>;

export type ComplexValueSurfaceRequest = ComplexSourceBoundRequest & Readonly<{
  quantity: "re" | "im" | "abs" | "arg" | "sheet-index";
  quality: "preview" | "full";
}>;

export type ComplexCommandState = Readonly<{
  document: ComplexAnalysisDocument;
  committedSelection: ComplexCommittedSelection | null;
  analysisRequest: ComplexSourceBoundRequest | null;
  valueSurfaceRequest: ComplexValueSurfaceRequest | null;
}>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
const isRecord = (value: unknown): value is Record<string, CanonicalJsonValue> => !!value && typeof value === "object" && !Array.isArray(value);
const exactFields = (record: Record<string, CanonicalJsonValue>, expected: readonly string[]) => {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((field, index) => field === sorted[index]);
};
const valuePayload = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> =>
  isRecord(payload) && exactFields(payload, ["value"])
    ? { ok: true, value: clone(payload) }
    : { ok: false, errors: ["Complex semantic edit requires exactly one 'value' field."] };
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const NAMESPACED_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

const sourceOf = (document: ComplexAnalysisDocument): ComplexAnalysisStructuralSource => ({
  function: document.function, parameters: document.parameters, assumptions: document.assumptions,
  domain: document.domain, sampling: document.sampling, contours: document.contours,
  branchPolicy: document.branchPolicy, covering: document.covering, mobius: document.mobius,
});

const replaceField = <Field extends keyof ComplexAnalysisStructuralSource>(
  state: DeepReadonly<ComplexCommandState>,
  field: Field,
  value: ComplexAnalysisStructuralSource[Field]
): ComplexCommandState => {
  const current = state.document as ComplexAnalysisDocument;
  const nextSource = { ...sourceOf(current), [field]: clone(value) } as ComplexAnalysisStructuralSource;
  if (complexAnalysisSourceHash(nextSource) === current.identity.structuralHash) return clone(state) as ComplexCommandState;
  const results = current.results.map((result) => result.state === "available" ? { ...result, state: "unavailable" as const } : result);
  return {
    document: createComplexAnalysisDocument(nextSource, {
      id: current.identity.id,
      revision: current.identity.revision + 1,
      results,
      provenance: clone(current.provenance),
    }),
    committedSelection: null,
    analysisRequest: null,
    valueSurfaceRequest: null,
  };
};

const setFieldDefinition = <Field extends keyof ComplexAnalysisStructuralSource>(
  type: string,
  field: Field
): CommandDefinition<ComplexCommandState> => ({
  type,
  validate: valuePayload,
  project: (state, payload) => replaceField(state, field, (payload as Record<string, unknown>).value as ComplexAnalysisStructuralSource[Field]),
});

const validateSelection = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["space", "point", "entityId"]) || !["z-plane", "w-plane", "riemann-sphere"].includes(String(payload.space))) return { ok: false, errors: ["Committed selection requires exactly a valid space, point, and entityId."] };
  if (payload.entityId !== null && (typeof payload.entityId !== "string" || !SAFE_ID.test(payload.entityId))) return { ok: false, errors: ["Committed selection entityId must be ID-safe or null."] };
  if (payload.point !== null && (!isRecord(payload.point) || !exactFields(payload.point, ["re", "im"]) || !Number.isFinite(payload.point.re) || !Number.isFinite(payload.point.im))) return { ok: false, errors: ["Committed selection point must have finite re/im or be null."] };
  return { ok: true, value: clone(payload) };
};

const validateRequest = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["requestId", "requestType"]) || typeof payload.requestId !== "string" || !SAFE_ID.test(payload.requestId) || typeof payload.requestType !== "string" || !NAMESPACED_TYPE.test(payload.requestType)) return { ok: false, errors: ["Analysis request requires an ID-safe requestId and namespaced requestType."] };
  return { ok: true, value: clone(payload) };
};

const validateValueSurfaceRequest = (payload: CanonicalJsonValue): ValidationResult<CanonicalJsonValue> => {
  if (!isRecord(payload) || !exactFields(payload, ["requestId", "quantity", "quality"]) || typeof payload.requestId !== "string" || !SAFE_ID.test(payload.requestId) || !["re", "im", "abs", "arg", "sheet-index"].includes(String(payload.quantity)) || !["preview", "full"].includes(String(payload.quality))) return { ok: false, errors: ["Value-surface request requires requestId, supported quantity, and preview/full quality."] };
  return { ok: true, value: clone(payload) };
};

const boundRequest = (state: DeepReadonly<ComplexCommandState>, requestId: string, requestType: string): ComplexSourceBoundRequest => ({
  requestId, requestType, sourceRevision: state.document.identity.revision, sourceHash: state.document.identity.structuralHash,
});

export const complexCommandDefinitions: readonly CommandDefinition<ComplexCommandState>[] = [
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setFunction, "function"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setParameters, "parameters"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setDomain, "domain"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setSampling, "sampling"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setContours, "contours"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setBranchPolicy, "branchPolicy"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setCovering, "covering"),
  setFieldDefinition(COMPLEX_COMMAND_TYPES.setMobius, "mobius"),
  { type: COMPLEX_COMMAND_TYPES.commitSelection, validate: validateSelection, project: (state, payload) => ({ ...clone(state), committedSelection: clone(payload) as unknown as ComplexCommittedSelection }) },
  { type: COMPLEX_COMMAND_TYPES.requestAnalysis, validate: validateRequest, project: (state, payload) => {
    const request = payload as Record<string, CanonicalJsonValue>;
    return { ...clone(state), analysisRequest: boundRequest(state, request.requestId as string, request.requestType as string) };
  } },
  { type: COMPLEX_COMMAND_TYPES.requestValueSurface, validate: validateValueSurfaceRequest, project: (state, payload) => {
    const request = payload as Record<string, CanonicalJsonValue>;
    return { ...clone(state), valueSurfaceRequest: { ...boundRequest(state, request.requestId as string, "complex.value-surface"), quantity: request.quantity as ComplexValueSurfaceRequest["quantity"], quality: request.quality as ComplexValueSurfaceRequest["quality"] } };
  } },
];

export const createComplexCommandState = (document: ComplexAnalysisDocument): ComplexCommandState => {
  const normalized = normalizeComplexAnalysisDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return { document: normalized.value, committedSelection: null, analysisRequest: null, valueSurfaceRequest: null };
};
