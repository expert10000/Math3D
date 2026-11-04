import { type AlgebraObjectKind, type AlgebraObjectRecord, type AlgebraObjectRef } from "./algebraObjects";
import { inspectProjectAlgebraFreshness } from "./projectAlgebraRegistry";
import type { Math3DProject } from "./math3dProject";
import { buildSageAlgebraReconstructionInput, parseSageAlgebraReconstructionInput,
  parseSageAlgebraReconstructionResult, type SageAlgebraReconstructionResult } from "./sageAlgebraReconstruction";
import { buildSageAlgebraDomainInput, parseSageAlgebraDomainInput, parseSageAlgebraDomainResult,
  type SageAlgebraDomainResult } from "./sageAlgebraDomains";
import { parsePolynomialDossierResult, type PolynomialDossierResult } from "./polynomialDossier";
import { parseSageMatrixDossierInput, parseSageMatrixDossierResult, type SageMatrixDossierResult } from "./sageMatrixDossier";
import { parseSageIntegerMatrixFormsInput, parseSageIntegerMatrixFormsResult,
  type SageIntegerMatrixFormsResult } from "./sageIntegerMatrixForms";
import { buildSageIdealInput, parseSageIdealResult, type SageIdealResult,
  type SageIdealOperation } from "./sageIdealOperations";
import type { SageIdealBudgetProfile } from "./sageIdealBudgets";
import { isProvablyHomogeneousIdeal } from "./algebraIdealGrading";

export type AlgebraOperationId = "sage.algebra.reconstruct" | "sage.algebra.inspectDomains" |
  "sage.numberTheory.gcd" | "sage.numberTheory.modInverse" | "sage.polynomial.factor" |
  "sage.polynomial.roots_exact" | "sage.polynomial.dossier" | "sage.groebner.compute" |
  "sage.matrix.linear_dossier" | "sage.matrix.integer_forms" | SageIdealOperation;
export type AlgebraBackend = "docker" | "private";
export type AlgebraOperationArguments = {
  "sage.algebra.reconstruct": Readonly<Record<string, never>>;
  "sage.algebra.inspectDomains": Readonly<{ other: AlgebraObjectRef }>;
  "sage.numberTheory.gcd": Readonly<{ values: readonly string[] }>;
  "sage.numberTheory.modInverse": Readonly<{ a: string }>;
  "sage.polynomial.factor": Readonly<{ polynomial: string }>;
  "sage.polynomial.roots_exact": Readonly<{ polynomial: string }>;
  "sage.polynomial.dossier": Readonly<{ polynomial: string }>;
  "sage.groebner.compute": Readonly<{ polynomials: readonly string[] }>;
  "sage.matrix.linear_dossier": Readonly<{ matrix: readonly (readonly string[])[] }>;
  "sage.matrix.integer_forms": Readonly<{ matrix: readonly (readonly string[])[] }>;
  "sage.ideal.groebner": Readonly<{ budgetProfile?: SageIdealBudgetProfile }>;
  "sage.ideal.eliminate": Readonly<{ eliminate: readonly string[]; budgetProfile?: SageIdealBudgetProfile }>;
  "sage.ideal.membership": Readonly<{ polynomial: string; budgetProfile?: SageIdealBudgetProfile }>;
  "sage.ideal.quotientDimension": Readonly<{ budgetProfile?: SageIdealBudgetProfile }>;
  "sage.ideal.syzygies": Readonly<{ budgetProfile?: SageIdealBudgetProfile }>;
  "sage.ideal.hilbertSeries": Readonly<{ budgetProfile?: SageIdealBudgetProfile }>;
};
export type AlgebraOperationResult = SageAlgebraReconstructionResult | SageAlgebraDomainResult | PolynomialDossierResult |
  SageMatrixDossierResult | SageIntegerMatrixFormsResult | SageIdealResult |
  Readonly<{ value: string }> | Readonly<{ value: string; modulus: string }> |
  Readonly<{ text: string }> | Readonly<{ roots: readonly Readonly<{ value: string; multiplicity: number }>[] }> |
  Readonly<{ basis: readonly string[] }>;
