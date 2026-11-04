import { canonicalJsonStringify, structuralHash } from "./documentIdentity";
import { normalizeVectorField3DDocument, type VectorField3DDocument } from "./vectorField3DDocument";

export const SCIENTIFIC_FRAME_UNIT_CONTRACT_FORMAT = "math3d.scientific-frame-unit-contract" as const;
export type ScientificFrameUnitContract = Readonly<{
  format: typeof SCIENTIFIC_FRAME_UNIT_CONTRACT_FORMAT; schemaVersion: 1;
  source: Readonly<{ documentId: string; revision: number; structuralHash: string }>;
  frame: Readonly<{ kind: "cartesian"; handedness: "right";
    axes: readonly ["x", "y", "z"] }>;
  units: Readonly<{ coordinates: readonly [string, string, string];
    components: readonly [string, string, string]; time: string }>;
  calculus: "physical-cartesian-derivatives";
  export: "physical-coordinates-and-units";
}>;
export type CartesianUnitConversion = Readonly<{
  contract: ScientificFrameUnitContract;
  target: Readonly<{ coordinates: readonly [string, string, string]; time: string }>;
  coordinateScale: readonly [number, number, number]; timeScale: number;
  componentScale: readonly [number, number, number];
  jacobianScale: readonly [readonly [number, number, number],
    readonly [number, number, number], readonly [number, number, number]];
  export: "explicit-target-physical-units";
  planHash: string;
}>;

const lengthToMetre: Readonly<Record<string, number>> = { mm: .001, cm: .01, m: 1, km: 1000 };
const timeToSecond: Readonly<Record<string, number>> = { ms: .001, s: 1, min: 60, h: 3600 };
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const triple = <T>(values: readonly T[]): readonly [T, T, T] => {
  if (values.length !== 3) throw new TypeError("Cartesian frame requires exactly three axes.");
  return [values[0]!, values[1]!, values[2]!];
};

/** Read an existing Cartesian source without changing its units or inventing conversion provenance. */
export function frameUnitContractFromVectorField(document: VectorField3DDocument): ScientificFrameUnitContract {
  const checked = normalizeVectorField3DDocument(document);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const field = document.source.field;
  return { format: SCIENTIFIC_FRAME_UNIT_CONTRACT_FORMAT, schemaVersion: 1,
    source: { documentId: document.identity.id, revision: document.identity.revision,
      structuralHash: document.identity.structuralHash },
    frame: { kind: "cartesian", handedness: "right", axes: ["x", "y", "z"] },
    units: { coordinates: triple(document.source.axes.map(axis => axis.unit)),
      components: field.kind === "expressions" ? triple(field.components.map(part => part.unit)) :
        field.componentUnits, time: document.source.timeUnit },
    calculus: "physical-cartesian-derivatives", export: "physical-coordinates-and-units" };
}

/** Explicit length/time conversions only; opaque legacy units remain readable but nonconvertible. */
export function planCartesianUnitConversion(contract: ScientificFrameUnitContract,
  target: Readonly<{ coordinates: readonly [string, string, string]; time: string }>): CartesianUnitConversion {
  if (contract.format !== SCIENTIFIC_FRAME_UNIT_CONTRACT_FORMAT || contract.schemaVersion !== 1 ||
      contract.frame.kind !== "cartesian" || contract.frame.handedness !== "right" ||
      contract.calculus !== "physical-cartesian-derivatives" ||
      contract.export !== "physical-coordinates-and-units" ||
      target.coordinates.length !== 3)
    throw new TypeError("Only a versioned right-handed Cartesian contract can be converted.");
  const source = contract.units;
  if (new Set(source.coordinates).size !== 1 || new Set(target.coordinates).size !== 1)
    throw new TypeError("Mixed coordinate units are unsupported for Cartesian calculus conversion.");
  if (source.coordinates.some((unit, i) => source.components[i] !== `${unit}/${source.time}`))
    throw new TypeError("Vector components must be physical coordinate units per time unit.");
  const coordinateScale = triple(source.coordinates.map((unit, i) => {
    const from = lengthToMetre[unit], to = lengthToMetre[target.coordinates[i]!];
    if (!from || !to) throw new TypeError("Unsupported or mixed coordinate dimensions; use explicit length units.");
    return from / to;
  }));
  const sourceTime = timeToSecond[source.time], targetTime = timeToSecond[target.time];
  if (!sourceTime || !targetTime)
    throw new TypeError("Unsupported time dimension or unit.");
  const timeScale = sourceTime / targetTime;
  const componentScale = triple(coordinateScale.map(scale => scale / timeScale));
  const jacobianScale = triple(componentScale.map(component =>
    triple(coordinateScale.map(coordinate => component / coordinate))));
  const recipe = { contract, target: { coordinates: triple(target.coordinates), time: target.time },
    coordinateScale, timeScale, componentScale, jacobianScale,
    export: "explicit-target-physical-units" as const };
  return { ...recipe, planHash: structuralHash(recipe) };
}

