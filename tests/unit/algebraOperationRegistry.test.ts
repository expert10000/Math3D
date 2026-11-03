import { describe, expect, it } from "vitest";
import { ALGEBRA_OPERATION_REGISTRY, algebraOperationsFor, buildAlgebraOperationRequest,
  parseAlgebraOperationResult, type AlgebraRouteCapability,
  createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject, type AlgebraObjectDefinition,
  type AlgebraObjectRecord, type AlgebraObjectRef, type Math3DProject } from "../../packages/core/src/index";

const empty = () => createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-b01", title: "Typed algebra operations" });
const add = (project: Math3DProject, label: string, definition: AlgebraObjectDefinition): [Math3DProject, AlgebraObjectRecord] => {
  const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, label),
    label, revision: 1, definition });
  return [upsertMath3DProjectAlgebraObject(project, record), record];
};
const ref = (record: AlgebraObjectRecord): AlgebraObjectRef => ({ objectId: record.id, revision: record.revision });
const ready: AlgebraRouteCapability[] = [
  { backend: "docker", available: true, operations: ALGEBRA_OPERATION_REGISTRY.map((item) => item.capability) },
  { backend: "private", available: true, operations: ["number-theory.gcd", "number-theory.mod-inverse"] },
];
const eligible = (project: Math3DProject, target: AlgebraObjectRef) =>
  algebraOperationsFor(project, target, ready).filter((item) => item.eligible).map((item) => item.definition.id);