export type AlgebraOperationDefinition = Readonly<{
  id: AlgebraOperationId; label: string; category: "structure" | "number-theory" | "polynomial" | "matrix" | "ideal";
  accepts: readonly AlgebraObjectKind[]; domain: "any" | "QQ-polynomial" | "QQ-univariate-polynomial";
  capability: string; backends: readonly AlgebraBackend[];
  inputSchema: string; outputSchema: string; deterministic: true; cachePolicy: "none"; executionMode: "bounded";
}>;

const ALL: readonly AlgebraObjectKind[] = ["integer-ring", "rational-field", "modular-ring", "finite-field",
  "polynomial-ring", "number-field"];
const POLY: readonly AlgebraObjectKind[] = ["polynomial-ring"];
const definition = (id: AlgebraOperationId, label: string, category: AlgebraOperationDefinition["category"],
  accepts: readonly AlgebraObjectKind[], domain: AlgebraOperationDefinition["domain"], capability: string,
  backends: readonly AlgebraBackend[], inputSchema: string, outputSchema: string): AlgebraOperationDefinition =>
  Object.freeze({ id, label, category, accepts, domain, capability, backends, inputSchema, outputSchema,
    deterministic: true, cachePolicy: "none", executionMode: "bounded" });

/** Only operations whose current bounded worker semantics can be tied to a saved algebra parent. */
export const ALGEBRA_OPERATION_REGISTRY: readonly AlgebraOperationDefinition[] = Object.freeze([
  definition("sage.algebra.reconstruct", "Construct exact structure", "structure", ALL, "any", "algebra.reconstruct",
    ["docker"], "math3d.sage-algebra-reconstruction/v1", "math3d.sage-algebra-reconstruction-result/v1"),
  definition("sage.algebra.inspectDomains", "Inspect parent domains", "structure", ALL, "any", "algebra.domains.inspect",
    ["docker"], "math3d.sage-algebra-domain-inspection/v1", "math3d.sage-algebra-domain-inspection-result/v1"),
  definition("sage.numberTheory.gcd", "Integer GCD", "number-theory", ["integer-ring"], "any", "number-theory.gcd",
    ["docker", "private"], "math3d.algebra-gcd-arguments/v1", "sage.numberTheory.gcd/result-v1"),
  definition("sage.numberTheory.modInverse", "Modular inverse", "number-theory", ["modular-ring"], "any", "number-theory.mod-inverse",
    ["docker", "private"], "math3d.algebra-mod-inverse-arguments/v1", "sage.numberTheory.modInverse/result-v1"),
  definition("sage.polynomial.factor", "Factor over QQ", "polynomial", POLY, "QQ-polynomial", "polynomial.factor",
    ["docker"], "math3d.algebra-polynomial-arguments/v1", "sage.polynomial.factor/result-v1"),
  definition("sage.polynomial.roots_exact", "Exact roots over QQ", "polynomial", POLY, "QQ-univariate-polynomial", "polynomial.roots.exact",
    ["docker"], "math3d.algebra-polynomial-arguments/v1", "sage.polynomial.roots_exact/result-v1"),
  definition("sage.polynomial.dossier", "Polynomial dossier over QQ", "polynomial", POLY, "QQ-univariate-polynomial", "polynomial.dossier",
    ["docker"], "math3d.algebra-polynomial-arguments/v1", "math3d.polynomial-dossier-result/v1"),
  definition("sage.groebner.compute", "Gröbner basis over QQ", "polynomial", POLY, "QQ-polynomial", "algebra.groebner",
    ["docker"], "math3d.algebra-groebner-arguments/v1", "sage.groebner.compute/result-v1"),
  definition("sage.matrix.linear_dossier", "Exact QQ matrix analysis", "matrix", ["rational-field"], "any", "matrix.linear-dossier",
    ["docker"], "math3d.sage-matrix-dossier/v1", "math3d.sage-matrix-dossier-result/v1"),
  definition("sage.matrix.integer_forms", "Smith and Hermite forms over ZZ", "matrix", ["integer-ring"], "any", "matrix.integer-forms",
    ["docker"], "math3d.sage-integer-matrix-forms/v1", "math3d.sage-integer-matrix-forms-result/v1"),
  definition("sage.ideal.groebner", "Saved ideal Gröbner basis", "ideal", ["ideal"], "any", "ideal.groebner",
    ["docker"], "math3d.sage-ideal-operation/v1", "math3d.sage-ideal-result/v1"),
  definition("sage.ideal.eliminate", "Elimination ideal", "ideal", ["ideal"], "any", "ideal.eliminate",
    ["docker"], "math3d.sage-ideal-operation/v1", "math3d.sage-ideal-result/v1"),
  definition("sage.ideal.membership", "Membership and normal form", "ideal", ["ideal"], "any", "ideal.membership",
    ["docker"], "math3d.sage-ideal-operation/v1", "math3d.sage-ideal-result/v1"),
  definition("sage.ideal.quotientDimension", "Quotient dimension", "ideal", ["quotient-ring"], "any", "ideal.quotient-dimension",
    ["docker"], "math3d.sage-ideal-operation/v1", "math3d.sage-ideal-result/v1"),
  definition("sage.ideal.syzygies", "Generator syzygies", "ideal", ["ideal"], "any", "ideal.syzygies",
    ["docker"], "math3d.sage-ideal-operation/v1", "math3d.sage-ideal-result/v1"),
  definition("sage.ideal.hilbertSeries", "Quotient Hilbert series", "ideal", ["quotient-ring"], "any", "ideal.hilbert-series",
    ["docker"], "math3d.sage-ideal-operation/v1", "math3d.sage-ideal-result/v1"),
]);
const byId = new Map(ALGEBRA_OPERATION_REGISTRY.map((item) => [item.id, item]));
if (byId.size !== ALGEBRA_OPERATION_REGISTRY.length) throw new Error("Duplicate algebra operation ID.");

