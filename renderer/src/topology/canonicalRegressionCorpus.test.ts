import { describe, expect, it } from "vitest";
import corpusJson from "../../../tests/fixtures/topology-v1/canonical-regression-corpus.json";
import {
  analyzeCanonicalTopologyObject,
  createTopologyObjectFromCWComplex,
  type CanonicalTopologyAnalysis,
  type CWComplexInput,
  type TopologyResultStatus,
} from "./core";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";

type Authority = "exact" | "certified-within-model" | "unsupported" | "illustrative";
type Matrix = string[][] | null;
type CorpusEntry = {
  id: string;
  name: string;
  source:
    | { kind: "preset"; presetId: string }
    | { kind: "cw-complex"; value: CWComplexInput };
  expected: {
    canonicalCellCounts: [number, number, number];
    validation: {
      status: TopologyResultStatus;
      structurallyValid: boolean;
      cellularAlgebraEligible: boolean;
      requiredDiagnosticCodes: string[];
    };
    boundary: { authority: Authority; status: TopologyResultStatus; d1: Matrix; d2: Matrix };
    homology: {
      authority: Authority;
      status: TopologyResultStatus;
      integerGroups: string[] | null;
      mod2Dimensions: number[] | null;
      h1Torsion: string[] | null;
    };
    classification: {
      authority: Authority;
      status: TopologyResultStatus;
      eligible: boolean | null;
      label: string | null;
    };
  };
  sourceToView: {
    sourceCell: { dimension: 0 | 1 | 2; cellId: string };
    canonicalCellId: string;
    authority: Authority;
  };
  realizationExample?: { idSuffix: string; kind: string; authority: Authority };
  claims: Array<{ subject: string; authority: Authority }>;
};

type Corpus = {
  schemaVersion: number;
  corpusId: string;
  authorityDefinitions: Record<Authority, string>;
  entries: CorpusEntry[];
};

const corpus = corpusJson as unknown as Corpus;
const REQUIRED_IDS = [
  "point",
  "circle",
  "sphere",
  "torus",
  "cylinder",
  "mobius-band",
  "rp2",
  "klein-bottle",
  "moore-z3-1",
  "invalid-dangling-complex",
] as const;
const AUTHORITIES: Authority[] = ["exact", "certified-within-model", "unsupported", "illustrative"];

const build = (fixture: CorpusEntry): CanonicalTopologyAnalysis => {
  if (fixture.source.kind === "cw-complex") {
    return analyzeCanonicalTopologyObject(createTopologyObjectFromCWComplex(fixture.source.value));
  }
  const preset = TOPOLOGY_PRESET_BY_ID.get(fixture.source.presetId);
  if (!preset) throw new Error(`Missing corpus preset '${fixture.source.presetId}'.`);
  return buildQuotientPipeline(preset.buildDiagram());
};

const canonicalCells = (analysis: CanonicalTopologyAnalysis, dimension: 0 | 1 | 2) => {
  if (dimension === 0) return analysis.topologyObject.canonical.vertices;
  if (dimension === 1) return analysis.topologyObject.canonical.edges;
  return analysis.topologyObject.canonical.faces;
};

const validateCwShape = (source: CWComplexInput): void => {
  expect(source.id.length).toBeGreaterThan(0);
  expect(source.name.length).toBeGreaterThan(0);
  const allCells = [...source.vertices, ...source.edges, ...source.faces];
  expect(allCells.every((cell) => typeof cell.id === "string" && cell.id.length > 0)).toBe(true);
  expect(new Set(allCells.map((cell) => cell.id)).size).toBe(allCells.length);
  expect(source.edges.every((edge) => edge.endpoints.length === 2)).toBe(true);
  expect(source.faces.flatMap((face) => face.attachment).every((entry) =>
    typeof entry.edgeId === "string" && (entry.direction === 1 || entry.direction === -1)
  )).toBe(true);
};

