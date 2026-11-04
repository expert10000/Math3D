import { analyzeBiquadraticExtensionFromDefinition } from "./biquadraticFieldTower";
import { type AlgebraObjectRecord, type AlgebraObjectRef } from "./algebraObjects";
import { type Math3DProject } from "./math3dProject";
import { inspectProjectAlgebraFreshness, validateProjectAlgebraRegistry } from "./projectAlgebraRegistry";

export type ProjectFieldTowerNode = Readonly<{
  ref: AlgebraObjectRef; label: string; kind: "rational-field" | "number-field" | "field-extension";
  depth: 0 | 1 | 2; absoluteDegree: 1 | 2 | 4; status: "current" | "historical" | "stale" | "archived";
}>;
export type ProjectFieldTowerEdge = Readonly<{
  base: AlgebraObjectRef; extension: AlgebraObjectRef; relativeDegree: 2; absoluteDegree: 2 | 4;
  embedding: string; basisCoordinates: readonly string[]; relationChecks: readonly string[];
  degreeProduct: string; composedInclusion?: Readonly<{ source: AlgebraObjectRef; embedding: string }>;
  verifiedBy: "exact construction" | "exact construction and Sage";
}>;
export type ProjectFieldTower = Readonly<{
  nodes: readonly ProjectFieldTowerNode[]; edges: readonly ProjectFieldTowerEdge[];
}>;

const key = (ref: AlgebraObjectRef): string => `${ref.objectId}@${ref.revision}`;

/** All active field paths plus their exact pinned historical parents; no label-based inclusions. */
export const buildProjectFieldTower = (project: Math3DProject): ProjectFieldTower => {
  if (!project.algebraObjects?.length) return { nodes: [], edges: [] };
  const entries = validateProjectAlgebraRegistry(project.algebraObjects);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const freshness = new Map(inspectProjectAlgebraFreshness(project).map((item) => [item.objectId, item.status]));
  const nodes = new Map<string, ProjectFieldTowerNode>();
  const edges = new Map<string, ProjectFieldTowerEdge>();
  const recordOf = (ref: AlgebraObjectRef): AlgebraObjectRecord => {
    const record = byId.get(ref.objectId)?.revisions[ref.revision - 1];
    if (!record) throw new TypeError(`Field tower parent ${key(ref)} is missing.`);
    return record;
  };
  const visit = (ref: AlgebraObjectRef): void => {
    if (nodes.has(key(ref))) return;
    const entry = byId.get(ref.objectId)!;
    const record = recordOf(ref), definition = record.definition;
    if (definition.kind !== "rational-field" && definition.kind !== "number-field" &&
        definition.kind !== "field-extension") return;
    const depth = definition.kind === "rational-field" ? 0 : definition.kind === "number-field" ? 1 : 2;
    const absoluteDegree = definition.kind === "rational-field" ? 1 : definition.kind === "number-field" ? 2 : 4;
    const status = entry.archived ? "archived" : ref.revision !== entry.revisions.length ? "historical"
      : freshness.get(entry.id) === "stale" ? "stale" : "current";
    nodes.set(key(ref), { ref, label: record.label, kind: definition.kind, depth, absoluteDegree, status });
    if (definition.kind === "rational-field") return;
    const baseRef = definition.baseField;
    visit(baseRef);
    const base = recordOf(baseRef);
    if (definition.kind === "number-field") {
      if (base.definition.kind !== "rational-field") throw new TypeError("Field tower has a non-QQ quadratic base.");
      const checked = (project.algebraEvidence ?? []).some((item) => item.request.operation === "sage.algebra.reconstruct" &&
        item.request.target.objectId === record.id && item.request.target.revision === record.revision);
      edges.set(key(ref), { base: baseRef, extension: ref, relativeDegree: 2, absoluteDegree: 2,
        embedding: "q ↦ q", basisCoordinates: ["1", "0"],
        relationChecks: ["QQ embeds as the constant subfield", `1 × 2 = 2`], degreeProduct: "1 × 2 = 2",
        verifiedBy: checked ? "exact construction and Sage" : "exact construction" });
    } else {
      if (base.definition.kind !== "number-field") throw new TypeError("Field tower has no quadratic parent.");
      const facts = analyzeBiquadraticExtensionFromDefinition(base.definition.definingPolynomial,
        base.definition.generator, definition.radicand, definition.generator);
      const checked = (project.algebraEvidence ?? []).some((item) => item.request.operation === "sage.algebra.reconstruct" &&
        item.request.target.objectId === record.id && item.request.target.revision === record.revision);
      edges.set(key(ref), { base: baseRef, extension: ref, relativeDegree: 2, absoluteDegree: 4,
        embedding: `${base.definition.generator} ↦ ${base.definition.generator}`,
        basisCoordinates: facts.baseGeneratorImage,
        relationChecks: [facts.baseRelation, facts.extensionRelation],
        degreeProduct: "2 × 2 = 4",
        composedInclusion: { source: base.definition.baseField, embedding: "q ↦ q" },
        verifiedBy: checked ? "exact construction and Sage" : "exact construction" });
    }
  };
  for (const entry of entries) if (!entry.archived) {
    const latest = entry.revisions.at(-1)!;
    if (["rational-field", "number-field", "field-extension"].includes(latest.kind))
      visit({ objectId: entry.id, revision: latest.revision });
  }
  return Object.freeze({ nodes: Object.freeze([...nodes.values()].sort((a, b) =>
    a.depth - b.depth || a.label.localeCompare(b.label) || key(a.ref).localeCompare(key(b.ref)))),
    edges: Object.freeze([...edges.values()].sort((a, b) =>
      (nodes.get(key(a.extension))!.depth - nodes.get(key(b.extension))!.depth) ||
      key(a.extension).localeCompare(key(b.extension)))) });
};