export type AlgebraRouteCapability = Readonly<{ backend: AlgebraBackend; available: boolean;
  operations: readonly string[]; reason?: string }>;
export type AlgebraOperationAvailability = Readonly<{ definition: AlgebraOperationDefinition;
  eligible: boolean; reason: string | null; readyBackend: AlgebraBackend | null;
  runtimeReason: string | null }>;

const currentRecord = (project: Math3DProject, ref: AlgebraObjectRef): { record: AlgebraObjectRecord; reason: string | null } => {
  const entry = project.algebraObjects?.find((item) => item.id === ref.objectId);
  const record = entry?.revisions[ref.revision - 1];
  if (!entry || !record) throw new TypeError("The selected algebra object revision is missing from this Project.");
  const freshness = inspectProjectAlgebraFreshness(project).find((item) => item.objectId === entry.id);
  return { record, reason: entry.archived ? "Archived algebra objects cannot start new operations."
    : ref.revision !== entry.revisions.length ? "Select the current object revision before running an operation."
    : freshness?.status === "stale" ? "The object has a stale parent definition; rebuild or fork it first." : null };
};

const domainReason = (project: Math3DProject, record: AlgebraObjectRecord,
  operation: AlgebraOperationDefinition): string | null => {
  if (!operation.accepts.includes(record.kind)) return `${operation.label} does not accept ${record.kind} objects.`;
  if (operation.category === "ideal") {
    const idealRef = record.definition.kind === "quotient-ring" ? record.definition.ideal : { objectId: record.id, revision: record.revision };
    const ideal = project.algebraObjects?.find((item) => item.id === idealRef.objectId)?.revisions[idealRef.revision - 1];
    const ringRef = ideal?.definition.kind === "ideal" ? ideal.definition.ambientRing : null;
    const ring = project.algebraObjects?.find((item) => item.id === ringRef?.objectId)?.revisions[(ringRef?.revision ?? 0) - 1];
    if (ideal?.definition.kind !== "ideal" || ring?.definition.kind !== "polynomial-ring" ||
        ring.definition.variables.length > 3 || ideal.definition.generators.length > 6 ||
        ideal.definition.generators.some((item) => item.length > 128))
      return "Bounded ideal operations require a pinned QQ polynomial ring with at most three variables and six short generators.";
    if ((operation.id === "sage.ideal.syzygies" || operation.id === "sage.ideal.hilbertSeries") &&
        (ring.definition.variables.length > 2 || ideal.definition.generators.length > 3))
      return "Advanced ideal operations require at most two variables and three generators.";
    if (operation.id === "sage.ideal.hilbertSeries" && (ring.definition.monomialOrder === "lex" ||
        !isProvablyHomogeneousIdeal(ideal.definition.generators, ring.definition.variables)))
      return "Hilbert series requires a graded monomial order and provably homogeneous generators.";
  }
  if (operation.domain === "any") return null;
  const polynomial = record.definition.kind === "polynomial-ring" ? record.definition : null;
  if (!polynomial) return `${operation.label} requires a polynomial ring over QQ.`;
  const parent = project.algebraObjects?.find((item) => item.id === polynomial.coefficientDomain.objectId)
    ?.revisions[polynomial.coefficientDomain.revision - 1];
  if (parent?.kind !== "rational-field") return `${operation.label} requires a direct QQ coefficient domain; the current Sage worker constructs polynomial inputs over QQ.`;
  if (operation.domain === "QQ-univariate-polynomial" && polynomial.variables.length !== 1) {
    return `${operation.label} requires exactly one polynomial variable.`;
  }
  return null;
};

