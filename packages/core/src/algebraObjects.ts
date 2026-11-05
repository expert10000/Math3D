import {
  canonicalJsonStringify,
  isStableDocumentId,
  isStructuralHash,
  structuralHash,
  type StableDocumentId,
  type StructuralHash,
} from "./documentIdentity";
import { parseIdealGenerator } from "./algebraIdealGenerators";
import { analyzeQuadraticNumberField } from "./quadraticNumberField";
import { requireBiquadraticGenerator, requireBiquadraticRadicand } from "./biquadraticFieldTower";
import { parseFiniteGroupDefinition, type FiniteGroupDefinition } from "./finiteGroup";

export const ALGEBRA_OBJECT_SCHEMA_VERSION = 1 as const;

/** Declarative exact domains, polynomial rings and bounded ideals. */
export type AlgebraObjectDefinition =
  | Readonly<{ kind: "integer-ring" }>
  | Readonly<{ kind: "rational-field" }>
  | Readonly<{ kind: "modular-ring"; modulus: string }>
  | Readonly<{ kind: "finite-field"; characteristic: number; degree: number; generator: string; construction: "canonical" }>
  | Readonly<{ kind: "number-field"; baseField: AlgebraObjectRef;
      definingPolynomial: readonly [string, string, "1"]; generator: string }>
  | Readonly<{ kind: "field-extension"; baseField: AlgebraObjectRef; radicand: string; generator: string }>
  | Readonly<{ kind: "polynomial-ring"; coefficientDomain: AlgebraObjectRef; variables: readonly string[]; monomialOrder: AlgebraMonomialOrder }>
  | Readonly<{ kind: "ideal"; ambientRing: AlgebraObjectRef; generators: readonly string[] }>
  | Readonly<{ kind: "quotient-ring"; ambientRing: AlgebraObjectRef; ideal: AlgebraObjectRef }>
  | FiniteGroupDefinition;

export type AlgebraObjectKind = AlgebraObjectDefinition["kind"];
export type AlgebraMonomialOrder = "lex" | "deglex" | "degrevlex";

/** References pin a specific revision; a label or current object pointer is not a mathematical parent. */
export type AlgebraObjectRef = Readonly<{ objectId: StableDocumentId; revision: number }>;

export type AlgebraObjectRecord = Readonly<{
  schemaVersion: typeof ALGEBRA_OBJECT_SCHEMA_VERSION;
  id: StableDocumentId;
  kind: AlgebraObjectKind;
  label: string;
  revision: number;
  definition: AlgebraObjectDefinition;
  dependencies: readonly AlgebraObjectRef[];
  contentHash: StructuralHash;
}>;

