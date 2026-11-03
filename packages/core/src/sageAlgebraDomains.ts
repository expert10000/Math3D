import { type AlgebraObjectRef } from "./algebraObjects";
import { canonicalJsonStringify, structuralHash, type StructuralHash } from "./documentIdentity";
import type { Math3DProject } from "./math3dProject";
import { canonicalJsonByteLength } from "./scientificJobs";
import { buildSageAlgebraReconstructionInput, parseSageAlgebraReconstructionInput,
  type SageAlgebraReconstructionInput } from "./sageAlgebraReconstruction";

export const SAGE_ALGEBRA_DOMAIN_FORMAT = "math3d.sage-algebra-domain-inspection" as const;
export const SAGE_ALGEBRA_DOMAIN_RESULT_FORMAT = "math3d.sage-algebra-domain-inspection-result" as const;
export const MAX_SAGE_ALGEBRA_DOMAIN_BYTES = 60 * 1024;

export type SageAlgebraDomainInput = Readonly<{
  format: typeof SAGE_ALGEBRA_DOMAIN_FORMAT;
  schemaVersion: 1;
  projectId: Math3DProject["identity"]["id"];
  left: SageAlgebraReconstructionInput;
  right: SageAlgebraReconstructionInput;
}>;

export type SageAlgebraDomainDescriptor = Readonly<{
  ref: AlgebraObjectRef;
  definitionHash: StructuralHash;
  kind: SageAlgebraReconstructionInput["objects"][number]["kind"];
  text: string;
  characteristic: string;
  isField: boolean;
  isCommutative: boolean;
  isExact: boolean;
  coefficientDomain: AlgebraObjectRef | null;
  variables: readonly string[];
  monomialOrder: "lex" | "deglex" | "degrevlex" | null;
}>;

export type SageAlgebraCoercion = Readonly<{
  source: AlgebraObjectRef;
  target: AlgebraObjectRef;
  sourceHash: StructuralHash;
  targetHash: StructuralHash;
  status: "canonical" | "incompatible" | "failed";
  mapId: StructuralHash | null;
  error: null | Readonly<{ code: "NO_CANONICAL_COERCION" | "COERCION_CHECK_FAILED"; message: string;
    sourceCharacteristic: string; targetCharacteristic: string }>;
}>;