describe("SAGE-B01 typed object operation registry", () => {
  it("filters operations by object kind, direct coefficient domain and arity", () => {
    let project = empty();
    let z: AlgebraObjectRecord, q: AlgebraObjectRecord, z12: AlgebraObjectRecord, f49: AlgebraObjectRecord;
    [project, z] = add(project, "Z", { kind: "integer-ring" });
    [project, q] = add(project, "Q", { kind: "rational-field" });
    [project, z12] = add(project, "Z12", { kind: "modular-ring", modulus: "12" });
    [project, f49] = add(project, "F49", { kind: "finite-field", characteristic: 7, degree: 2,
      generator: "a", construction: "canonical" });
    let rxy: AlgebraObjectRecord, rt: AlgebraObjectRecord, ft: AlgebraObjectRecord;
    [project, rxy] = add(project, "Rxy", { kind: "polynomial-ring", coefficientDomain: ref(q),
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    [project, rt] = add(project, "Rt", { kind: "polynomial-ring", coefficientDomain: ref(q),
      variables: ["t"], monomialOrder: "lex" });
    [project, ft] = add(project, "Ft", { kind: "polynomial-ring", coefficientDomain: ref(f49),
      variables: ["t"], monomialOrder: "lex" });
    expect(eligible(project, ref(z))).toEqual(["sage.algebra.reconstruct", "sage.algebra.inspectDomains", "sage.numberTheory.gcd"]);
    expect(eligible(project, ref(z12))).toEqual(["sage.algebra.reconstruct", "sage.algebra.inspectDomains", "sage.numberTheory.modInverse"]);
    expect(eligible(project, ref(q))).toEqual(["sage.algebra.reconstruct", "sage.algebra.inspectDomains"]);
    expect(eligible(project, ref(rxy))).toEqual(["sage.algebra.reconstruct", "sage.algebra.inspectDomains", "sage.polynomial.factor", "sage.groebner.compute"]);
    expect(eligible(project, ref(rt))).toContain("sage.polynomial.roots_exact");
    expect(eligible(project, ref(ft))).toEqual(["sage.algebra.reconstruct", "sage.algebra.inspectDomains"]);
    expect(algebraOperationsFor(project, ref(ft), ready).find((item) => item.definition.id === "sage.polynomial.factor")?.reason)
      .toMatch(/direct QQ coefficient domain/);
  });

  it("separates mathematical eligibility from runtime availability and stale definitions", () => {
    let project = empty();
    let q: AlgebraObjectRecord, r: AlgebraObjectRecord, child: AlgebraObjectRecord;
    [project, q] = add(project, "Q", { kind: "rational-field" });
    [project, r] = add(project, "R", { kind: "polynomial-ring", coefficientDomain: ref(q),
      variables: ["x"], monomialOrder: "lex" });
    [project, child] = add(project, "S", { kind: "polynomial-ring", coefficientDomain: ref(r),
      variables: ["t"], monomialOrder: "lex" });
    const offline = algebraOperationsFor(project, ref(r), [{ backend: "docker", available: false,
      operations: ["algebra.reconstruct"], reason: "offline" }]);
    expect(offline.find((item) => item.definition.id === "sage.algebra.reconstruct")).toMatchObject({
      eligible: true, readyBackend: null, runtimeReason: expect.stringContaining("No available docker route") });
    const newR = createAlgebraObjectRecord({ id: r.id, label: "R", revision: 2,
      definition: { kind: "polynomial-ring", coefficientDomain: ref(q), variables: ["y"], monomialOrder: "lex" } });
    project = upsertMath3DProjectAlgebraObject(project, newR);
    expect(algebraOperationsFor(project, ref(child), ready).every((item) => !item.eligible && /stale parent/.test(item.reason ?? ""))).toBe(true);
    expect(algebraOperationsFor(project, ref(r), ready).every((item) => !item.eligible && /current object revision/.test(item.reason ?? ""))).toBe(true);
  });

  it("builds bounded typed requests, derives modulus and rejects executable or mismatched data", () => {
    let project = empty();
    let z: AlgebraObjectRecord, q: AlgebraObjectRecord, z12: AlgebraObjectRecord, r: AlgebraObjectRecord, rt: AlgebraObjectRecord, rlex: AlgebraObjectRecord;
    [project, z] = add(project, "Z", { kind: "integer-ring" });
    [project, q] = add(project, "Q", { kind: "rational-field" });
    [project, z12] = add(project, "Z12", { kind: "modular-ring", modulus: "12" });
    [project, r] = add(project, "R", { kind: "polynomial-ring", coefficientDomain: ref(q),
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    [project, rt] = add(project, "Rt", { kind: "polynomial-ring", coefficientDomain: ref(q),
      variables: ["t"], monomialOrder: "lex" });
    [project, rlex] = add(project, "Rlex", { kind: "polynomial-ring", coefficientDomain: ref(q),
      variables: ["x", "y"], monomialOrder: "lex" });
    const reconstruct = buildAlgebraOperationRequest(project, ref(r), "sage.algebra.reconstruct", "docker", {});
    expect(reconstruct.params).toMatchObject({ target: ref(r), objects: [{ id: q.id }, { id: r.id }] });
    const domains = buildAlgebraOperationRequest(project, ref(z), "sage.algebra.inspectDomains", "docker", { other: ref(q) });
    expect(domains.params).toMatchObject({ left: { target: ref(z) }, right: { target: ref(q) } });
    const gcd = buildAlgebraOperationRequest(project, ref(z), "sage.numberTheory.gcd", "private", { values: ["84", "30"] });
    expect(gcd.params).toEqual({ values: ["84", "30"] });
    expect(parseAlgebraOperationResult(gcd, { value: "6" })).toEqual({ value: "6" });
    expect(() => parseAlgebraOperationResult({ ...gcd, outputSchema: "forged" }, { value: "6" })).toThrow(/output schema/);
    expect(() => parseAlgebraOperationResult(gcd, { value: "6", code: "print(1)" })).toThrow(/GCD/);
    const inverse = buildAlgebraOperationRequest(project, ref(z12), "sage.numberTheory.modInverse", "docker", { a: "5" });
    expect(inverse.params).toEqual({ a: "5", modulus: "12" });
    expect(() => parseAlgebraOperationResult(inverse, { value: "5", modulus: "13" })).toThrow(/mismatched/);
    expect(() => buildAlgebraOperationRequest(project, ref(z), "sage.numberTheory.gcd", "docker",
      { values: ["84", "30"], code: "print(1)" } as never)).toThrow(/GCD/);
    expect(() => buildAlgebraOperationRequest(project, ref(z), "sage.numberTheory.gcd", "docker",
      { values: ["-0", "30"] })).toThrow(/canonical signed integers/);
    expect(() => buildAlgebraOperationRequest(project, ref(r), "sage.algebra.reconstruct", "docker",
      new Date() as never)).toThrow(/structured object/);
    const factor = buildAlgebraOperationRequest(project, ref(r), "sage.polynomial.factor", "docker", { polynomial: "x^2-y^2" });
    expect(factor.params).toEqual({ polynomial: "x^2-y^2", variables: ["x", "y"], order: "degrevlex" });
    expect(parseAlgebraOperationResult(factor, { text: "(x-y)*(x+y)" })).toEqual({ text: "(x-y)*(x+y)" });
    expect(() => parseAlgebraOperationResult(factor, { text: "", code: "print(1)" })).toThrow(/factorization/);
    const roots = buildAlgebraOperationRequest(project, ref(rt), "sage.polynomial.roots_exact", "docker", { polynomial: "t^2-1" });
    expect(parseAlgebraOperationResult(roots, { roots: [{ value: "-1", multiplicity: 1 }, { value: "1", multiplicity: 1 }] }))
      .toMatchObject({ roots: [{ value: "-1" }, { value: "1" }] });
    expect(() => parseAlgebraOperationResult(roots, { roots: [{ value: "1", multiplicity: 0 }] })).toThrow(/roots/);
    const groebner = buildAlgebraOperationRequest(project, ref(r), "sage.groebner.compute", "docker",
      { polynomials: ["x^2+y^2-1", "x-y"] });
    expect(groebner.params).toMatchObject({ polynomials: ["x^2+y^2-1", "x-y"], variables: ["x", "y"], order: "degrevlex" });
    expect(buildAlgebraOperationRequest(project, ref(rlex), "sage.groebner.compute", "docker",
      { polynomials: ["x-y"] }).params).toMatchObject({ order: "lex" });
    expect(parseAlgebraOperationResult(groebner, { basis: ["x-y", "2*y^2-1"] })).toEqual({ basis: ["x-y", "2*y^2-1"] });
    expect(() => parseAlgebraOperationResult(groebner, { basis: ["x-y"], extra: true })).toThrow(/Gröbner/);
    expect(() => buildAlgebraOperationRequest(project, ref(r), "sage.polynomial.factor", "docker",
      { polynomial: "__import__(x)" })).toThrow(/bounded polynomial/);
    expect(() => buildAlgebraOperationRequest(project, ref(r), "sage.polynomial.factor", "docker",
      { polynomial: "x^9999" })).toThrow(/bounded polynomial/);
    expect(() => buildAlgebraOperationRequest(project, ref(r), "sage.polynomial.roots_exact", "docker",
      { polynomial: "x^2-1" })).toThrow(/exactly one polynomial variable/);
  });
});
