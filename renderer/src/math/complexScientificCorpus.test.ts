import { describe, expect, it } from "vitest";
import rawCorpus from "../../../tests/fixtures/complex-analysis-v1/scientific-corpus.json";
import { C, add, exp, mul, scale, type Complex } from "./complex";
import { compileComplexExpression } from "./complexExpr";
import { buildComplexMapSweep, type ComplexMapSweepSpec } from "./complexMapSweep";
import { mapMobiusCircleOrLine, type MobiusParams } from "./mobius";
import { RIEMANN_NORTH_POLE, evalRiemannSheet, sphereToStereographic, stereographicToSphere } from "./riemannSphere";

type ScientificStatus = "exact" | "numerical" | "illustrative";
type Pair = [number, number];
type ScientificAssertion = { status: ScientificStatus; oracle: string; tolerance?: number };
type FunctionCase = ScientificAssertion & { id: string; expression: string; z: Pair; expected: Pair };
type ContourCase = ScientificAssertion & {
  id: string;
  expression: string;
  center: Pair;
  radius: number;
  samples: number;
  expectedIntegral: Pair;
};
type BranchCase = ScientificAssertion & {
  id: string;
  expression: string;
  loopWinding: number;
  sheetCount: number | null;
  expectedIncrement?: Pair;
  expectedPermutation?: number[];
};
type CoveringCase = ScientificAssertion & {
  id: string;
  formula: string;
  basePoint: Pair;
  fiberIndices?: number[];
  degree?: number;
  deckShift: number;
};
type ValueSurfaceCase = ScientificAssertion & {
  id: string;
  expression: string;
  outputMode: ComplexMapSweepSpec["outputMode"];
  mapMode: ComplexMapSweepSpec["mapMode"];
  sheetCount: number;
};
type Corpus = {
  format: string;
  schemaVersion: number;
  functionCases: FunctionCase[];
  contourCases: ContourCase[];
  branchCases: BranchCase[];
  coveringCases: CoveringCase[];
  mobiusCases: Array<ScientificAssertion & { id: string; params: Pair[]; expectedKind: "circle" | "line" }>;
  riemannCases: Array<ScientificAssertion & { id: string; z?: Pair }>;
  valueSurfaceCases: ValueSurfaceCase[];
  uiContract: ScientificAssertion & {
    labs: string[];
    overlays: string[];
    pathModes: string[];
    coveringModels: string[];
    branchCutProfiles: string[];
    valueSurfaceQuantities: string[];
    interactions: string[];
  };
};

const corpus = rawCorpus as Corpus;

const expectNear = (actual: Complex, expected: Pair, tolerance: number) => {
  expect(Math.abs(actual.re - expected[0])).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.im - expected[1])).toBeLessThanOrEqual(tolerance);
};

const integrateCircle = (fixture: ContourCase): Complex => {
  const compiled = compileComplexExpression(fixture.expression);
  if (!compiled.fn || compiled.error) throw new Error(compiled.error?.message ?? `Could not compile ${fixture.expression}`);
  let integral = C();
  for (let index = 0; index < fixture.samples; index += 1) {
    const theta0 = 2 * Math.PI * index / fixture.samples;
    const theta1 = 2 * Math.PI * (index + 1) / fixture.samples;
    const z0 = C(fixture.center[0] + fixture.radius * Math.cos(theta0), fixture.center[1] + fixture.radius * Math.sin(theta0));
    const z1 = C(fixture.center[0] + fixture.radius * Math.cos(theta1), fixture.center[1] + fixture.radius * Math.sin(theta1));
    const f0 = compiled.fn({ z: z0 });
    const f1 = compiled.fn({ z: z1 });
    integral = add(integral, mul(scale(add(f0, f1), 0.5), C(z1.re - z0.re, z1.im - z0.im)));
  }
  return integral;
};

const toMobiusParams = (values: Pair[]): MobiusParams => ({
  a: C(...values[0]!),
  b: C(...values[1]!),
  c: C(...values[2]!),
  d: C(...values[3]!),
});

