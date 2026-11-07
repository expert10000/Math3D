/** Pinned exact curve invariants and a checked group-law fixture. */
import { canonicalJsonStringify, type StructuralHash } from "./documentIdentity";
import { ellipticCurveFacts, ellipticDouble } from "./ellipticCurve";
import type { AlgebraObjectRef } from "./algebraObjects";
import { buildSageAlgebraReconstructionInput, parseSageAlgebraReconstructionInput,
  type SageAlgebraReconstructionInput } from "./sageAlgebraReconstruction";
import type { Math3DProject } from "./math3dProject";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export type EllipticPoint = readonly [string, string] | null;
export type SageEllipticCurveInput = Readonly<{ format: "math3d.sage-elliptic-curve"; schemaVersion: 1;
  curve: SageAlgebraReconstructionInput; point: EllipticPoint }>;
export type SageEllipticCurveResult = Readonly<{ format: "math3d.sage-elliptic-curve-result"; schemaVersion: 1;
  target: AlgebraObjectRef; targetHash: StructuralHash; baseField: AlgebraObjectRef;
  characteristic: number; discriminant: string; jInvariant: string; singular: false;
  point: EllipticPoint; doublePoint: EllipticPoint }>;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const same = (a: unknown, b: unknown) => canonicalJsonStringify(a) === canonicalJsonStringify(b);
const point = (value: unknown): EllipticPoint => {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2 || value.some((entry) =>
    typeof entry !== "string" || !/^(?:0|-?[1-9][0-9]{0,3})$/.test(entry) ||
    BigInt(entry) < -4096n || BigInt(entry) > 4096n))
    throw new TypeError("Curve sample point requires two canonical integers bounded by 4096.");
  return [value[0], value[1]];
};
const source = (curve: SageAlgebraReconstructionInput) => {
  const target = curve.objects.at(-1)!;
  if (target.definition.kind !== "elliptic-curve") throw new TypeError("Choose a pinned elliptic curve.");
  const definition = target.definition;
  const base = curve.objects.find((item) => item.id === definition.baseField.objectId &&
    item.revision === definition.baseField.revision);
  if (base?.definition.kind !== "rational-field" && (base?.definition.kind !== "finite-field" ||
      base.definition.degree !== 1 || base.definition.characteristic < 5 || base.definition.characteristic > 1009))
    throw new TypeError("Curve requires a pinned QQ or prime GF(p) field.");
  const characteristic = base.definition.kind === "finite-field" ? base.definition.characteristic : 0;
  const facts = ellipticCurveFacts(definition.a, definition.b, characteristic);
  return { target, definition, facts };
};

export const parseSageEllipticCurveInput = (value: unknown): SageEllipticCurveInput => {
  if (!record(value) || !exact(value, ["format", "schemaVersion", "curve", "point"]) ||
      value.format !== "math3d.sage-elliptic-curve" || value.schemaVersion !== 1)
    throw new TypeError("Invalid versioned elliptic-curve request.");
  const curve = parseSageAlgebraReconstructionInput(value.curve);
  const { definition, facts } = source(curve), sample = point(value.point);
  ellipticDouble(definition.a, definition.b, facts.characteristic, sample);
  return { format: "math3d.sage-elliptic-curve", schemaVersion: 1, curve, point: sample };
};
export const buildSageEllipticCurveInput = (project: Math3DProject, target: AlgebraObjectRef,
  sample: EllipticPoint): SageEllipticCurveInput => parseSageEllipticCurveInput({
    format: "math3d.sage-elliptic-curve", schemaVersion: 1,
    curve: buildSageAlgebraReconstructionInput(project, target), point: sample,
  });
export const validateSageEllipticCurveSnapshot = (value: unknown, projectId: string,
  objects: readonly ProjectAlgebraObjectEntry[]): SageEllipticCurveInput => {
  const input = parseSageEllipticCurveInput(value);
  if (input.curve.projectId !== projectId || input.curve.objects.some((item) => {
    const saved = objects.find((entry) => entry.id === item.id)?.revisions[item.revision - 1];
    return !saved || !same(saved, item);
  })) throw new TypeError("Curve request differs from its pinned Project object.");
  return input;
};
export const parseSageEllipticCurveResult = (value: unknown,
  rawInput: SageEllipticCurveInput): SageEllipticCurveResult => {
  const input = parseSageEllipticCurveInput(rawInput);
  const { target, definition, facts } = source(input.curve);
  const expectedDouble = ellipticDouble(definition.a, definition.b, facts.characteristic, input.point);
  if (!record(value) || !exact(value, ["format", "schemaVersion", "target", "targetHash", "baseField",
    "characteristic", "discriminant", "jInvariant", "singular", "point", "doublePoint"]) ||
    value.format !== "math3d.sage-elliptic-curve-result" || value.schemaVersion !== 1 ||
    !same(value.target, input.curve.target) || value.targetHash !== target.contentHash ||
    !same(value.baseField, definition.baseField) || value.characteristic !== facts.characteristic ||
    value.discriminant !== facts.discriminant || value.jInvariant !== facts.jInvariant ||
    value.singular !== false || !same(value.point, input.point) || !same(value.doublePoint, expectedDouble))
    throw new TypeError("Curve invariants or point doubling disagree with the pinned model.");
  return JSON.parse(canonicalJsonStringify(value)) as SageEllipticCurveResult;
};