/** Kind/domain eligibility is independent of whether a runtime happens to be online. */
export const algebraOperationsFor = (project: Math3DProject, target: AlgebraObjectRef,
  routes: readonly AlgebraRouteCapability[] = []): readonly AlgebraOperationAvailability[] => {
  const { record, reason: objectReason } = currentRecord(project, target);
  return ALGEBRA_OPERATION_REGISTRY.map((operation) => {
    const reason = objectReason ?? domainReason(project, record, operation);
    const readyBackend = reason ? null : operation.backends.find((backend) => routes.some((route) =>
      route.backend === backend && route.available && route.operations.includes(operation.capability))) ?? null;
    const offline = routes.filter((route) => operation.backends.includes(route.backend) && !route.available)
      .map((route) => `${route.backend}: ${route.reason ?? "unavailable"}`).join("; ");
    const runtimeReason = reason || readyBackend ? null : routes.length === 0 ? "Check Sage runtime capabilities to run this operation."
      : `No available ${operation.backends.join(" or ")} route advertises ${operation.capability}.${offline ? ` ${offline}.` : ""}`;
    return Object.freeze({ definition: operation, eligible: reason === null, reason,
      readyBackend, runtimeReason });
  });
};

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const decimal = (value: unknown, signed = false): value is string => typeof value === "string" &&
  (signed ? /^(?:0|-?[1-9][0-9]{0,127})$/ : /^(?:0|[1-9][0-9]{0,127})$/).test(value);