describe("Topology T01 canonical regression corpus", () => {
  it("has one reviewed schema-v1 entry for every required space", () => {
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.corpusId).toBe("topology-v1-canonical-regression");
    expect(Object.keys(corpus.authorityDefinitions).sort()).toEqual([...AUTHORITIES].sort());
    expect(Object.values(corpus.authorityDefinitions).every((definition) => definition.length > 0)).toBe(true);
    expect(corpus.entries.map((entry) => entry.id).sort()).toEqual([...REQUIRED_IDS].sort());
    expect(new Set(corpus.entries.map((entry) => entry.id)).size).toBe(corpus.entries.length);
  });

  it("declares source shapes and authority without transient UI or numerical oracles", () => {
    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toMatch(/"(?:pixels?|timestamp|animation|layout|camera|frameTime|sampledPoints)"/i);
    for (const fixture of corpus.entries) {
      if (fixture.source.kind === "preset") {
        expect(TOPOLOGY_PRESET_BY_ID.has(fixture.source.presetId), fixture.id).toBe(true);
      } else {
        validateCwShape(fixture.source.value);
      }
      expect(fixture.sourceToView.authority).toBe("exact");
      expect(fixture.claims.length).toBeGreaterThanOrEqual(4);
      expect(fixture.claims.every((claim) => AUTHORITIES.includes(claim.authority))).toBe(true);
      expect(fixture.claims.find((claim) => claim.subject === "cellular-boundary")?.authority)
        .toBe(fixture.expected.boundary.authority);
      expect(fixture.claims.find((claim) => claim.subject === "homology")?.authority)
        .toBe(fixture.expected.homology.authority);
      expect(fixture.claims.find((claim) => claim.subject === "surface-classification")?.authority)
        .toBe(fixture.expected.classification.authority);
      if (fixture.realizationExample) {
        expect(fixture.realizationExample.authority).toBe("illustrative");
        expect(fixture.claims).toContainEqual({ subject: "3d-realization", authority: "illustrative" });
      }
    }
  });

  it.each(corpus.entries)("replays $id deterministically against its declared oracle", (fixture) => {
    const first = build(fixture);
    const second = build(fixture);
    const expected = fixture.expected;
    const canonical = first.topologyObject.canonical;

    expect(first.topologyObject.provenance.canonicalization.hash).toBe(
      second.topologyObject.provenance.canonicalization.hash
    );
    expect([canonical.vertices.length, canonical.edges.length, canonical.faces.length]).toEqual(
      expected.canonicalCellCounts
    );
    expect(first.structuralValidation.status).toBe(expected.validation.status);
    expect(first.structuralValidation.value?.structurallyValid ?? false).toBe(expected.validation.structurallyValid);
    expect(first.structuralValidation.value?.canComputeCellularAlgebra ?? false)
      .toBe(expected.validation.cellularAlgebraEligible);
    const diagnosticCodes = first.structuralValidation.diagnostics.map((entry) => entry.code);
    for (const code of expected.validation.requiredDiagnosticCodes) expect(diagnosticCodes).toContain(code);

    expect(first.cellularBoundaryOperators.status).toBe(expected.boundary.status);
    expect(first.cellularBoundaryOperators.value?.boundary1.entries ?? null).toEqual(expected.boundary.d1);
    expect(first.cellularBoundaryOperators.value?.boundary2.entries ?? null).toEqual(expected.boundary.d2);
    if (expected.boundary.status === "exact") {
      expect(first.cellularBoundaryOperators.value?.chainCondition.holds).toBe(true);
    } else {
      expect(first.cellularBoundaryOperators).not.toHaveProperty("value");
    }

    expect(first.homology.status).toBe(expected.homology.status);
    expect(first.homology.value?.integer.groups.map((group) => group.notation) ?? null)
      .toEqual(expected.homology.integerGroups);
    expect(first.homology.value?.mod2.groups.map((group) => group.dimension) ?? null)
      .toEqual(expected.homology.mod2Dimensions);
    expect(first.homology.value?.integer.groups[1]?.torsionCoefficients ?? null)
      .toEqual(expected.homology.h1Torsion);
    if (expected.homology.status === "exact") expect(first.algebraicConsistency.value?.holds).toBe(true);

    expect(first.surfaceClassification.status).toBe(expected.classification.status);
    expect(first.surfaceClassification.value?.eligible ?? null).toBe(expected.classification.eligible);
    expect(first.surfaceClassification.value?.classification?.label ?? null).toBe(expected.classification.label);

    const mapping = fixture.sourceToView;
    const canonicalCell = canonicalCells(first, mapping.sourceCell.dimension)
      .find((cell) => cell.id === mapping.canonicalCellId);
    expect(canonicalCell, `${fixture.id}: missing canonical mapping target`).toBeDefined();
    expect(canonicalCell?.sourceRefs).toContainEqual({
      stage: "source",
      dimension: mapping.sourceCell.dimension,
      cellId: mapping.sourceCell.cellId,
    });

    if (fixture.realizationExample) {
      const realization = first.topologyObject.realizations.find((entry) =>
        entry.id.endsWith(fixture.realizationExample!.idSuffix)
      );
      expect(realization, `${fixture.id}: missing illustrative realization`).toMatchObject({
        kind: fixture.realizationExample.kind,
      });
    }
  });

  it("withholds every formal downstream result for the deliberately invalid complex", () => {
    const fixture = corpus.entries.find((entry) => entry.id === "invalid-dangling-complex")!;
    const result = build(fixture);

    expect(result.structuralValidation.status).toBe("failed");
    expect(result.cellularBoundaryOperators.status).toBe("unsupported");
    expect(result.cellularBoundaryOperators).not.toHaveProperty("value");
    expect(result.homology.status).toBe("unsupported");
    expect(result.homology).not.toHaveProperty("value");
    expect(result.surfaceClassification.status).toBe("unsupported");
    expect(result.surfaceClassification).not.toHaveProperty("value");
    expect(result.structuralValidation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "edge/dangling-endpoint", cellRef: { dimension: 1, cellId: "bad" } }),
      expect.objectContaining({ code: "attachment/dangling-edge", cellRef: { dimension: 2, cellId: "f" } }),
    ]));
  });
});