export function convertCartesianPoint(plan: CartesianUnitConversion,
  point: readonly [number, number, number]): readonly [number, number, number] {
  if (!point.every(Number.isFinite)) throw new TypeError("Physical point must be finite.");
  const converted = triple(point.map((value, i) => value * plan.coordinateScale[i]!));
  if (!converted.every(Number.isFinite)) throw new RangeError("Converted point is outside finite range.");
  return converted;
}

export function convertCartesianVector(plan: CartesianUnitConversion,
  vector: readonly [number, number, number]): readonly [number, number, number] {
  if (!vector.every(Number.isFinite)) throw new TypeError("Physical vector must be finite.");
  const converted = triple(vector.map((value, i) => value * plan.componentScale[i]!));
  if (!converted.every(Number.isFinite)) throw new RangeError("Converted vector is outside finite range.");
  return converted;
}

export function convertCartesianTime(plan: CartesianUnitConversion, time: number): number {
  if (!Number.isFinite(time)) throw new TypeError("Physical time must be finite.");
  const converted = time * plan.timeScale;
  if (!Number.isFinite(converted)) throw new RangeError("Converted time is outside finite range.");
  return converted;
}

export function convertCartesianJacobian(plan: CartesianUnitConversion,
  jacobian: readonly [readonly [number, number, number], readonly [number, number, number],
    readonly [number, number, number]]): typeof jacobian {
  if (jacobian.some(row => row.some(value => !Number.isFinite(value))))
    throw new TypeError("Physical Jacobian must be finite.");
  const converted = triple(jacobian.map((row, i) => triple(row.map((value, j) =>
    value * plan.jacobianScale[i]![j]!))));
  if (converted.some(row => row.some(value => !Number.isFinite(value))))
    throw new RangeError("Converted Jacobian is outside finite range.");
  return converted;
}

export const isFrameUnitContractCurrent = (contract: ScientificFrameUnitContract,
  document: VectorField3DDocument): boolean =>
  contract.source.documentId === document.identity.id &&
  contract.source.revision === document.identity.revision &&
  contract.source.structuralHash === document.identity.structuralHash &&
  canonicalJsonStringify(contract) === canonicalJsonStringify(frameUnitContractFromVectorField(document));

export const serializeFrameUnitContract = (contract: ScientificFrameUnitContract): string =>
  canonicalJsonStringify(contract);
export function parseFrameUnitContract(text: string): ScientificFrameUnitContract {
  const value = JSON.parse(text) as ScientificFrameUnitContract;
  if (value?.format !== SCIENTIFIC_FRAME_UNIT_CONTRACT_FORMAT || value.schemaVersion !== 1 ||
      !exact(value as unknown as Record<string, unknown>, ["format", "schemaVersion", "source", "frame", "units", "calculus", "export"]) ||
      !exact(value.source as unknown as Record<string, unknown>, ["documentId", "revision", "structuralHash"]) ||
      !exact(value.frame as unknown as Record<string, unknown>, ["kind", "handedness", "axes"]) ||
      !exact(value.units as unknown as Record<string, unknown>, ["coordinates", "components", "time"]) ||
      value.frame?.kind !== "cartesian" || value.frame.handedness !== "right" ||
      canonicalJsonStringify(value.frame.axes) !== canonicalJsonStringify(["x", "y", "z"]) ||
      value.calculus !== "physical-cartesian-derivatives" ||
      value.export !== "physical-coordinates-and-units" ||
      !value.source?.documentId || !Number.isSafeInteger(value.source.revision) ||
      !/^sha256:[a-f0-9]{64}$/.test(value.source.structuralHash) ||
      value.units?.coordinates.length !== 3 || value.units.components.length !== 3 ||
      !value.units.coordinates.every(unit => typeof unit === "string" && unit.length > 0) ||
      !value.units.components.every(unit => typeof unit === "string" && unit.length > 0) ||
      typeof value.units.time !== "string" || !value.units.time)
    throw new TypeError("Invalid versioned Cartesian frame/unit contract.");
  return value;
}
