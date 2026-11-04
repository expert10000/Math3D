import { ALGEBRA_OPERATION_REGISTRY, inspectProjectAlgebraFreshness, parseProjectAlgebraEvidence,
  type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";

export type InspectorFact = Readonly<{ label: string; value: string | readonly string[] | readonly (readonly string[])[] }>;
export type InspectorCheck = Readonly<{ label: string; status: "checked" | "reported" | "unavailable" | "failed";
  detail: string }>;
export type AlgebraEvidenceInspectorModel = Readonly<{
  title: string; result: readonly InspectorFact[]; structure: readonly InspectorFact[];
  checks: readonly InspectorCheck[]; mode: "CHECKED" | "COMPUTED" | "FAILED";
  execution: readonly InspectorFact[];
}>;

const text = (value: unknown): string => value === null || value === undefined ? "None" : String(value);
const list = (value: unknown): readonly string[] => Array.isArray(value) ? value.map(text) : [];
const matrix = (value: unknown): readonly (readonly string[])[] => Array.isArray(value)
  ? value.map((row) => list(row)) : [];
const fact = (label: string, value: InspectorFact["value"]): InspectorFact => ({ label, value });
const check = (label: string, status: InspectorCheck["status"], detail: string): InspectorCheck =>
  ({ label, status, detail });
const formatRef = (ref: { objectId: string; revision: number }) => `${ref.objectId}@${ref.revision}`;
const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left, b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};