export type SageAlgebraDomainResult = Readonly<{
  format: typeof SAGE_ALGEBRA_DOMAIN_RESULT_FORMAT;
  schemaVersion: 1;
  left: SageAlgebraDomainDescriptor;
  right: SageAlgebraDomainDescriptor;
  leftToRight: SageAlgebraCoercion;
  rightToLeft: SageAlgebraCoercion;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const sameRef = (value: unknown, ref: AlgebraObjectRef) => record(value) &&
  exact(value, ["objectId", "revision"]) && value.objectId === ref.objectId && value.revision === ref.revision;
const keyOf = (ref: AlgebraObjectRef) => `${ref.objectId}@${ref.revision}`;

export const parseSageAlgebraDomainInput = (value: unknown): SageAlgebraDomainInput => {
  if (canonicalJsonByteLength(value) > MAX_SAGE_ALGEBRA_DOMAIN_BYTES) {
    throw new TypeError("Sage algebra domain inspection exceeds 60 KiB.");
  }
  if (!record(value) || !exact(value, ["format", "schemaVersion", "projectId", "left", "right"]) ||
      value.format !== SAGE_ALGEBRA_DOMAIN_FORMAT || value.schemaVersion !== 1) {
    throw new TypeError("Invalid Sage algebra domain inspection envelope.");
  }
  const left = parseSageAlgebraReconstructionInput(value.left);
  const right = parseSageAlgebraReconstructionInput(value.right);
  if (value.projectId !== left.projectId || value.projectId !== right.projectId) {
    throw new TypeError("Sage algebra domains must belong to the same Project.");
  }
  const revisions = new Map(left.objects.map((item) => [keyOf({ objectId: item.id, revision: item.revision }),
    canonicalJsonStringify(item)]));
  for (const item of right.objects) {
    const key = keyOf({ objectId: item.id, revision: item.revision });
    const existing = revisions.get(key);
    if (existing !== undefined && existing !== canonicalJsonStringify(item)) {
      throw new TypeError(`Conflicting Sage algebra definition for ${key} across domain snapshots.`);
    }
  }
  return Object.freeze({ format: SAGE_ALGEBRA_DOMAIN_FORMAT, schemaVersion: 1,
    projectId: left.projectId, left, right });
};

/** Pins both domains to exact Project revisions before the Sage coercion check. */
export const buildSageAlgebraDomainInput = (project: Math3DProject, left: AlgebraObjectRef,
  right: AlgebraObjectRef): SageAlgebraDomainInput => parseSageAlgebraDomainInput({
    format: SAGE_ALGEBRA_DOMAIN_FORMAT, schemaVersion: 1, projectId: project.identity.id,
    left: buildSageAlgebraReconstructionInput(project, left),
    right: buildSageAlgebraReconstructionInput(project, right),
  });

const expectedCharacteristic = (snapshot: SageAlgebraReconstructionInput): string => {
  const byRef = new Map<string, string>();
  for (const object of snapshot.objects) {
    const definition = object.definition;
    const value = definition.kind === "modular-ring" ? definition.modulus
      : definition.kind === "finite-field" ? String(definition.characteristic)
      : definition.kind === "polynomial-ring" ? byRef.get(keyOf(definition.coefficientDomain))
      : "0";
    if (value === undefined) throw new TypeError("Unresolved algebra coefficient domain.");
    byRef.set(keyOf({ objectId: object.id, revision: object.revision }), value);
  }
  return byRef.get(keyOf(snapshot.target))!;
};

const parseDescriptor = (value: unknown, snapshot: SageAlgebraReconstructionInput): SageAlgebraDomainDescriptor => {
  const object = snapshot.objects[snapshot.objects.length - 1];
  const polynomial = object.definition.kind === "polynomial-ring" ? object.definition : null;
  if (!record(value) || !exact(value, ["ref", "definitionHash", "kind", "text", "characteristic",
    "isField", "isCommutative", "isExact", "coefficientDomain", "variables", "monomialOrder"]) ||
    !sameRef(value.ref, snapshot.target) || value.definitionHash !== object.contentHash || value.kind !== object.kind ||
    typeof value.text !== "string" || !value.text || value.text.length > 4096 ||
    value.characteristic !== expectedCharacteristic(snapshot) || typeof value.isField !== "boolean" ||
    typeof value.isCommutative !== "boolean" || typeof value.isExact !== "boolean" ||
    !Array.isArray(value.variables) || canonicalJsonStringify(value.variables) !== canonicalJsonStringify(polynomial?.variables ?? []) ||
    value.monomialOrder !== (polynomial?.monomialOrder ?? null) ||
    (polynomial ? !sameRef(value.coefficientDomain, polynomial.coefficientDomain) : value.coefficientDomain !== null)) {
    throw new TypeError("Invalid or mismatched Sage algebra domain descriptor.");
  }
  return value as SageAlgebraDomainDescriptor;
};

const parseCoercion = (value: unknown, source: SageAlgebraDomainDescriptor,
  target: SageAlgebraDomainDescriptor): SageAlgebraCoercion => {
  const expectedMapId = structuralHash({ schemaVersion: 1,
    source: { ...source.ref, definitionHash: source.definitionHash },
    target: { ...target.ref, definitionHash: target.definitionHash } });
  if (!record(value) || !exact(value, ["source", "target", "sourceHash", "targetHash", "status", "mapId", "error"]) ||
    !sameRef(value.source, source.ref) || !sameRef(value.target, target.ref) ||
    value.sourceHash !== source.definitionHash || value.targetHash !== target.definitionHash) {
    throw new TypeError("Sage algebra coercion references do not match the requested domains.");
  }
  if (value.status === "canonical" && value.mapId === expectedMapId && value.error === null) {
    return value as SageAlgebraCoercion;
  }
  if ((value.status === "incompatible" || value.status === "failed") && value.mapId === null && record(value.error) &&
      exact(value.error, ["code", "message", "sourceCharacteristic", "targetCharacteristic"]) &&
      value.error.code === (value.status === "incompatible" ? "NO_CANONICAL_COERCION" : "COERCION_CHECK_FAILED") &&
      typeof value.error.message === "string" && value.error.message.length > 0 && value.error.message.length <= 512 &&
      value.error.sourceCharacteristic === source.characteristic &&
      value.error.targetCharacteristic === target.characteristic) {
    return value as SageAlgebraCoercion;
  }
  throw new TypeError("Invalid Sage algebra coercion status or compatibility error.");
};

/** Accepts only domain facts and map references for the requested pinned revisions. */
export const parseSageAlgebraDomainResult = (value: unknown,
  input: SageAlgebraDomainInput): SageAlgebraDomainResult => {
  if (!record(value) || !exact(value, ["format", "schemaVersion", "left", "right", "leftToRight", "rightToLeft"]) ||
      value.format !== SAGE_ALGEBRA_DOMAIN_RESULT_FORMAT || value.schemaVersion !== 1 ||
      canonicalJsonByteLength(value) > 32 * 1024) {
    throw new TypeError("Invalid Sage algebra domain inspection result.");
  }
  const left = parseDescriptor(value.left, input.left);
  const right = parseDescriptor(value.right, input.right);
  parseCoercion(value.leftToRight, left, right);
  parseCoercion(value.rightToLeft, right, left);
  return Object.freeze(JSON.parse(canonicalJsonStringify(value)) as SageAlgebraDomainResult);
};
