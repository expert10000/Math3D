import { canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  isDocumentIdentity, isStableDocumentId, isStructuralHash, structuralHash,
  type DocumentIdentity, type StableDocumentId, type StructuralHash } from "./documentIdentity";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";
import type { ValidationResult } from "./validation";

export const DERIVED_FIELD_DOCUMENT_FORMAT = "math3d.derived-field-document" as const;
export const DERIVED_FIELD_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const DERIVED_FIELD_MAX_DOCUMENT_BYTES = 4096;
export type DerivedFieldAxis = Readonly<{ index: 0 | 1 | 2; name: string;
  unit: string; min: number; max: number }>;
export type DerivedFieldShape = Readonly<{ kind: "vector" | "scalar" | "tensor";
  axes: readonly DerivedFieldAxis[]; unit: string;
  componentUnits?: readonly [string, string, string] }>;
export type DerivedFieldInput = Readonly<{ kind: "vector3d" | "derived";
  documentId: StableDocumentId; revision: number; structuralHash: StructuralHash;
  shape: DerivedFieldShape }>;
export type DerivedFieldOperation =
  | Readonly<{ kind: "vector-magnitude" }>
  | Readonly<{ kind: "scalar-gradient" | "scalar-hessian" |
      "vector-jacobian" | "jacobian-symmetric" | "jacobian-antisymmetric" |
      "vorticity" | "helicity" | "enstrophy" |
      "vector-dot" | "vector-cross" | "vector-difference" }>
  | Readonly<{ kind: "directional-derivative";
      direction: readonly [number, number, number] }>
  | Readonly<{ kind: "plane-slice"; normalAxis: 0 | 1 | 2;
      coordinate: number; interpolation: "linear" }>
  | Readonly<{ kind: "line-profile"; varyingAxis: 0 | 1 | 2;
      fixedCoordinate: number; extent: readonly [number, number];
      samples: number; interpolation: "linear" }>;
