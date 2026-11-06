import { ALGEBRA_OPERATION_REGISTRY, analyzeBiquadraticExtensionFromDefinition,
  analyzeQuadraticNumberField, inspectProjectAlgebraFreshness, parseProjectAlgebraEvidence,
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
  } else if (source?.definition.kind === "number-field") {
    const field = analyzeQuadraticNumberField(source.definition.definingPolynomial, source.definition.generator);
    structure.push(fact("Base field", formatRef(source.definition.baseField)),
      fact("Defining polynomial", field.definingPolynomial), fact("Generator", field.generator),
      fact("Signature", `(${field.signature.join(", ")})`),
      fact("Field discriminant", field.fieldDiscriminant),
      fact("Power basis", field.powerBasis), fact("Integral basis", field.integralBasis),
      fact("Embeddings", field.embeddingImages));
  } else if (source?.definition.kind === "field-extension") {
    const extension = source.definition;
    const base = project.algebraObjects?.find((item) => item.id === extension.baseField.objectId)
      ?.revisions[extension.baseField.revision - 1];
    if (base?.definition.kind === "number-field") {
      const tower = analyzeBiquadraticExtensionFromDefinition(base.definition.definingPolynomial,
        base.definition.generator, extension.radicand, extension.generator);
      structure.push(fact("Base field", formatRef(extension.baseField)),
        fact("Relative polynomial", tower.relativePolynomial),
        fact("Absolute basis", tower.absoluteBasis),
        fact("Base generator image coordinates", tower.baseGeneratorImage),
        fact("Degree product", "2 × 2 = 4"));
    }
  } else if (source?.definition.kind === "ideal") {
    structure.push(fact("Ambient ring", formatRef(source.definition.ambientRing)),
      fact("Generators", source.definition.generators));
  } else if (source?.definition.kind === "quotient-ring") {
    structure.push(fact("Ambient ring", formatRef(source.definition.ambientRing)),
      fact("Ideal", formatRef(source.definition.ideal)));
  } else if (source?.definition.kind === "finite-group") {
    const group = source.definition;
    structure.push(fact("Representation", group.representation),
      fact("Generators", group.representation === "permutation"
        ? group.generators.map((item) => `${item.name}: (${item.images.join(", ")})`)
        : group.generators.map((name, index) => `${name}: C${group.invariantFactors[index]}`)));
  } else if (source?.definition.kind === "module") {
    structure.push(fact("Base ring", formatRef(source.definition.baseRing)),
      fact("Ambient generators", source.definition.generators),
      fact("Relation matrix", source.definition.relationMap.matrix));
  } else if (source?.definition.kind === "chain-complex") {
    structure.push(fact("Coefficient ring", formatRef(source.definition.coefficientRing)),
      fact("Chain modules C0, C1, C2", source.definition.modules.map(formatRef)),
      fact("Boundary maps d1, d2", source.definition.boundaries.map(formatRef)));
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
    case "sage.numberField.localExtensions": {
      const branches = result.branches as Record<string, unknown>[];
      facts.push(fact("Prime", text(result.prime)), fact("Base precision digits", text(result.precision)),
        fact("Global field discriminant", text(result.fieldDiscriminant)),
        fact("Prime behavior", text(result.splitting)),
        fact("Local branches", branches.map((branch, index) =>
          `P${index + 1}: e=${text(branch.ramificationIndex)}, f=${text(branch.residueDegree)}, ` +
          `degree=${text(branch.localDegree)}, residue order=${text(branch.residueOrder)}`)),
        fact("Prime ideals", branches.map((branch) => text(branch.ideal))),
        fact("Uniformizers", branches.map((branch) => text(branch.uniformizer))));
      checks.push(check("Quadratic local data", "checked",
        "The pinned field discriminant determines split, inert or ramified behavior; e·f, ideal norms, residue orders, base-prime valuations and any split roots are checked exactly."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.numberTheory.padic": {
      const entries = result.entries as Record<string, Record<string, unknown>>;
      facts.push(fact("Domain", `${text(result.domain)}(${text(result.prime)})`),
        fact("Requested precision digits", text(result.precision)));
      for (const key of ["a", "b", "sum", "product"]) {
        const entry = entries[key];
        facts.push(fact(`${key} display`, text(entry.text)),
          fact(`${key} valuation`, text(entry.valuation)),
          fact(`${key} absolute precision`, entry.absolutePrecision === null ? "∞" : text(entry.absolutePrecision)),
          fact(`${key} relative precision`, text(entry.relativePrecision)),
          fact(`${key} zero status`, text(entry.zeroStatus)),
          fact(`${key} unit digits`, list(entry.digits)));
      }
      if (result.hensel) {
        const root = result.hensel as Record<string, unknown>;
        facts.push(fact("Hensel root residue", text(root.rootResidue)),
          fact("Hensel modulus", text(root.modulus)),
          fact("Hensel absolute precision", text(root.absolutePrecision)));
      }
      checks.push(check("p-adic precision and congruence", "checked",
        "Exact rational sources, unit digits, valuations, finite-precision zero labels and any Hensel root congruence are independently checked."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.finiteField.explore": {
      const selected = result.selected as Record<string, unknown>;
      facts.push(fact("Field", `GF(${text(result.characteristic)}^${text(result.degree)})`),
        fact("Order", text(result.order)), fact("Generator", text(result.generator)),
        fact("Defining polynomial coefficients", result.definingPolynomial === null ? "Prime field" : list(result.definingPolynomial)),
        fact("Selected element coefficients", list(selected.coefficients)),
        fact("Frobenius orbit", matrix(selected.frobeniusOrbit)),
        fact("Trace", text(selected.trace)), fact("Norm", text(selected.norm)),
        fact("Minimal polynomial coefficients", list(selected.minimalPolynomial)),
        fact("Multiplicative order", text(selected.multiplicativeOrder)),
        fact("Primitive", selected.primitive ? "Yes" : "No"),
        fact("Enumerated elements", String((result.elements as unknown[]).length)));
      checks.push(check("Exact finite-field arithmetic", "checked",
        "The saved modulus, element enumeration, Frobenius orbit, trace, norm, primitive list and bounded multiplication table were independently checked."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.chain.homology": {
      const groups = result.groups as { degree: number; freeRank: number; torsionOrders: string[] }[];
      const notation = (group: typeof groups[number]) => {
        const parts = [...Array.from({ length: group.freeRank }, () => "ZZ"),
          ...group.torsionOrders.map((order) => `ZZ/${order}ZZ`)];
        return parts.length ? parts.join(" ⊕ ") : "0";
      };
      facts.push(...groups.map((group) => fact(`H${group.degree}`, notation(group))),
        fact("Chain ranks C0, C1, C2", list(result.dimensions)),
        fact("Boundary ranks d1, d2", [
          String((result.boundary1Smith as { diagonal: string[] }).diagonal.filter((entry) => entry !== "0").length),
          String((result.restrictedBoundary2Smith as { diagonal: string[] } | null)?.diagonal.filter((entry) => entry !== "0").length ?? 0)]),
        fact("Boundary d1 Smith diagonal", (result.boundary1Smith as { diagonal: string[] }).diagonal),
        fact("Restricted d2 Smith diagonal", (result.restrictedBoundary2Smith as { diagonal: string[] } | null)?.diagonal ?? "Zero kernel rank"));
      checks.push(check("Exact chain condition", "checked", "Pinned integer boundary matrices satisfy d1·d2=0."),
        check("Homology witnesses", "checked", "Unimodular Smith matrices, kernel-basis inverse, restricted image, free ranks and torsion factors verify exactly."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.module.invariantFactors": {
      const torsion = result.torsionOrders as string[];
      const smith = result.smith as { form: string[][]; diagonal: string[] } | null;
      const freeRank = result.freeRank as number;
      const summands = [...Array.from({ length: freeRank }, () => "ZZ"),
        ...torsion.map((order) => `ZZ/${order}ZZ`)];
      facts.push(fact("Decomposition", summands.length ? summands.join(" ⊕ ") : "0"),
        fact("Free rank", String(freeRank)),
        fact("Torsion invariant factors", torsion.length ? torsion : "None"),
        fact("Smith diagonal", smith?.diagonal ?? "No relations"),
        fact("Smith form", smith?.form ?? []));
      checks.push(check("Module classification", "checked", smith
        ? "Exact unimodular U and V verify U·A·V=D; diagonal divisibility and the free and torsion summands match."
        : "The pinned relation map has zero columns, so the module is free."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.group.dossier": {
      const subgroups = result.subgroups as { members: number[]; normal: boolean }[];
      facts.push(fact("Group order", text(result.order)), fact("Action degree", text(result.actionDegree)),
        fact("Center order", String((result.center as number[]).length)),
        fact("Center element indices", list(result.center)),
        fact("Conjugacy classes", (result.conjugacyClasses as number[][]).map((items) => items.join(", "))),
        fact("Subgroups", subgroups.map((item) => `{${item.members.join(", ")}}${item.normal ? " · normal" : ""}`)),
        fact("GAP version", text(result.gapVersion)), fact("Enumeration", "Complete"));
      checks.push(check("Finite group invariants", "checked",
        "The app independently rebuilds the exact action, center, conjugacy partition and complete bounded subgroup list."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.algebra.reconstruct":
      facts.push(fact("Presentation", text(result.text)), fact("Characteristic", text(result.characteristic)),
        fact("Field", result.isField ? "Yes" : "No"), fact("Base ring", text(result.baseRing)),
        fact("Variables", list(result.variables)));
      if (result.numberField && typeof result.numberField === "object") {
        const field = result.numberField as Record<string, unknown>;
        facts.push(fact("Degree", text(field.degree)), fact("Signature", list(field.signature)),
          fact("Polynomial discriminant", text(field.polynomialDiscriminant)),
          fact("Field discriminant", text(field.fieldDiscriminant)),
          fact("Power basis", list(field.powerBasis)), fact("Sage integral basis", list(field.integralBasis)),
          fact("Embedding count", text(field.embeddingCount)));
      }
      if (result.fieldExtension && typeof result.fieldExtension === "object") {
        const tower = result.fieldExtension as Record<string, unknown>;
        facts.push(fact("Base degree", text(tower.baseDegree)),
          fact("Relative degree", text(tower.relativeDegree)),
          fact("Absolute degree", text(tower.absoluteDegree)),
          fact("Base generator image", text(tower.baseGeneratorImage)),
          fact("Extension generator", text(tower.extensionGenerator)));
        checks.push(check("Field inclusion", "checked",
          "Sage reports a canonical base map, both defining relations vanish, and 2 × 2 = 4."));
        if (mode !== "FAILED") mode = "CHECKED";
      }
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
    case "sage.numberField.elementDossier": {
      const embeddings = Array.isArray(result.embeddings) ? result.embeddings as Record<string, unknown>[] : [];
      facts.push(fact("Element coefficients", list(result.element)), fact("Norm to QQ", text(result.norm)),
        fact("Trace to QQ", text(result.trace)), fact("Power basis", list(result.basis)),
        fact("Base, relative, absolute degrees", [text(result.baseDegree), text(result.relativeDegree), text(result.absoluteDegree)]),
        fact("Embeddings", embeddings.map((item) => `${text(item.generatorImage)} → ${text(item.elementImage)}`)));
      checks.push(check("Quadratic identities", "checked",
        "Exact norm, trace, basis, embeddings and degree product match the pinned defining polynomial."));
      if (mode !== "FAILED") mode = "CHECKED";
      break;
    }
    case "sage.numberField.primeDecomposition": {
      const factors = Array.isArray(result.factors) ? result.factors as Record<string, unknown>[] : [];
      facts.push(fact("Rational prime", text(result.prime)), fact("Splitting", text(result.splitting)),
        fact("Prime ideal factors", factors.map((item) => `${text(item.ideal)} · e=${text(item.ramificationIndex)}, f=${text(item.residueDegree)}, N=${text(item.norm)}`)),
        fact("Degree check", text(result.degreeCheck)));
      checks.push(check("Prime decomposition invariants", "checked",
        "Ramification indices, residue degrees and norms satisfy the quadratic degree and discriminant test."));
      if (mode !== "FAILED") mode = "CHECKED";
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
    case "sage.galois.analyze": {
      const group = result.group as Record<string, unknown>;
      const splitting = result.splittingField as Record<string, unknown>;
      const subgroups = result.subgroups as Record<string, unknown>[];
      facts.push(fact("Source polynomial", text(result.sourcePolynomial)),
        fact("Transitive group", text(group.transitiveId)),
        fact("Group classification", text(group.classification)),
        fact("Notation convention", text(group.convention)),
        fact("Group order", text(group.order)),
        fact("Splitting field degree", text(splitting.degree)),
        fact("Splitting field polynomial", text(splitting.definingPolynomial)),
        fact("Regular permutation degree", text(group.regularDegree)),
        fact("Generator indices", list(group.generators)),
        fact("Solvable", group.solvable ? "Yes" : "No"),
        fact("Subgroups", String(subgroups.length)), fact("Lattice", result.complete ? "Complete" : "Truncated"));
      checks.push(check("Permutation group", "checked",
        "The app verifies closure, identity, generators and the complete bounded subgroup enumeration."),
      check("Galois correspondence", "checked",
        "Subgroup normality and index/degree products are checked; Sage verifies each fixed-field defining relation."));
      if (mode !== "FAILED") mode = "CHECKED";
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
  const certificate = evidence.certificate;
  if (certificate) execution.push(
    fact("Certificate", `v${certificate.schemaVersion} · ${certificate.contentHash}`),
    fact("Input schema", certificate.operation.inputSchema),
    fact("Request hash", certificate.requestHash),
    fact("Pinned sources", certificate.sources.map((source) =>
      `${source.objectId}@${source.revision} · ${source.contentHash}`)),
    fact("Input size", `${certificate.inputBytes} bytes`),
    fact("Output size", `${certificate.outputBytes} bytes`),
    fact("Outcome", `${certificate.outcome.status} · ${certificate.outcome.representation} representation`),
    fact("Certificate checks", certificate.verifier.checks),
    fact("Mathematical proof", "Not claimed by this execution certificate"),
    fact("Subsystem", certificate.runtime.subsystem
      ? `${certificate.runtime.subsystem} ${certificate.runtime.subsystemVersion ?? ""}`.trim() : "Not reported"),
    fact("Peak memory", certificate.runtime.peakMemoryBytes === null ? "Not measured" : `${certificate.runtime.peakMemoryBytes} bytes`),
    fact("Recorded limits", certificate.limits
      ? `${certificate.limits.profile} · ${certificate.limits.wallTimeMs} ms · ${certificate.limits.maxResultBytes} bytes output`
      : "Not recorded"));
  else execution.push(fact("Certificate", "Legacy evidence · no execution certificate"));
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
