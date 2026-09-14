import type { CanonicalTopologyComplex, TopologyDiagnostic, TopologyObject, TopologyResult } from "./contracts";
import type { TopologyHomologyAnalysis } from "./homology";
import { createTopologyResult } from "./provenance";
import { smithNormalForm, type SmithNormalForm } from "./smithNormalForm";
import type { TopologyStructuralValidationReport } from "./structuralValidation";

export const TOPOLOGY_FUNDAMENTAL_GROUP_VERSION = "cw-fundamental-group-presentation@1" as const;

export type FundamentalGroupLetter = { generatorId: string; exponent: 1 | -1 };
export type FundamentalGroupGenerator = { id: string; symbol: string; canonicalEdgeId: string; canonicalEdgeName: string };
export type FundamentalGroupReductionStep = {
  kind: "tree-collapse" | "free-cancellation" | "cyclic-cancellation";
  before: string;
  after: string;
  explanation: string;
};
export type FundamentalGroupRelator = {
  id: string;
  canonicalFaceId: string;
  sourceBoundaryWord: string;
  afterTreeCollapse: FundamentalGroupLetter[];
  freelyReduced: FundamentalGroupLetter[];
  reducedWord: string;
  steps: FundamentalGroupReductionStep[];
};
export type FundamentalGroupAbelianization = {
  relationMatrix: {
    ring: "Z";
    encoding: "decimal-bigint";
    rowGeneratorIds: string[];
    columnRelatorIds: string[];
    entries: string[][];
  };
  smithNormalForm: SmithNormalForm;
  freeRank: number;
  torsionCoefficients: string[];
  notation: string;
  exactH1Notation: string;
  agreesWithExactH1: boolean;
};
export type FundamentalGroupPresentation = {
  model: "finite connected 2D CW presentation after maximal-tree collapse";
  baseVertexId: string;
  spanningTreeEdgeIds: string[];
  generators: FundamentalGroupGenerator[];
  relators: FundamentalGroupRelator[];
  presentation: string;
  abelianization: FundamentalGroupAbelianization;
};

class DisjointSet {
  private readonly parent = new Map<string, string>();
  add(id: string): void { if (!this.parent.has(id)) this.parent.set(id, id); }
  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (!this.parent.has(id)) this.parent.set(id, id);
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(left: string, right: string): boolean {
    const a = this.find(left);
    const b = this.find(right);
    if (a === b) return false;
    this.parent.set(b, a);
    return true;
  }
}

const formatLetters = (letters: FundamentalGroupLetter[], symbolById: Map<string, string>): string =>
  letters.map((letter) => `${symbolById.get(letter.generatorId) ?? letter.generatorId}${letter.exponent < 0 ? "^-1" : ""}`).join(" ") || "1";

const inversePair = (left: FundamentalGroupLetter | undefined, right: FundamentalGroupLetter | undefined): boolean =>
  !!left && !!right && left.generatorId === right.generatorId && left.exponent === -right.exponent;

const reduceRelator = (
  sourceWord: string,
  projected: FundamentalGroupLetter[],
  symbolById: Map<string, string>,
  removedTreeOccurrences: number
): { letters: FundamentalGroupLetter[]; steps: FundamentalGroupReductionStep[] } => {
  const steps: FundamentalGroupReductionStep[] = [{
    kind: "tree-collapse",
    before: sourceWord || "1",
    after: formatLetters(projected, symbolById),
    explanation: `${removedTreeOccurrences} spanning-tree occurrence(s) collapse to the identity.`,
  }];
  const stack: FundamentalGroupLetter[] = [];
  for (const letter of projected) {
    const previous = stack[stack.length - 1];
    if (inversePair(previous, letter)) {
      const before = formatLetters([...stack, letter], symbolById);
      stack.pop();
      steps.push({
        kind: "free-cancellation",
        before,
        after: formatLetters(stack, symbolById),
        explanation: "Removed an adjacent generator/inverse pair.",
      });
    } else stack.push(letter);
  }
  while (stack.length > 1 && inversePair(stack[0], stack[stack.length - 1])) {
    const before = formatLetters(stack, symbolById);
    stack.shift();
    stack.pop();
    steps.push({
      kind: "cyclic-cancellation",
      before,
      after: formatLetters(stack, symbolById),
      explanation: "Removed an inverse pair at the cyclic ends of the relator.",
    });
  }
  return { letters: stack, steps };
};

const abelianNotation = (freeRank: number, torsion: bigint[]): string => {
  const terms: string[] = [];
  if (freeRank === 1) terms.push("Z");
  if (freeRank > 1) terms.push(`Z^${freeRank}`);
  torsion.forEach((order) => terms.push(`Z/${order.toString()}Z`));
  return terms.join(" ⊕ ") || "0";
};

const spanningTree = (complex: CanonicalTopologyComplex): { treeEdgeIds: string[]; nonTreeEdgeIds: string[] } => {
  const dsu = new DisjointSet();
  complex.vertices.map((vertex) => vertex.id).sort((a, b) => a.localeCompare(b)).forEach((id) => dsu.add(id));
  const treeEdgeIds: string[] = [];
  const nonTreeEdgeIds: string[] = [];
  [...complex.edges].sort((a, b) => a.id.localeCompare(b.id)).forEach((edge) => {
    if (edge.endpoints[0] !== edge.endpoints[1] && dsu.union(edge.endpoints[0], edge.endpoints[1])) treeEdgeIds.push(edge.id);
    else nonTreeEdgeIds.push(edge.id);
  });
  return { treeEdgeIds, nonTreeEdgeIds };
};