export type DerivedFieldDocument = Readonly<{
  format: typeof DERIVED_FIELD_DOCUMENT_FORMAT;
  schemaVersion: typeof DERIVED_FIELD_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  input: DerivedFieldInput;
  secondaryInput?: DerivedFieldInput;
  operation: DerivedFieldOperation;
  output: DerivedFieldShape;
  metadata: Readonly<{ title: string }>;
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const label = (value: unknown, max = 80): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max &&
  value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const axisIndex = (value: unknown): value is 0 | 1 | 2 =>
  value === 0 || value === 1 || value === 2;
const validShape = (value: unknown): value is DerivedFieldShape => {
  if (!record(value) || !exact(value, ["kind", "axes", "unit"], ["componentUnits"]) ||
      !["scalar", "vector", "tensor"].includes(String(value.kind)) || !label(value.unit) ||
      !Array.isArray(value.axes) || value.axes.length < 1 || value.axes.length > 3 ||
      value.axes.some(axis => !record(axis) || !exact(axis, ["index", "name", "unit", "min", "max"]) ||
        !axisIndex(axis.index) || !label(axis.name) || !label(axis.unit) ||
        !finite(axis.min) || !finite(axis.max) || axis.min >= axis.max)) return false;
  const axes = value.axes as DerivedFieldAxis[];
  if (new Set(axes.map(axis => axis.index)).size !== axes.length ||
      axes.some((axis, index) => index > 0 && axis.index <= axes[index - 1]!.index)) return false;
  if (value.kind === "scalar") return value.componentUnits === undefined;
  if (value.kind === "tensor") return axes.length === 3 && value.componentUnits === undefined;
  return axes.length === 3 && Array.isArray(value.componentUnits) &&
    value.componentUnits.length === 3 && value.componentUnits.every(unit => label(unit)) &&
    value.unit === value.componentUnits[0];
};
const validInput = (value: unknown): value is DerivedFieldInput =>
  record(value) && exact(value, ["kind", "documentId", "revision", "structuralHash", "shape"]) &&
  (value.kind === "vector3d" || value.kind === "derived") &&
  isStableDocumentId(value.documentId) &&
  value.documentId.startsWith(value.kind === "derived" ? "math3d:derived-field:" : "math3d:vector-field3d:") &&
  Number.isSafeInteger(value.revision) && Number(value.revision) >= 1 &&
  isStructuralHash(value.structuralHash) && validShape(value.shape) &&
  (value.kind !== "vector3d" || value.shape.kind === "vector" && value.shape.axes.length === 3);
const validOperation = (value: unknown): value is DerivedFieldOperation =>
  record(value) && (value.kind === "vector-magnitude" && exact(value, ["kind"]) ||
    ["scalar-gradient", "scalar-hessian", "vector-jacobian", "jacobian-symmetric",
      "jacobian-antisymmetric", "vorticity", "helicity", "enstrophy",
      "vector-dot", "vector-cross", "vector-difference"].includes(String(value.kind)) &&
      exact(value, ["kind"]) ||
    value.kind === "directional-derivative" && exact(value, ["kind", "direction"]) &&
      Array.isArray(value.direction) && value.direction.length === 3 &&
      value.direction.every(finite) && Math.hypot(...value.direction as number[]) > 0 ||
    value.kind === "plane-slice" && exact(value, ["kind", "normalAxis", "coordinate", "interpolation"]) &&
      axisIndex(value.normalAxis) && finite(value.coordinate) && value.interpolation === "linear" ||
    value.kind === "line-profile" && exact(value, ["kind", "varyingAxis", "fixedCoordinate", "extent", "samples", "interpolation"]) &&
      axisIndex(value.varyingAxis) && finite(value.fixedCoordinate) &&
      Array.isArray(value.extent) && value.extent.length === 2 &&
      finite(value.extent[0]) && finite(value.extent[1]) && value.extent[0] < value.extent[1] &&
      Number.isSafeInteger(value.samples) && Number(value.samples) >= 2 && Number(value.samples) <= 2048 &&
      value.interpolation === "linear");

/** A one-step type/domain check. No samples or numerical freshness are inferred here. */
export const deriveFieldOutput = (input: DerivedFieldShape,
  operation: DerivedFieldOperation, secondary?: DerivedFieldShape): DerivedFieldShape => {
  if (!validShape(input) || !validOperation(operation))
    throw new TypeError("Invalid derived field input or operation.");
  const binary = ["vector-dot", "vector-cross", "vector-difference"].includes(operation.kind);
  if (binary !== !!secondary) throw new TypeError("Binary vector operations require exactly two inputs.");
  if (secondary && (!validShape(secondary) || input.kind !== "vector" ||
      secondary.kind !== "vector" || input.axes.length !== 3 ||
      canonicalJsonStringify(input.axes) !== canonicalJsonStringify(secondary.axes) ||
      canonicalJsonStringify(input.componentUnits) !==
        canonicalJsonStringify(secondary.componentUnits) ||
      new Set(input.componentUnits).size !== 1))
    throw new TypeError("Binary vector inputs need identical physical frames and component units.");
  const axisUnit = input.axes[0]?.unit;
  const uniformAxes = input.axes.length === 3 &&
    input.axes.every(axis => axis.unit === axisUnit);
  const uniformVector = input.kind === "vector" &&
    new Set(input.componentUnits).size === 1;
  const vector = (unit: string): DerivedFieldShape =>
    ({ kind: "vector", axes: input.axes, unit,
      componentUnits: [unit, unit, unit] });
  const scalar = (unit: string): DerivedFieldShape =>
    ({ kind: "scalar", axes: input.axes, unit });
  if (binary) return operation.kind === "vector-dot" ?
    scalar(`${input.unit}·${secondary!.unit}`) : operation.kind === "vector-cross" ?
      vector(`${input.unit}·${secondary!.unit}`) : vector(input.unit);
  if (["scalar-gradient", "scalar-hessian", "directional-derivative"].includes(operation.kind)) {
    if (input.kind !== "scalar" || !uniformAxes)
      throw new TypeError("Scalar derivatives need a 3D scalar with matching coordinate units.");
    if (operation.kind === "scalar-hessian")
      return { kind: "tensor", axes: input.axes, unit: `${input.unit}/${axisUnit}²` };
    return operation.kind === "scalar-gradient" ? vector(`${input.unit}/${axisUnit}`) :
      scalar(`${input.unit}/${axisUnit}`);
  }
  if (["vector-jacobian", "jacobian-symmetric", "jacobian-antisymmetric",
    "vorticity", "helicity", "enstrophy"].includes(operation.kind)) {
    if (!uniformAxes || !uniformVector)
      throw new TypeError("Vector derivatives need matching component and coordinate units.");
    const derivativeUnit = `${input.unit}/${axisUnit}`;
    if (operation.kind === "vorticity") return vector(derivativeUnit);
    if (operation.kind === "helicity") return scalar(`${input.unit}·${derivativeUnit}`);
    if (operation.kind === "enstrophy") return scalar(`${derivativeUnit}²`);
    return { kind: "tensor", axes: input.axes, unit: derivativeUnit };
  }
  if (operation.kind === "vector-magnitude") {
    if (input.kind !== "vector" || input.axes.length !== 3 ||
        new Set(input.componentUnits).size !== 1)
      throw new TypeError("Vector magnitude requires three components with compatible units.");
    return { kind: "scalar", axes: input.axes, unit: input.componentUnits![0] };
  }
  if (input.kind !== "scalar") throw new TypeError("Slice and profile require a scalar input.");
  if (operation.kind === "plane-slice") {
    const axis = input.axes.find(item => item.index === operation.normalAxis);
    if (input.axes.length !== 3 || !axis || operation.coordinate < axis.min ||
        operation.coordinate > axis.max)
      throw new RangeError("Plane coordinate is outside the scalar volume domain.");
    return { kind: "scalar", axes: input.axes.filter(item => item.index !== operation.normalAxis),
      unit: input.unit };
  }
  if (operation.kind !== "line-profile") throw new TypeError("Unsupported derived operation.");
  const varying = input.axes.find(item => item.index === operation.varyingAxis);
  const fixed = input.axes.find(item => item.index !== operation.varyingAxis);
  if (input.axes.length !== 2 || !varying || !fixed ||
      operation.fixedCoordinate < fixed.min || operation.fixedCoordinate > fixed.max ||
      operation.extent[0] < varying.min || operation.extent[1] > varying.max)
    throw new RangeError("Line profile is outside the sliced physical domain.");
  return { kind: "scalar", axes: [{ ...varying, min: operation.extent[0],
    max: operation.extent[1] }], unit: input.unit };
};

export const vectorFieldDerivedShape = (document: VectorField3DDocument): DerivedFieldShape => {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = checked.value.source.field;
  const componentUnits = field.kind === "expressions" ? field.components.map(item => item.unit) :
    field.componentUnits;
  return { kind: "vector", axes: checked.value.source.axes.map((axis, index) => ({
    index: index as 0 | 1 | 2, name: axis.label, unit: axis.unit,
    min: axis.min, max: axis.max })),
    unit: componentUnits[0]!, componentUnits: componentUnits as [string, string, string] };
};

export const normalizeDerivedFieldDocument = (value: unknown): ValidationResult<DerivedFieldDocument> => {
  try {
    if (!record(value) || !exact(value,
      ["format", "schemaVersion", "identity", "input", "operation", "output", "metadata"],
      ["secondaryInput"]) ||
        value.format !== DERIVED_FIELD_DOCUMENT_FORMAT ||
        value.schemaVersion !== DERIVED_FIELD_DOCUMENT_SCHEMA_VERSION ||
        !isDocumentIdentity(value.identity) ||
        !value.identity.id.startsWith("math3d:derived-field:") ||
        !validInput(value.input) ||
        (value.secondaryInput !== undefined && !validInput(value.secondaryInput)) ||
        !validOperation(value.operation) ||
        !validShape(value.output) || !record(value.metadata) ||
        !exact(value.metadata, ["title"]) || !label(value.metadata.title, 160))
      return { ok: false, errors: ["Invalid derived field document envelope."] };
    const expected = deriveFieldOutput(value.input.shape, value.operation,
      value.secondaryInput?.shape);
    const identitySource = { input: value.input,
      ...(value.secondaryInput === undefined ? {} : { secondaryInput: value.secondaryInput }),
      operation: value.operation, output: expected };
    if (canonicalJsonStringify(value.output) !== canonicalJsonStringify(expected) ||
        value.identity.structuralHash !== structuralHash(identitySource))
      return { ok: false, errors: ["Derived field output or identity disagrees with its recipe."] };
    const bytes = canonicalJsonStringify(value);
    if (new TextEncoder().encode(bytes).length > DERIVED_FIELD_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["Derived field document exceeds size limit."] };
    return { ok: true, value: JSON.parse(bytes) as DerivedFieldDocument };
  } catch (error) {
    return { ok: false, errors: [String((error as Error).message ?? error)] };
  }
};

export const createDerivedFieldDocument = (input: DerivedFieldInput,
  operation: DerivedFieldOperation, options: { stableKey: string; title: string;
    secondaryInput?: DerivedFieldInput }): DerivedFieldDocument => {
  const output = deriveFieldOutput(input.shape, operation, options.secondaryInput?.shape);
  const id = createStableDocumentId("derived-field", options.stableKey);
  const document = { format: DERIVED_FIELD_DOCUMENT_FORMAT,
    schemaVersion: DERIVED_FIELD_DOCUMENT_SCHEMA_VERSION,
    identity: createDocumentIdentity(id, { input,
      ...(options.secondaryInput ? { secondaryInput: options.secondaryInput } : {}),
      operation, output }),
    input, ...(options.secondaryInput ? { secondaryInput: options.secondaryInput } : {}),
    operation, output, metadata: { title: options.title.trim() } };
  const checked = normalizeDerivedFieldDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};
export const parseDerivedFieldDocument = (raw: string): DerivedFieldDocument => {
  const checked = normalizeDerivedFieldDocument(JSON.parse(raw));
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return checked.value;
};
export const serializeDerivedFieldDocument = (document: DerivedFieldDocument): string => {
  const checked = normalizeDerivedFieldDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  return canonicalJsonStringify(checked.value);
};
