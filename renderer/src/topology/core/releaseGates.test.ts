import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../../mesh/surfaceMesh";
import { analyzeMeshTopologySnapshot } from "../adapters";
import { createTopologyDocument, migrateTopologyDocument } from "../documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import { analyzeCanonicalTopologyObject, type CanonicalTopologyAnalysis } from "./analysisPipeline";
import { createTopologyObjectFromCWComplex } from "./canonicalize";
import type { CWComplexInput } from "./contracts";

type ExpectedHomology = { betti: [number, number, number]; h1Torsion?: string[] };
type FormalFixture = { name: string; build: () => CanonicalTopologyAnalysis; expected: ExpectedHomology };

const analyzeCW = (input: CWComplexInput): CanonicalTopologyAnalysis =>
  analyzeCanonicalTopologyObject(createTopologyObjectFromCWComplex(input));

const oneVertexCW = (
  id: string,
  edges: string[],
  faceWords: Array<Array<{ edgeId: string; direction: 1 | -1 }>> = []
): CWComplexInput => ({
  id,
  name: id,
  vertices: [{ id: "v", name: "base" }],
  edges: edges.map((edgeId) => ({ id: edgeId, endpoints: ["v", "v"] })),
  faces: faceWords.map((attachment, index) => ({ id: `f${index}`, attachment })),
});

const analyzePreset = (id: string): CanonicalTopologyAnalysis => {
  const preset = TOPOLOGY_PRESET_BY_ID.get(id);
  if (!preset) throw new Error(`Missing release fixture preset '${id}'.`);
  const built = buildQuotientPipeline(preset.buildDiagram());
  return {
    topologyObject: built.topologyObject,
    structuralValidation: built.structuralValidation,
    cellularBoundaryOperators: built.cellularBoundaryOperators,
    homology: built.homology,
    algebraicConsistency: built.algebraicConsistency,
    fundamentalGroup: built.fundamentalGroup,
    surfaceClassification: built.surfaceClassification,
  };
};

const tetrahedron = (): SurfaceMeshData => ({
  label: "Release sphere tetrahedron",
  positions: new Float32Array([1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
  source: { kind: "polyhedronPreset", id: "tetra" },
});

const fixtures: FormalFixture[] = [
  { name: "Point", build: () => analyzeCW(oneVertexCW("point", [])), expected: { betti: [1, 0, 0] } },
  { name: "Circle", build: () => analyzeCW(oneVertexCW("circle", ["a"])), expected: { betti: [1, 1, 0] } },
  {
    name: "Sphere",
    build: () => {
      const result = analyzeMeshTopologySnapshot({ mesh: tetrahedron(), sourceObjectId: "sphere", sourceObjectRevision: "1" });
      if (result.status !== "accepted" || !result.analysis) throw new Error("Sphere Mesh fixture was rejected.");
      return result.analysis;
    },
    expected: { betti: [1, 0, 1] },
  },
  { name: "Torus", build: () => analyzePreset("torus_square"), expected: { betti: [1, 2, 1] } },
  { name: "Cylinder", build: () => analyzePreset("cylinder"), expected: { betti: [1, 1, 0] } },
  { name: "Möbius band", build: () => analyzePreset("mobius_from_rectangle"), expected: { betti: [1, 1, 0] } },
  { name: "RP2", build: () => analyzePreset("projective_plane"), expected: { betti: [1, 0, 0], h1Torsion: ["2"] } },
  { name: "Klein bottle", build: () => analyzePreset("klein_bottle_square"), expected: { betti: [1, 1, 0], h1Torsion: ["2"] } },
  {
    name: "Moore M(Z/3,1)",
    build: () => analyzeCW(oneVertexCW("moore-z3", ["a"], [[
      { edgeId: "a", direction: 1 },
      { edgeId: "a", direction: 1 },
      { edgeId: "a", direction: 1 },
    ]])),
    expected: { betti: [1, 0, 0], h1Torsion: ["3"] },
  },
  {
    name: "Contractible degree-one 2-complex",
    build: () => analyzeCW(oneVertexCW("degree-one", ["a"], [[{ edgeId: "a", direction: 1 }]])),
    expected: { betti: [1, 0, 0] },
  },
];

describe("Topology v1 formal release matrix", () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: canonicalization, exact algebra, mapping, provenance, and diagnostics`, () => {
      const first = fixture.build();
      const second = fixture.build();
      expect(first.topologyObject.provenance.canonicalization.hash).toBe(second.topologyObject.provenance.canonicalization.hash);
      expect(first.structuralValidation.value?.structurallyValid).toBe(true);
      expect(first.cellularBoundaryOperators.status).toBe("exact");
      expect(first.cellularBoundaryOperators.value?.chainCondition.holds).toBe(true);
      expect(first.homology.status).toBe("exact");
      expect(first.homology.value?.integer.groups.map((group) => group.bettiNumber)).toEqual(fixture.expected.betti);
      expect(first.homology.value?.integer.groups[1].torsionCoefficients).toEqual(fixture.expected.h1Torsion ?? []);
      expect(first.algebraicConsistency.value?.holds).toBe(true);
      expect(first.fundamentalGroup.value?.abelianization.agreesWithExactH1).toBe(true);
      expect(first.topologyObject.provenance.source.hash).toMatch(/^fnv1a32:/);
      expect(first.topologyObject.provenance.canonicalization.algorithmVersion).toMatch(/@1$/);
      const cells = [
        ...first.topologyObject.canonical.vertices,
        ...first.topologyObject.canonical.edges,
        ...first.topologyObject.canonical.faces,
      ];
      expect(cells.every((cell) => cell.sourceRefs.length > 0)).toBe(true);
      const exactEntries = [
        ...(first.cellularBoundaryOperators.value?.boundary1.entries.flat() ?? []),
        ...(first.cellularBoundaryOperators.value?.boundary2.entries.flat() ?? []),
      ];
      expect(exactEntries.every((entry) => /^-?\d+$/.test(entry))).toBe(true);
    });
  }

  it("invalidates stale document caches and recomputes from the authoritative source", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const document = createTopologyDocument(diagram);
    document.payload.cache.algorithmVersions.homology = "stale@0";
    document.payload.cache.analysis.homology = { status: "failed", method: "tampered", assumptions: [], sourceRevision: "bad", algorithmVersion: "bad", diagnostics: [] };
    const loaded = migrateTopologyDocument(document);
    expect(loaded?.audit.migration).toBe("v2-stale-recomputed");
    expect(loaded?.buildResult.homology.status).toBe("exact");
    expect(loaded?.document.payload.cache.algorithmVersions.homology).not.toBe("stale@0");
  });
});