/** Presentation plus operation-specific checks; no unreported Sage algorithm or proof claim is inferred. */
export const algebraEvidenceInspectorModel = (project: Math3DProject,
  evidence: ProjectAlgebraEvidence): AlgebraEvidenceInspectorModel => {
  const operation = evidence.request.operation;
  const title = ALGEBRA_OPERATION_REGISTRY.find((item) => item.id === operation)?.label ?? operation;
  const entry = project.algebraObjects?.find((item) => item.id === evidence.request.target.objectId);
  const source = entry?.revisions[evidence.request.target.revision - 1];
  const current = entry?.revisions[entry.revisions.length - 1];
  const freshness = inspectProjectAlgebraFreshness(project).find((item) => item.objectId === entry?.id);
  const sourceStatus = !source ? "Missing" : entry?.archived ? "Archived" : source.revision !== current?.revision
    ? "Historical revision" : freshness?.status === "stale" ? "Stale parent definition" : "Current";
  const structure: InspectorFact[] = [
    fact("Structure", source?.label ?? "Missing"), fact("Kind", source?.kind ?? "Missing"),
    fact("Status", sourceStatus), fact("Object ID", evidence.request.target.objectId),
    fact("Pinned revision", evidence.request.target.revision.toString()),
    fact("Definition hash", evidence.targetHash),
    fact("Parent revisions", source?.dependencies.length ? source.dependencies.map(formatRef) : "None"),
  ];
  if (source?.definition.kind === "integer-ring" || source?.definition.kind === "rational-field") {
    structure.push(fact("Presentation", source.definition.kind === "integer-ring" ? "ZZ" : "QQ"),
      fact("Characteristic", "0"));
  } else if (source?.definition.kind === "modular-ring") {
    structure.push(fact("Presentation", `Z/${source.definition.modulus}Z`),
      fact("Modulus", source.definition.modulus));
  } else if (source?.definition.kind === "finite-field") {
    structure.push(fact("Characteristic", String(source.definition.characteristic)),
      fact("Extension degree", String(source.definition.degree)),
      fact("Generator", source.definition.generator));
  } else if (source?.definition.kind === "polynomial-ring") {
    structure.push(fact("Coefficient domain", formatRef(source.definition.coefficientDomain)),
      fact("Variables", source.definition.variables),
      fact("Monomial order", source.definition.monomialOrder));
  } else if (source?.definition.kind === "ideal") {
    structure.push(fact("Ambient ring", formatRef(source.definition.ambientRing)),
      fact("Generators", source.definition.generators));
  } else if (source?.definition.kind === "quotient-ring") {
    structure.push(fact("Ambient ring", formatRef(source.definition.ambientRing)),
      fact("Ideal", formatRef(source.definition.ideal)));
  }
  const result = evidence.result as unknown as Record<string, unknown>;
  const params = evidence.request.params;
  const facts: InspectorFact[] = [];
  const checks: InspectorCheck[] = [];
  let mode: AlgebraEvidenceInspectorModel["mode"] = "COMPUTED";
  try {
    parseProjectAlgebraEvidence(evidence, project.identity.id, project.algebraObjects ?? []);
    checks.push(check("Saved evidence integrity", "checked", "Output schema, result hash and pinned definition match the Project."));
  } catch (error) {
    checks.push(check("Saved evidence integrity", "failed", String((error as Error).message ?? error)));
    mode = "FAILED";
  }
  switch (operation) {
    case "sage.algebra.reconstruct":
      facts.push(fact("Presentation", text(result.text)), fact("Characteristic", text(result.characteristic)),
        fact("Field", result.isField ? "Yes" : "No"), fact("Base ring", text(result.baseRing)),
        fact("Variables", list(result.variables)));
      checks.push(check("Definition identity", "checked", "Sage metadata matches the pinned object kind, hash and characteristic."));
      break;
    case "sage.algebra.inspectDomains": {
      const left = result.left as Record<string, unknown>, right = result.right as Record<string, unknown>;
      const forward = result.leftToRight as Record<string, unknown>, reverse = result.rightToLeft as Record<string, unknown>;
      facts.push(fact("Left domain", text(left.text)), fact("Right domain", text(right.text)),
        fact("Left → right", text(forward.status)), fact("Right → left", text(reverse.status)),
        fact("Left → right map", text(forward.mapId)),
        fact("Right → left map", text(reverse.mapId)));
      if (forward.error) facts.push(fact("Left → right error", text((forward.error as Record<string, unknown>).message)));
      if (reverse.error) facts.push(fact("Right → left error", text((reverse.error as Record<string, unknown>).message)));
      checks.push(check("Coercion maps", "reported", "Sage reports directional canonical maps or explicit compatibility errors; the schema checks pinned domain references."));
      break;
    }
    case "sage.numberTheory.gcd": {
      facts.push(fact("Inputs", list(params.values)), fact("Greatest common divisor", text(result.value)));
      const values = list(params.values);
      const canonical = values.length >= 2 && values.length <= 32 &&
        values.every((item) => /^(?:0|-?[1-9][0-9]{0,127})$/.test(item));
      const computed = canonical ? values.reduce((acc, item) => gcd(acc, BigInt(item)), 0n).toString() : null;
      const valid = computed !== null && computed === result.value;
      checks.push(check("Exact GCD", valid ? "checked" : "failed", valid
        ? "Recomputed from the saved integer inputs with exact arithmetic."
        : computed === null ? "Saved GCD inputs are invalid." : `Recomputed ${computed}; saved result is ${text(result.value)}.`));
      if (mode !== "FAILED") mode = valid ? "CHECKED" : "FAILED";
      break;
    }
    case "sage.numberTheory.modInverse": {
      facts.push(fact("Input", text(params.a)), fact("Modulus", text(params.modulus)),
        fact("Inverse", text(result.value)));
      const validInput = /^(?:0|-?[1-9][0-9]{0,127})$/.test(text(params.a)) &&
        /^(?:[2-9]|[1-9][0-9]{1,127})$/.test(text(params.modulus)) &&
        source?.definition.kind === "modular-ring" && source.definition.modulus === params.modulus;
      const modulus = validInput ? BigInt(text(params.modulus)) : 1n;
      const value = validInput ? BigInt(text(result.value)) : 0n;
      const valid = validInput && ((BigInt(text(params.a)) * value) % modulus + modulus) % modulus === 1n;
      checks.push(check("Inverse identity", valid ? "checked" : "failed", valid
        ? "The saved value satisfies a · inverse ≡ 1 (mod n)."
        : validInput ? "The saved value does not satisfy the modular inverse identity."
          : "Saved inverse inputs do not match the pinned modular ring."));
      if (mode !== "FAILED") mode = valid ? "CHECKED" : "FAILED";
      break;
    }
    case "sage.polynomial.factor":
      facts.push(fact("Polynomial", text(params.polynomial)), fact("Factorization", text(result.text)));
      checks.push(check("Factor identity", "reported", "Factor text was returned by Sage; multiplication back to the input is not recorded."));
      break;
    case "sage.polynomial.roots_exact": {
      const roots = (result.roots as { value: string; multiplicity: number }[]);
      facts.push(fact("Polynomial", text(params.polynomial)), fact("Exact roots", roots.length
        ? roots.map((item) => `${item.value} (multiplicity ${item.multiplicity})`) : "None"));
      checks.push(check("Root substitution", "reported", "Exact roots were returned by Sage; substitution certificates are not recorded."));
      break;
    }
    case "sage.polynomial.dossier": {
      const factors = result.factorization as { unit: string; factors: { polynomial: string; multiplicity: number }[] };
      const roots = result.rationalRoots as { value: string; multiplicity: number }[];
      facts.push(fact("Polynomial", text(result.polynomial)), fact("Degree", text(result.degree)),
        fact("Derivative", text(result.derivative)), fact("Derivative GCD", text(result.derivativeGcd)),
        fact("Square-free", result.squareFree ? "Yes" : "No"),
        fact("Factors", [factors.unit, ...factors.factors.map((item) => `${item.polynomial} × ${item.multiplicity}`)]),
        fact("Rational roots", roots.length ? roots.map((item) => `${item.value} × ${item.multiplicity}`) : "None"),
        fact("Discriminant", text(result.discriminant)));
      checks.push(check("Dossier identities", "reported", "The typed dossier matches its source and QQ[x] domain; factor and derivative identities are not independently recorded."));
      break;
    }
    case "sage.groebner.compute":
      facts.push(fact("Generators", list(params.polynomials)), fact("Gröbner basis", list(result.basis)));
      checks.push(check("Basis certificate", "reported", "Sage returned the basis; generator reductions and a Gröbner certificate are not recorded."));
      break;
    case "sage.ideal.groebner":
      facts.push(fact("Ideal generators", list(params.generators)), fact("Gröbner basis", list(result.basis)));
      checks.push(check("Basis computation", "reported", "Sage computed this basis in the pinned ambient ring and order."));
      break;
    case "sage.ideal.eliminate":
      facts.push(fact("Eliminated variables", list(result.eliminate)), fact("Elimination basis", list(result.basis)));
      checks.push(check("Elimination computation", "reported", "Sage computed the elimination ideal from the pinned generators."));
      break;
    case "sage.ideal.membership":
      facts.push(fact("Polynomial", text(result.polynomial)), fact("Member", result.member ? "Yes" : "No"),
        fact("Normal form", text(result.normalForm)), fact("Gröbner basis", list(result.basis)));
      checks.push(check("Normal form status", "checked", "Member status agrees with whether the returned normal form is zero."),
        check("Ideal reduction", "reported", "Sage computed the normal form from the pinned ideal; no reduction witness is retained."));
      break;
    case "sage.ideal.quotientDimension":
      facts.push(fact("Quotient", text(result.quotientPresentation)), fact("Krull dimension", text(result.dimension)));
      checks.push(check("Dimension computation", "reported", "Sage computed the dimension of the pinned ideal and quotient."));
      break;
    case "sage.ideal.syzygies":
      facts.push(fact("Ideal generators", list(params.generators)),
        fact("Generator syzygies", matrix(result.syzygies)));
      checks.push(check("Syzygy identities", "reported",
        "The Sage worker checked that every returned row annihilates the pinned generators; the app checks its shape and identity."));
      break;
    case "sage.ideal.hilbertSeries":
      facts.push(fact("Standard graded quotient", "R/I"), fact("Hilbert series", text(result.series)),
        fact("Hilbert numerator", text(result.numerator)), fact("Krull dimension", text(result.dimension)));
      checks.push(check("Grading and Hilbert computation", "reported",
        "The pinned generators passed the conservative homogeneous syntax gate; Sage checked homogeneity and computed the standard graded quotient series."));
      break;
    case "sage.matrix.linear_dossier":
      facts.push(fact("Source matrix", matrix(result.sourceMatrix)), fact("Rank", text(result.rank)),
        fact("RREF", matrix(result.reducedRowEchelonForm)),
        fact("Pivot columns", list(result.pivotColumns)), fact("Kernel basis", matrix(result.kernelBasis)),
        fact("Image basis", matrix(result.imageBasis)),
        fact("Minimal polynomial", text(result.minimalPolynomial)),
        fact("Characteristic polynomial", text(result.characteristicPolynomial)));
      checks.push(check("Kernel and image witnesses", "checked", "The core parser checks A·v=0, the canonical RREF kernel basis and image pivot columns."),
        check("Full matrix equivalence", "reported", "RREF row equivalence and polynomial identities are not independently certified."));
      break;
    case "sage.matrix.integer_forms": {
      const smith = result.smith as { form: string[][]; diagonal: string[]; transformations: { status: string; reason?: string } };
      const hermite = result.hermite as { form: string[][]; transformation: { status: string; reason?: string } };
      const cokernel = result.cokernel as { freeRank: number; torsionOrders: string[] };
      facts.push(fact("Source matrix", matrix(result.sourceMatrix)), fact("Rank", text(result.rank)),
        fact("Smith form", matrix(smith.form)), fact("Smith diagonal", smith.diagonal),
        fact("Hermite form", matrix(hermite.form)), fact("Cokernel free rank", text(cokernel.freeRank)),
        fact("Cokernel torsion", cokernel.torsionOrders.length ? cokernel.torsionOrders : "None"));
      const smithVerified = smith.transformations.status === "verified";
      const hermiteVerified = hermite.transformation.status === "verified";
      checks.push(check("Smith transformation", smithVerified ? "checked" : "unavailable", smithVerified
        ? "Unimodular U and V satisfy U·A·V=D under exact core validation." : smith.transformations.reason ?? "No transformation supplied."),
      check("Hermite transformation", hermiteVerified ? "checked" : "unavailable", hermiteVerified
        ? "Unimodular U satisfies U·A=H under exact core validation." : hermite.transformation.reason ?? "No transformation supplied."),
      check("Smith invariants", "checked", "Diagonal divisibility, rank and cokernel decomposition match the parsed result."));
      if (mode !== "FAILED" && smithVerified && hermiteVerified) mode = "CHECKED";
      break;
    }
  }
  const execution: InspectorFact[] = [
    fact("Operation", operation), fact("Output schema", evidence.request.outputSchema),
    fact("Backend", evidence.runtime.backend), fact("Sage version", evidence.runtime.version),
    fact("Job ID", evidence.runtime.jobId), fact("Elapsed", `${evidence.runtime.elapsedMs} ms`),
    fact("Result hash", evidence.resultHash),
    fact("Warnings", evidence.runtime.warnings.length ? evidence.runtime.warnings : "None"),
    fact("Algorithm", "Not reported"), fact("Proof settings", "Not recorded"),
  ];
  if (operation.startsWith("sage.ideal.")) {
    const budget = params.budget as Record<string, unknown> | undefined;
    execution.push(fact("Ideal budget", budget ? text(budget.profile) : "Legacy fixed worker limits"));
    if (budget) execution.push(fact("Wall time cap", `${text(budget.wallTimeMs)} ms`),
      fact("Degree cap", text(budget.maxDegree)),
      fact("Terms per polynomial cap", text(budget.maxTermsPerPolynomial)),
      fact("Result byte cap", text(budget.maxResultBytes)));
  }
  return { title, result: facts, structure, checks, mode, execution };
};
