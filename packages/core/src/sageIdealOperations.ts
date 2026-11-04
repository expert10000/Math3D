import { parseIdealGenerator } from "./algebraIdealGenerators";
import { isProvablyHomogeneousIdeal } from "./algebraIdealGrading";
import { canonicalJsonStringify, type StructuralHash } from "./documentIdentity";
import type { AlgebraObjectRef, AlgebraMonomialOrder } from "./algebraObjects";
import type { Math3DProject } from "./math3dProject";
import { inspectProjectAlgebraFreshness } from "./projectAlgebraRegistry";
import type { ProjectAlgebraObjectEntry } from "./projectAlgebraRegistry";

export type SageIdealOperation = "sage.ideal.groebner" | "sage.ideal.eliminate" |
  "sage.ideal.membership" | "sage.ideal.quotientDimension" | "sage.ideal.syzygies" | "sage.ideal.hilbertSeries";
export type SageIdealArguments = Readonly<{ eliminate?: readonly string[]; polynomial?: string }>;
export type SageIdealInput = Readonly<{ format: "math3d.sage-ideal-operation"; schemaVersion: 1;
  target: AlgebraObjectRef; targetHash: StructuralHash; ideal: AlgebraObjectRef; idealHash: StructuralHash;
  ambientRing: AlgebraObjectRef; ambientHash: StructuralHash; variables: readonly string[];
  monomialOrder: AlgebraMonomialOrder; generators: readonly string[];
  eliminate?: readonly string[]; polynomial?: string }>;
export type SageIdealResult = Readonly<{ format: "math3d.sage-ideal-result"; schemaVersion: 1;
  target: AlgebraObjectRef; targetHash: StructuralHash; idealHash: StructuralHash;
  basis?: readonly string[]; eliminate?: readonly string[];
  polynomial?: string; member?: boolean; normalForm?: string;
  dimension?: number; quotientPresentation?: string;
  syzygies?: readonly (readonly string[])[]; generatorCount?: number;
  series?: string; numerator?: string; grading?: "standard" }>;