describe("C01 scientific Complex Analysis fixture corpus", () => {
  it("labels every assertion with an oracle, status, and numerical tolerance where required", () => {
    expect(corpus.format).toBe("math3d.complex-analysis-scientific-corpus");
    expect(corpus.schemaVersion).toBe(1);
    const assertions: ScientificAssertion[] = [
      ...corpus.functionCases,
      ...corpus.contourCases,
      ...corpus.branchCases,
      ...corpus.coveringCases,
      ...corpus.mobiusCases,
      ...corpus.riemannCases,
      ...corpus.valueSurfaceCases,
      corpus.uiContract,
    ];
    expect(assertions.every((entry) => entry.oracle.trim().length > 0)).toBe(true);
    expect(assertions.every((entry) => ["exact", "numerical", "illustrative"].includes(entry.status))).toBe(true);
    expect(assertions.filter((entry) => entry.status === "numerical").every((entry) => Number.isFinite(entry.tolerance) && entry.tolerance! > 0)).toBe(true);
    expect(new Set(corpus.functionCases.map((entry) => entry.expression))).toEqual(new Set([
      "1/z",
      "1/(z^2+1)",
      "sin(z)/z",
      "exp(z)",
      "log(z)",
      "sqrt(z)",
      "z^(1/3)",
      "sqrt(z^2-1)",
    ]));
  });

  it.each(corpus.functionCases)("matches the declared closed-form sample $id", (fixture) => {
    const compiled = compileComplexExpression(fixture.expression);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn).toBeTypeOf("function");
    expectNear(compiled.fn!({ z: C(...fixture.z) }), fixture.expected, fixture.tolerance!);
  });

  it.each(corpus.contourCases)("matches the declared contour oracle $id", (fixture) => {
    expectNear(integrateCircle(fixture), fixture.expectedIntegral, fixture.tolerance!);
  });

  it.each(corpus.branchCases)("matches the declared branch continuation invariant $id", (fixture) => {
    if (fixture.id === "log") {
      expect(fixture.expectedIncrement).toEqual([0, 2 * Math.PI * fixture.loopWinding]);
      return;
    }
    expect(fixture.sheetCount).toBeGreaterThanOrEqual(2);
    const sheetCount = fixture.sheetCount!;
    expect(fixture.expectedPermutation).toEqual(
      Array.from({ length: sheetCount }, (_, index) => (index + fixture.loopWinding) % sheetCount)
    );
    const rootInput = fixture.id === "sqrt-z2-minus-one" ? C(3, 0) : C(1, 0);
    const roots = Array.from({ length: sheetCount }, (_, sheet) => evalRiemannSheet(rootInput.re, rootInput.im, sheet, sheetCount, 0)!);
    expect(roots.every((root) => Number.isFinite(root.re) && Number.isFinite(root.im))).toBe(true);
    expect(new Set(roots.map((root) => `${root.re.toFixed(9)}:${root.im.toFixed(9)}`)).size).toBe(sheetCount);
  });

  it.each(corpus.coveringCases)("matches the declared fiber/deck invariant $id", (fixture) => {
    if (fixture.id === "exp") {
      for (const index of fixture.fiberIndices ?? []) {
        expectNear(exp(C(0, 2 * Math.PI * index)), fixture.basePoint, 1e-12);
        expectNear(exp(C(0, 2 * Math.PI * (index + fixture.deckShift))), fixture.basePoint, 1e-12);
      }
      return;
    }
    const degree = fixture.degree!;
    const roots = Array.from({ length: degree }, (_, index) => C(
      Math.cos(2 * Math.PI * index / degree),
      Math.sin(2 * Math.PI * index / degree)
    ));
    for (const root of roots) {
      let powered = C(1, 0);
      for (let exponent = 0; exponent < degree; exponent += 1) powered = mul(powered, root);
      expectNear(powered, fixture.basePoint, 1e-12);
    }
    expect(roots.map((_, index) => (index + fixture.deckShift) % degree)).toEqual([1, 2, 0]);
  });

  it.each(corpus.mobiusCases)("matches the declared generalized-circle oracle $id", (fixture) => {
    const mapped = mapMobiusCircleOrLine({ kind: "circle", center: C(1, 0), radius: 1 }, toMobiusParams(fixture.params));
    expect(mapped.kind).toBe(fixture.expectedKind);
  });

  it("matches the Riemann-sphere round-trip and infinity conventions", () => {
    const roundTrip = corpus.riemannCases.find((entry) => entry.id === "stereographic-round-trip")!;
    const restored = sphereToStereographic(stereographicToSphere(...roundTrip.z!));
    expect(restored).not.toBeNull();
    expectNear(restored!, roundTrip.z!, roundTrip.tolerance!);
    expect(sphereToStereographic(RIEMANN_NORTH_POLE)).toBeNull();
  });

  it.each(corpus.valueSurfaceCases)("keeps 3D preview $id illustrative and finite", (fixture) => {
    expect(fixture.status).toBe("illustrative");
    const built = buildComplexMapSweep({
      inputMode: "fz",
      fExpr: fixture.expression,
      reExpr: "u",
      imExpr: "v",
      uMin: -1,
      uMax: 1,
      vMin: -1,
      vMax: 1,
      nu: 16,
      nv: 16,
      sweepAxis: "v",
      outputMode: fixture.outputMode,
      wScale: 1,
      clampAbs: 8,
      showIsolines: true,
      isolinesCountU: 4,
      isolinesCountV: 4,
      mapMode: fixture.mapMode,
      sheetCount: fixture.sheetCount,
      sheetMode: fixture.sheetCount > 1 ? "all" : "single",
      sheetIndex: 0,
      branchCutAngle: 0,
    });
    expect(built.error).toBeUndefined();
    expect(built.build?.indices.length).toBeGreaterThan(0);
    expect(Array.from(built.build?.positions ?? []).every(Number.isFinite)).toBe(true);
  });

  it("freezes all current lab entry points and visible workflow families as illustrative contracts", () => {
    expect(corpus.uiContract.status).toBe("illustrative");
    expect(corpus.uiContract.labs).toEqual([
      "Function Explorer",
      "Möbius Lab",
      "Riemann Sphere",
      "Residue Lab",
      "Branch Lab",
      "Covering Lab",
    ]);
    expect(corpus.uiContract.overlays).toHaveLength(14);
    expect(corpus.uiContract.pathModes).toHaveLength(11);
    expect(corpus.uiContract.coveringModels).toHaveLength(5);
    expect(corpus.uiContract.branchCutProfiles).toHaveLength(6);
    expect(corpus.uiContract.valueSurfaceQuantities).toHaveLength(5);
    expect(corpus.uiContract.interactions).toEqual(expect.arrayContaining([
      "sheet/loop animation",
      "fiber inspection",
      "deck transformation",
      "3D value-surface preview",
    ]));
  });
});