const polynomialText = (value: unknown, variables: readonly string[]): value is string => {
  if (typeof value !== "string" || !value.trim() || value.length > 1200 || !/^[A-Za-z0-9_+\-*/^()\s]+$/.test(value) ||
      /\^\s*(?:\(|-|\+)/.test(value)) return false;
  if ([...value.matchAll(/[0-9]+/g)].some((match) => match[0].length > 18) ||
      [...value.matchAll(/\^\s*([0-9]+)/g)].some((match) => Number(match[1]) > 64)) return false;
  return [...value.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].every((match) => variables.includes(match[0]));
};

export type AlgebraOperationRequest = Readonly<{ operation: AlgebraOperationId; backend: AlgebraBackend;
  params: Record<string, unknown>; target: AlgebraObjectRef; outputSchema: string }>;

/** Produces only the existing bounded Sage envelopes; rejects extra/executable arguments. */
export const buildAlgebraOperationRequest = <K extends AlgebraOperationId>(project: Math3DProject,
  target: AlgebraObjectRef, id: K, backend: AlgebraBackend, args: AlgebraOperationArguments[K]): AlgebraOperationRequest => {
  const operation = byId.get(id);
  if (!operation) throw new TypeError("Unknown algebra operation.");
  const { record, reason } = currentRecord(project, target);
  const unavailable = reason ?? domainReason(project, record, operation);
  if (unavailable) throw new TypeError(unavailable);
  if (!operation.backends.includes(backend)) throw new TypeError(`${operation.label} is not available on the ${backend} app route.`);
  if (!object(args)) throw new TypeError("Algebra operation arguments must be a structured object.");
  const input = args as Record<string, unknown>;
  let params: Record<string, unknown>;
  if (id === "sage.algebra.reconstruct") {
    if (!exact(input, [])) throw new TypeError("Structure reconstruction takes no freeform arguments.");
    params = buildSageAlgebraReconstructionInput(project, target) as unknown as Record<string, unknown>;
  } else if (id === "sage.algebra.inspectDomains") {
    if (!exact(input, ["other"]) || !object(input.other) || !exact(input.other, ["objectId", "revision"])) {
      throw new TypeError("Choose one exact second object revision for domain inspection.");
    }
    params = buildSageAlgebraDomainInput(project, target, input.other as AlgebraObjectRef) as unknown as Record<string, unknown>;
  } else if (id === "sage.numberTheory.gcd") {
    if (!exact(input, ["values"]) || !Array.isArray(input.values) || input.values.length < 2 || input.values.length > 32 ||
        !input.values.every((value: unknown) => decimal(value, true))) throw new TypeError("GCD requires 2–32 canonical signed integers of at most 128 digits.");
    params = { values: [...input.values] };
  } else if (id === "sage.numberTheory.modInverse") {
    if (!exact(input, ["a"]) || !decimal(input.a, true) || record.definition.kind !== "modular-ring") {
      throw new TypeError("Modular inverse requires one canonical signed integer in the selected modular ring.");
    }
    params = { a: input.a, modulus: record.definition.modulus };
  } else if (id === "sage.matrix.linear_dossier") {
    if (!exact(input, ["matrix"])) throw new TypeError("Matrix analysis requires one exact QQ matrix.");
    params = parseSageMatrixDossierInput({ format: "math3d.sage-matrix-dossier", schemaVersion: 1,
      matrix: input.matrix }) as unknown as Record<string, unknown>;
  } else if (id === "sage.matrix.integer_forms") {
    if (!exact(input, ["matrix"])) throw new TypeError("Smith and Hermite analysis requires one exact ZZ matrix.");
    params = parseSageIntegerMatrixFormsInput({ format: "math3d.sage-integer-matrix-forms", schemaVersion: 1,
      matrix: input.matrix }) as unknown as Record<string, unknown>;
  } else if (id.startsWith("sage.ideal.")) {
    params = buildSageIdealInput(project, target, id as SageIdealOperation, input) as unknown as Record<string, unknown>;
  } else {
    const variables = record.definition.kind === "polynomial-ring" ? record.definition.variables : [];
    if (id === "sage.groebner.compute") {
      if (!exact(input, ["polynomials"]) || !Array.isArray(input.polynomials) || input.polynomials.length < 1 ||
          input.polynomials.length > 12 || !input.polynomials.every((value: unknown) => polynomialText(value, variables))) {
        throw new TypeError("Gröbner input requires 1–12 bounded polynomials in the selected ring variables.");
      }
      params = { polynomials: [...input.polynomials], variables: [...variables],
        ...(variables.length > 1 ? { order: record.definition.kind === "polynomial-ring" ? record.definition.monomialOrder : "degrevlex" } : {}) };
    } else {
      if (!exact(input, ["polynomial"]) || !polynomialText(input.polynomial, variables)) {
        throw new TypeError("Enter a bounded polynomial using only the selected ring variables.");
      }
      if (id === "sage.polynomial.dossier" &&
          (input.polynomial.includes("**") || [...input.polynomial.matchAll(/\^\s*([0-9]+)/g)]
            .some((match) => Number(match[1]) > 16))) {
        throw new TypeError("Polynomial dossier exponents must be at most 16.");
      }
      params = { polynomial: input.polynomial, variables: [...variables],
        ...(variables.length > 1 ? { order: record.definition.kind === "polynomial-ring" ? record.definition.monomialOrder : "degrevlex" } : {}) };
    }
  }
  return Object.freeze({ operation: id, backend, params, target, outputSchema: operation.outputSchema });
};

/** Verifies output shape and pinned mathematical identity before an object-linked result is retained. */
export const parseAlgebraOperationResult = (request: AlgebraOperationRequest, value: unknown): AlgebraOperationResult => {
  const definition = byId.get(request.operation);
  if (!definition || request.outputSchema !== definition.outputSchema || !definition.backends.includes(request.backend)) {
    throw new TypeError("Algebra operation request has an incompatible output schema or route.");
  }
  if (request.operation === "sage.algebra.reconstruct") return parseSageAlgebraReconstructionResult(value,
    parseSageAlgebraReconstructionInput(request.params));
  if (request.operation === "sage.algebra.inspectDomains") return parseSageAlgebraDomainResult(value,
    parseSageAlgebraDomainInput(request.params));
  if (request.operation === "sage.matrix.linear_dossier") return parseSageMatrixDossierResult(value,
    parseSageMatrixDossierInput(request.params));
  if (request.operation === "sage.matrix.integer_forms") return parseSageIntegerMatrixFormsResult(value,
    parseSageIntegerMatrixFormsInput(request.params));
  if (request.operation.startsWith("sage.ideal.")) return parseSageIdealResult(value,
    request.params as unknown as import("./sageIdealOperations").SageIdealInput, request.operation as SageIdealOperation);
  if (!object(value)) throw new TypeError("Invalid algebra operation result object.");
  if (request.operation === "sage.numberTheory.gcd") {
    if (!exact(value, ["value"]) || !decimal(value.value)) throw new TypeError("Invalid exact GCD result.");
    return Object.freeze({ value: value.value });
  }
  if (request.operation === "sage.numberTheory.modInverse") {
    if (!exact(value, ["value", "modulus"]) || !decimal(value.value) || value.modulus !== request.params.modulus ||
        BigInt(value.value) >= BigInt(value.modulus as string)) {
      throw new TypeError("Invalid or mismatched modular inverse result.");
    }
    return Object.freeze({ value: value.value, modulus: value.modulus as string });
  }
  if (request.operation === "sage.polynomial.factor") {
    if (!exact(value, ["text"]) || typeof value.text !== "string" || !value.text || value.text.length > 65536) {
      throw new TypeError("Invalid exact factorization result.");
    }
    return Object.freeze({ text: value.text });
  }
  if (request.operation === "sage.polynomial.roots_exact") {
    if (!exact(value, ["roots"]) || !Array.isArray(value.roots) || value.roots.length > 1024 ||
        !value.roots.every((root) => object(root) && exact(root, ["value", "multiplicity"]) &&
          typeof root.value === "string" && !!root.value && root.value.length <= 4096 &&
          Number.isSafeInteger(root.multiplicity) && (root.multiplicity as number) >= 1)) {
      throw new TypeError("Invalid exact polynomial roots result.");
    }
    return Object.freeze({ roots: value.roots.map((root) => Object.freeze({ value: root.value, multiplicity: root.multiplicity })) });
  }
  if (request.operation === "sage.polynomial.dossier") {
    const variables = request.params.variables;
    if (!Array.isArray(variables) || variables.length !== 1 || typeof variables[0] !== "string" ||
        !polynomialText(request.params.polynomial, variables)) {
      throw new TypeError("Invalid polynomial dossier request input.");
    }
    return parsePolynomialDossierResult(value, variables[0], request.params.polynomial as string);
  }
  if (!exact(value, ["basis"]) || !Array.isArray(value.basis) || value.basis.length > 256 ||
      !value.basis.every((item) => typeof item === "string" && !!item && item.length <= 4096)) {
    throw new TypeError("Invalid exact Gröbner basis result.");
  }
  return Object.freeze({ basis: [...value.basis] });
};