const entryAt = (project: Math3DProject, ref: AlgebraObjectRef) => {
  const entry = project.algebraObjects?.find((item) => item.id === ref.objectId);
  const record = entry?.revisions[ref.revision - 1];
  if (!entry || !record || entry.archived || ref.revision !== entry.revisions.length ||
      inspectProjectAlgebraFreshness(project).find((item) => item.objectId === ref.objectId)?.status !== "fresh")
    throw new TypeError("Select a current, fresh Project ideal or quotient revision.");
  return record;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const validRef = (value: unknown): value is AlgebraObjectRef => record(value) && exact(value, ["objectId", "revision"]) &&
  typeof value.objectId === "string" && value.objectId.length > 0 &&
  Number.isSafeInteger(value.revision) && (value.revision as number) > 0;
const sameRef = (left: unknown, right: AlgebraObjectRef) => validRef(left) &&
  left.objectId === right.objectId && left.revision === right.revision;

/** The worker's stronger budget is enforced before any job starts. */
export const buildSageIdealInput = (project: Math3DProject, target: AlgebraObjectRef,
  operation: SageIdealOperation, args: SageIdealArguments): SageIdealInput => {
  const selected = entryAt(project, target);
  const idealRef = selected.definition.kind === "quotient-ring" ? selected.definition.ideal : target;
  if (operation === "sage.ideal.quotientDimension" || operation === "sage.ideal.hilbertSeries"
    ? selected.kind !== "quotient-ring" : selected.kind !== "ideal")
    throw new TypeError("Choose the saved ideal or quotient required by this operation.");
  const ideal = entryAt(project, idealRef);
  if (ideal.definition.kind !== "ideal") throw new TypeError("The pinned ideal definition is missing.");
  const ambient = entryAt(project, ideal.definition.ambientRing);
  const ring = ambient.definition;
  if (ring.kind !== "polynomial-ring") throw new TypeError("The pinned ambient ring is missing.");
  if (ring.variables.length > 3 || ideal.definition.generators.length > 6 ||
      ideal.definition.generators.some((item) => item.length > 128)) {
    throw new TypeError("Ideal operations require at most three variables, six generators and 128 characters per generator.");
  }
  for (const generator of ideal.definition.generators) parseIdealGenerator(generator, ring.variables);
  if ((operation === "sage.ideal.syzygies" || operation === "sage.ideal.hilbertSeries") &&
      (ring.variables.length > 2 || ideal.definition.generators.length > 3))
    throw new TypeError("Advanced ideal operations require at most two variables and three generators.");
  if (operation === "sage.ideal.hilbertSeries" &&
      (ring.monomialOrder === "lex" || !isProvablyHomogeneousIdeal(ideal.definition.generators, ring.variables)))
    throw new TypeError("Hilbert series requires a graded monomial order and provably homogeneous generators.");
  if (selected.definition.kind === "quotient-ring" && (selected.definition.ambientRing.objectId !== ambient.id ||
      selected.definition.ambientRing.revision !== ambient.revision))
    throw new TypeError("The quotient's pinned ambient ring differs from its ideal.");
  if (!record(args) || !exact(args, operation === "sage.ideal.eliminate" ? ["eliminate"] :
      operation === "sage.ideal.membership" ? ["polynomial"] : []))
    throw new TypeError("Ideal operation arguments do not match the typed mode.");
  const variables = ring.variables;
  let extra: { eliminate?: readonly string[]; polynomial?: string } = {};
  if (operation === "sage.ideal.eliminate") {
    if (!Array.isArray(args.eliminate) || !args.eliminate.length || args.eliminate.length >= variables.length ||
        new Set(args.eliminate).size !== args.eliminate.length || !args.eliminate.every((item) => variables.includes(item)))
      throw new TypeError("Eliminate one or more, but not all, ambient variables.");
    extra = { eliminate: [...args.eliminate] };
  }
  if (operation === "sage.ideal.membership") {
    const polynomial = parseIdealGenerator(args.polynomial, variables);
    if (polynomial.length > 128) throw new TypeError("Membership polynomial exceeds 128 characters.");
    extra = { polynomial };
  }
  return Object.freeze({ format: "math3d.sage-ideal-operation", schemaVersion: 1,
    target, targetHash: selected.contentHash, ideal: idealRef, idealHash: ideal.contentHash,
    ambientRing: ideal.definition.ambientRing, ambientHash: ambient.contentHash,
    variables: [...variables], monomialOrder: ring.monomialOrder,
    generators: [...ideal.definition.generators], ...extra });
};

/** Rechecks historical Project snapshots without requiring old revisions to remain current. */
export const validateSageIdealSnapshot = (input: SageIdealInput, operation: SageIdealOperation,
  objects: readonly ProjectAlgebraObjectEntry[]): void => {
  const at = (ref: AlgebraObjectRef) => objects.find((item) => item.id === ref.objectId)?.revisions[ref.revision - 1];
  if (!record(input) || !validRef(input.target) || !validRef(input.ideal) ||
      !validRef(input.ambientRing)) throw new TypeError("Invalid saved ideal references.");
  const target = at(input.target), ideal = at(input.ideal), ring = at(input.ambientRing);
  if (!target || ideal?.definition.kind !== "ideal" || ring?.definition.kind !== "polynomial-ring" ||
      target.contentHash !== input.targetHash || ideal.contentHash !== input.idealHash ||
      ring.contentHash !== input.ambientHash ||
      !sameRef(ideal.definition.ambientRing, input.ambientRing) ||
      (operation === "sage.ideal.quotientDimension" || operation === "sage.ideal.hilbertSeries"
        ? target.definition.kind !== "quotient-ring" || !sameRef(target.definition.ideal, input.ideal) ||
          !sameRef(target.definition.ambientRing, input.ambientRing)
        : target.id !== ideal.id || target.revision !== ideal.revision))
    throw new TypeError("Saved ideal request differs from its pinned Project definitions.");
  const extra = operation === "sage.ideal.eliminate" ? { eliminate: input.eliminate } :
    operation === "sage.ideal.membership" ? { polynomial: input.polynomial } : {};
  const expected = { format: "math3d.sage-ideal-operation", schemaVersion: 1,
    target: input.target, targetHash: target.contentHash, ideal: input.ideal, idealHash: ideal.contentHash,
    ambientRing: input.ambientRing, ambientHash: ring.contentHash,
    variables: ring.definition.variables, monomialOrder: ring.definition.monomialOrder,
    generators: ideal.definition.generators, ...extra };
  if (canonicalJsonStringify(input) !== canonicalJsonStringify(expected))
    throw new TypeError("Saved ideal request fields differ from the pinned Project definitions.");
  if (operation === "sage.ideal.eliminate" && (!Array.isArray(input.eliminate) ||
      !input.eliminate.length || input.eliminate.length >= ring.definition.variables.length ||
      new Set(input.eliminate).size !== input.eliminate.length ||
      !input.eliminate.every((item) => ring.definition.kind === "polynomial-ring" && ring.definition.variables.includes(item))))
    throw new TypeError("Saved elimination variables are invalid.");
  if (operation === "sage.ideal.membership" &&
      parseIdealGenerator(input.polynomial, ring.definition.variables) !== input.polynomial)
    throw new TypeError("Saved membership polynomial is invalid.");
  if ((operation === "sage.ideal.syzygies" || operation === "sage.ideal.hilbertSeries") &&
      (ring.definition.variables.length > 2 || ideal.definition.generators.length > 3))
    throw new TypeError("Saved advanced ideal request exceeds its input bounds.");
  if (operation === "sage.ideal.hilbertSeries" && (ring.definition.monomialOrder === "lex" ||
      !isProvablyHomogeneousIdeal(ideal.definition.generators, ring.definition.variables)))
    throw new TypeError("Saved Hilbert request is not proven homogeneous in a graded order.");
};

/** Exact envelope and pinned identity check before B05 saves a result. */
export const parseSageIdealResult = (value: unknown, input: SageIdealInput,
  operation: SageIdealOperation): SageIdealResult => {
  const shared = ["format", "schemaVersion", "target", "targetHash", "idealHash"];
  const extra = operation === "sage.ideal.groebner" ? ["basis"] :
    operation === "sage.ideal.eliminate" ? ["basis", "eliminate"] :
      operation === "sage.ideal.membership" ? ["basis", "polynomial", "member", "normalForm"] :
        operation === "sage.ideal.syzygies" ? ["syzygies", "generatorCount"] :
          operation === "sage.ideal.hilbertSeries" ? ["series", "numerator", "dimension", "grading"] :
            ["dimension", "quotientPresentation"];
  if (!record(value) || !exact(value, [...shared, ...extra]) ||
      value.format !== "math3d.sage-ideal-result" || value.schemaVersion !== 1 ||
      !sameRef(value.target, input.target) || value.targetHash !== input.targetHash ||
      value.idealHash !== input.idealHash)
    throw new TypeError("Ideal result schema or pinned object identity differs.");
  if (operation === "sage.ideal.syzygies") {
    if (value.generatorCount !== input.generators.length || !Array.isArray(value.syzygies) ||
        value.syzygies.length > 128 || !value.syzygies.every((row) => Array.isArray(row) &&
          row.length === input.generators.length && row.every((item) => typeof item === "string" &&
            item.length > 0 && item.length <= 1024)))
      throw new TypeError("Invalid bounded syzygy result.");
  } else if (operation === "sage.ideal.hilbertSeries") {
    if (value.grading !== "standard" || typeof value.series !== "string" || !value.series ||
        value.series.length > 1024 || typeof value.numerator !== "string" || !value.numerator ||
        value.numerator.length > 1024 || !Number.isSafeInteger(value.dimension) ||
        (value.dimension as number) < -1 || (value.dimension as number) > input.variables.length)
      throw new TypeError("Invalid bounded Hilbert series result.");
  } else if (operation === "sage.ideal.quotientDimension") {
    if (!Number.isSafeInteger(value.dimension) || (value.dimension as number) < -1 ||
        (value.dimension as number) > 3 || typeof value.quotientPresentation !== "string" ||
        !value.quotientPresentation || value.quotientPresentation.length > 1024)
      throw new TypeError("Invalid quotient dimension result.");
  } else {
    if (!Array.isArray(value.basis) || value.basis.length > 128 ||
        !value.basis.every((item) => typeof item === "string" && item.length > 0 && item.length <= 1024))
      throw new TypeError("Invalid bounded ideal basis.");
    if (operation === "sage.ideal.eliminate" && canonicalJsonStringify(value.eliminate) !== canonicalJsonStringify(input.eliminate))
      throw new TypeError("Elimination variables differ from the request.");
    if (operation === "sage.ideal.membership" && (value.polynomial !== input.polynomial ||
        typeof value.member !== "boolean" || typeof value.normalForm !== "string" ||
        value.normalForm.length > 1024 || value.member !== (value.normalForm === "0")))
      throw new TypeError("Membership result or normal form differs from the request.");
  }
  return Object.freeze(JSON.parse(canonicalJsonStringify(value)) as SageIdealResult);
};