export type AlgebraObjectDraft = Pick<AlgebraObjectRecord, "id" | "label" | "revision" | "definition">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object.`);
  return value;
};

const requireKeys = (value: Record<string, unknown>, keys: readonly string[], path: string): void => {
  const actual = Object.keys(value);
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  const extra = actual.filter((key) => !keys.includes(key));
  if (missing.length || extra.length) {
    throw new TypeError(`${path} has ${missing.length ? `missing fields: ${missing.join(", ")}` : `unknown fields: ${extra.join(", ")}`}.`);
  }
};

const requireRevision = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError(`${path} must be a positive safe integer.`);
  }
  return value as number;
};

const requireAlgebraId = (value: unknown, path: string): StableDocumentId => {
  if (!isStableDocumentId(value) || !value.startsWith("math3d:algebra:")) {
    throw new TypeError(`${path} must be a stable math3d:algebra object ID.`);
  }
  return value;
};

const requireIdentifier = (value: unknown, path: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(value) || value.length > 64) {
    throw new TypeError(`${path} must be an ASCII mathematical identifier of at most 64 characters.`);
  }
  return value;
};

const requirePrime = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 2 || (value as number) > 1_000_000_000) {
    throw new TypeError(`${path} must be a prime integer between 2 and 1000000000.`);
  }
  const n = value as number;
  for (let divisor = 2; divisor * divisor <= n; divisor += 1) {
    if (n % divisor === 0) throw new TypeError(`${path} must be prime.`);
  }
  return n;
};

const requireRef = (value: unknown, path: string): AlgebraObjectRef => {
  const ref = requireRecord(value, path);
  requireKeys(ref, ["objectId", "revision"], path);
  return { objectId: requireAlgebraId(ref.objectId, `${path}.objectId`), revision: requireRevision(ref.revision, `${path}.revision`) };
};

const requireDefinition = (value: unknown): AlgebraObjectDefinition => {
  const definition = requireRecord(value, "definition");
  switch (definition.kind) {
    case "integer-ring":
    case "rational-field":
      requireKeys(definition, ["kind"], "definition");
      return { kind: definition.kind };
    case "modular-ring":
      requireKeys(definition, ["kind", "modulus"], "definition");
      if (typeof definition.modulus !== "string" || definition.modulus.length > 4096 ||
          !/^[1-9][0-9]*$/.test(definition.modulus) ||
          BigInt(definition.modulus) < 2n) {
        throw new TypeError("definition.modulus must be a canonical decimal integer greater than 1 with at most 4096 digits.");
      }
      return { kind: definition.kind, modulus: definition.modulus };
    case "finite-field": {
      requireKeys(definition, ["kind", "characteristic", "degree", "generator", "construction"], "definition");
      const characteristic = requirePrime(definition.characteristic, "definition.characteristic");
      if (!Number.isSafeInteger(definition.degree) || (definition.degree as number) < 1 || (definition.degree as number) > 256) {
        throw new TypeError("definition.degree must be an integer between 1 and 256.");
      }
      if (definition.construction !== "canonical") {
        throw new TypeError("definition.construction must be canonical in schema version 1.");
      }
      return { kind: definition.kind, characteristic, degree: definition.degree as number,
        generator: requireIdentifier(definition.generator, "definition.generator"), construction: "canonical" };
    }
    case "number-field": {
      requireKeys(definition, ["kind", "baseField", "definingPolynomial", "generator"], "definition");
      const facts = analyzeQuadraticNumberField(definition.definingPolynomial, definition.generator);
      return { kind: "number-field", baseField: requireRef(definition.baseField, "definition.baseField"),
        definingPolynomial: facts.coefficients, generator: facts.generator };
    }
    case "field-extension":
      requireKeys(definition, ["kind", "baseField", "radicand", "generator"], "definition");
      return { kind: "field-extension", baseField: requireRef(definition.baseField, "definition.baseField"),
        radicand: requireBiquadraticRadicand(definition.radicand),
        generator: requireBiquadraticGenerator(definition.generator) };
    case "polynomial-ring": {
      requireKeys(definition, ["kind", "coefficientDomain", "variables", "monomialOrder"], "definition");
      const coefficientDomain = requireRef(definition.coefficientDomain, "definition.coefficientDomain");
      if (!Array.isArray(definition.variables) || definition.variables.length < 1 || definition.variables.length > 16) {
        throw new TypeError("definition.variables must contain 1 to 16 identifiers.");
      }
      const variables = definition.variables.map((variable: unknown, index: number) =>
        requireIdentifier(variable, `definition.variables[${index}]`));
      if (new Set(variables).size !== variables.length) {
        throw new TypeError("definition.variables must be distinct.");
      }
      if (definition.monomialOrder !== "lex" && definition.monomialOrder !== "deglex" && definition.monomialOrder !== "degrevlex") {
        throw new TypeError("definition.monomialOrder must be lex, deglex, or degrevlex.");
      }
      return { kind: definition.kind, coefficientDomain, variables, monomialOrder: definition.monomialOrder };
    }
    case "ideal": {
      requireKeys(definition, ["kind", "ambientRing", "generators"], "definition");
      const ambientRing = requireRef(definition.ambientRing, "definition.ambientRing");
      if (!Array.isArray(definition.generators) || definition.generators.length < 1 || definition.generators.length > 8)
        throw new TypeError("definition.generators must contain 1 to 8 exact polynomials.");
      const generators = definition.generators.map((value: unknown) => parseIdealGenerator(value));
      if (new Set(generators).size !== generators.length)
        throw new TypeError("definition.generators must be distinct.");
      return { kind: "ideal", ambientRing, generators };
    }
    case "quotient-ring":
      requireKeys(definition, ["kind", "ambientRing", "ideal"], "definition");
      return { kind: "quotient-ring", ambientRing: requireRef(definition.ambientRing, "definition.ambientRing"),
        ideal: requireRef(definition.ideal, "definition.ideal") };
    case "finite-group":
      return parseFiniteGroupDefinition(definition);
    default:
      throw new TypeError(`Unsupported algebra object kind '${String(definition.kind)}'.`);
  }
};

const dependenciesOf = (definition: AlgebraObjectDefinition): readonly AlgebraObjectRef[] =>
  definition.kind === "polynomial-ring" ? [definition.coefficientDomain]
    : definition.kind === "number-field" || definition.kind === "field-extension" ? [definition.baseField]
    : definition.kind === "ideal" ? [definition.ambientRing]
      : definition.kind === "quotient-ring" ? [definition.ambientRing, definition.ideal]
        : definition.kind === "finite-group" && definition.source ? [definition.source.ring] : [];

const definitionHash = (definition: AlgebraObjectDefinition): StructuralHash =>
  structuralHash({ schemaVersion: ALGEBRA_OBJECT_SCHEMA_VERSION, definition });

const freezeRecord = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeRecord(child);
    Object.freeze(value);
  }
  return value;
};

/** Validates JSON data and its version/hash before accepting it as an algebra object. */
export const parseAlgebraObjectRecord = (input: unknown): AlgebraObjectRecord => {
  // Also rejects accessors, cycles, non-finite numbers and non-JSON values in direct callers.
  const data = requireRecord(JSON.parse(canonicalJsonStringify(input)), "algebra object");
  requireKeys(data, ["schemaVersion", "id", "kind", "label", "revision", "definition", "dependencies", "contentHash"], "algebra object");
  if (data.schemaVersion !== ALGEBRA_OBJECT_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported algebra object schema version '${String(data.schemaVersion)}'.`);
  }
  const id = requireAlgebraId(data.id, "algebra object.id");
  const revision = requireRevision(data.revision, "algebra object.revision");
  const definition = requireDefinition(data.definition);
  if (data.kind !== definition.kind) throw new TypeError("algebra object.kind must match definition.kind.");
  if (typeof data.label !== "string" || !data.label.trim() || data.label !== data.label.trim() || data.label.length > 120) {
    throw new TypeError("algebra object.label must be nonempty, trimmed and at most 120 characters.");
  }
  const dependencies = dependenciesOf(definition);
  if (dependencies.some((ref) => ref.objectId === id)) throw new TypeError("An algebra object cannot depend on itself.");
  if (!Array.isArray(data.dependencies) || data.dependencies.length !== dependencies.length ||
      data.dependencies.some((value, index) => {
        const ref = requireRef(value, `algebra object.dependencies[${index}]`);
        return ref.objectId !== dependencies[index].objectId || ref.revision !== dependencies[index].revision;
      })) {
    throw new TypeError("algebra object.dependencies must match definition references exactly.");
  }
  const contentHash = definitionHash(definition);
  if (!isStructuralHash(data.contentHash) || data.contentHash !== contentHash) {
    throw new TypeError("algebra object.contentHash does not match its definition.");
  }
  return freezeRecord({ schemaVersion: ALGEBRA_OBJECT_SCHEMA_VERSION, id, kind: definition.kind, label: data.label,
    revision, definition, dependencies, contentHash });
};

/** Creates a valid record without deriving identity from its editable definition or label. */
export const createAlgebraObjectRecord = (draft: AlgebraObjectDraft): AlgebraObjectRecord => {
  const definition = requireDefinition(draft.definition);
  return parseAlgebraObjectRecord({ schemaVersion: ALGEBRA_OBJECT_SCHEMA_VERSION, id: draft.id,
    kind: definition.kind, label: draft.label, revision: draft.revision, definition,
    dependencies: dependenciesOf(definition), contentHash: definitionHash(definition) });
};

export const serializeAlgebraObjectRecord = (record: AlgebraObjectRecord): string =>
  canonicalJsonStringify(parseAlgebraObjectRecord(record));

export const deserializeAlgebraObjectRecord = (json: string): AlgebraObjectRecord =>
  parseAlgebraObjectRecord(JSON.parse(json));