export const deriveFundamentalGroupPresentation = (
  object: TopologyObject,
  structuralValidation: TopologyResult<TopologyStructuralValidationReport>,
  homology: TopologyResult<TopologyHomologyAnalysis>
): TopologyResult<FundamentalGroupPresentation> => {
  const diagnostics: TopologyDiagnostic[] = [];
  if (structuralValidation.status === "failed" || !structuralValidation.value?.canComputeCellularAlgebra || structuralValidation.value.connectedComponents !== 1 || object.canonical.vertices.length === 0) {
    return createTopologyResult({
      status: "unsupported",
      method: "maximal-tree collapse and cellular attaching-word presentation",
      assumptions: ["finite connected canonical 2D CW complex", "closed contiguous 2-cell attachments"],
      sourceRevision: object.provenance.source.revision,
      algorithmVersion: TOPOLOGY_FUNDAMENTAL_GROUP_VERSION,
      diagnostics: [{ code: "fundamental-group/unsupported-source", severity: "error", message: "A connected structurally valid canonical 2-complex is required for a single-basepoint presentation." }],
    });
  }

  const { treeEdgeIds, nonTreeEdgeIds } = spanningTree(object.canonical);
  const treeSet = new Set(treeEdgeIds);
  const generatorByEdge = new Map<string, FundamentalGroupGenerator>();
  const generators = nonTreeEdgeIds.map((edgeId, index) => {
    const edge = object.canonical.edges.find((candidate) => candidate.id === edgeId)!;
    const generator = { id: `pi1-g${index + 1}`, symbol: `g${index + 1}`, canonicalEdgeId: edge.id, canonicalEdgeName: edge.name };
    generatorByEdge.set(edgeId, generator);
    return generator;
  });
  const symbolById = new Map(generators.map((generator) => [generator.id, generator.symbol]));
  const relators = [...object.canonical.faces].sort((a, b) => a.id.localeCompare(b.id)).map((face, index): FundamentalGroupRelator => {
    const projected = face.attachment.flatMap((entry) => {
      if (treeSet.has(entry.edgeId)) return [];
      const generator = generatorByEdge.get(entry.edgeId);
      return generator ? [{ generatorId: generator.id, exponent: entry.direction } satisfies FundamentalGroupLetter] : [];
    });
    const reduced = reduceRelator(face.boundaryWord, projected, symbolById, face.attachment.length - projected.length);
    return {
      id: `pi1-r${index + 1}`,
      canonicalFaceId: face.id,
      sourceBoundaryWord: face.boundaryWord,
      afterTreeCollapse: projected,
      freelyReduced: reduced.letters,
      reducedWord: formatLetters(reduced.letters, symbolById),
      steps: reduced.steps,
    };
  });
  const relationMatrix = generators.map((generator) => relators.map((relator) =>
    relator.freelyReduced.filter((letter) => letter.generatorId === generator.id).reduce((sum, letter) => sum + BigInt(letter.exponent), 0n)
  ));
  const smith = smithNormalForm(relationMatrix, relators.length);
  const diagonal = smith.diagonal.map(BigInt).filter((value) => value !== 0n).map((value) => value < 0n ? -value : value);
  const torsion = diagonal.filter((value) => value > 1n);
  const freeRank = generators.length - smith.rank;
  const notation = abelianNotation(freeRank, torsion);
  const exactH1 = homology.value?.integer.groups[1];
  const expectedTorsion = [...(exactH1?.torsionCoefficients ?? [])].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const actualTorsion = [...torsion].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const agreesWithExactH1 = homology.status === "exact" && !!exactH1 && exactH1.bettiNumber === freeRank && expectedTorsion.length === actualTorsion.length && expectedTorsion.every((value, index) => value === actualTorsion[index]);
  if (!agreesWithExactH1) diagnostics.push({ code: "fundamental-group/abelianization-h1-mismatch", severity: "error", message: `Presentation abelianization ${notation} does not agree with exact H1 ${exactH1?.notation ?? "unavailable"}.` });
  const relatorWords = relators.map((relator) => relator.reducedWord).filter((word) => word !== "1");
  return createTopologyResult({
    status: agreesWithExactH1 ? "exact" : "failed",
    method: "maximal-tree collapse and cellular attaching-word presentation",
    assumptions: ["finite connected canonical 2D CW complex", "one generator per non-tree 1-cell", "one relator per 2-cell"],
    sourceRevision: object.provenance.source.revision,
    algorithmVersion: TOPOLOGY_FUNDAMENTAL_GROUP_VERSION,
    diagnostics,
    value: {
      model: "finite connected 2D CW presentation after maximal-tree collapse",
      baseVertexId: [...object.canonical.vertices].sort((a, b) => a.id.localeCompare(b.id))[0]!.id,
      spanningTreeEdgeIds: treeEdgeIds,
      generators,
      relators,
      presentation: `⟨${generators.map((entry) => entry.symbol).join(", ")} | ${relatorWords.join(", ")}⟩`,
      abelianization: {
        relationMatrix: { ring: "Z", encoding: "decimal-bigint", rowGeneratorIds: generators.map((entry) => entry.id), columnRelatorIds: relators.map((entry) => entry.id), entries: relationMatrix.map((row) => row.map((value) => value.toString())) },
        smithNormalForm: smith,
        freeRank,
        torsionCoefficients: torsion.map((value) => value.toString()),
        notation,
        exactH1Notation: exactH1?.notation ?? "unavailable",
        agreesWithExactH1,
      },
    },
  });
};
