import { createCurveDocument, type CurveDocument } from "./curveDocument";
import { createDocumentRelation } from "./documentRelations";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { resolveProjectAlgebraLocusInspection, type ProjectAlgebraLocusReturn } from
  "./projectAlgebraLocusReturn";
import type { SageAlgebraicLocusSample } from "./sageAlgebraicLocusSampling";
import { viewerSourceFromDocument } from "./viewerProvenance";

export type LocusCurveComponent = Readonly<{
  points: readonly (readonly number[])[]; closed: boolean;
}>;

/** Finds all simple 2D contour components; branching samples are refused. */
export const locusCurveComponents = (sample: SageAlgebraicLocusSample):
  readonly LocusCurveComponent[] => {
  if (sample.kind !== "curve" || sample.scene.domain.bounds.length !== 2 ||
      !sample.segments.length || sample.triangles.length || sample.points.length)
    throw new TypeError("Curve promotion requires a bounded two-dimensional contour sample.");
  if (sample.segments.length > 4096)
    throw new TypeError("The bounded contour exceeds the 4096-segment Curve limit.");
  const bounds = sample.scene.domain.bounds;
  const scale = bounds.map(item => (item.max - item.min) * 1e-9);
  const key = (p: readonly number[]) => {
    if (p.length !== 2 || p.some(value => !Number.isFinite(value)))
      throw new TypeError("The saved contour has an invalid endpoint.");
    return p.map((value, axis) => Math.round((value - bounds[axis].min) / scale[axis])).join(":");
  };
  const nodes = new Map<string, { point: readonly number[]; edges: number[] }>();
  const edges = sample.segments.map(([a, b], index) => {
    const first = key(a), second = key(b);
    if (first === second) throw new TypeError("The saved contour contains a collapsed segment.");
    for (const [id, point] of [[first, a], [second, b]] as const) {
      const node = nodes.get(id) ?? { point, edges: [] };
      node.edges.push(index); nodes.set(id, node);
    }
    return [first, second] as const;
  });
  if ([...nodes.values()].some(node => node.edges.length > 2))
    throw new TypeError("The saved contour branches; open its Geometry sample for inspection.");
  const remaining = new Set(edges.map((_, index) => index));
  const components: { key: string; value: LocusCurveComponent }[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as number;
    const pending = [edges[first][0]];
    const members = new Set<string>();
    const componentEdges = new Set<number>();
    while (pending.length) {
      const id = pending.pop()!;
      if (members.has(id)) continue;
      members.add(id);
      for (const index of nodes.get(id)!.edges) {
        componentEdges.add(index);
        const [a, b] = edges[index];
        pending.push(a === id ? b : a);
      }
    }
    const endpoints = [...members].filter(id => nodes.get(id)!.edges.length === 1).sort();
    if (endpoints.length !== 0 && endpoints.length !== 2)
      throw new TypeError("The saved contour has an incomplete component.");
    const start = endpoints[0] ?? [...members].sort()[0]!;
    const used = new Set<number>();
    const points: (readonly number[])[] = [nodes.get(start)!.point];
    let at = start;
    while (used.size < componentEdges.size) {
      const index = nodes.get(at)!.edges.find(edge => componentEdges.has(edge) && !used.has(edge));
      if (index === undefined) break;
      used.add(index); remaining.delete(index);
      at = edges[index][0] === at ? edges[index][1] : edges[index][0];
      points.push(nodes.get(at)!.point);
    }
    if (used.size !== componentEdges.size ||
        (endpoints.length === 0 && at !== start) ||
        (endpoints.length === 2 && at !== endpoints[1]))
      throw new TypeError("The saved contour component cannot be ordered.");
    components.push({ key: start, value: { points, closed: endpoints.length === 0 } });
  }
  return components.sort((a, b) => a.key.localeCompare(b.key)).map(item => item.value);
};

/** Compatibility helper for a single contour; it never selects a component implicitly. */
export const orderedLocusCurvePoints = (sample: SageAlgebraicLocusSample): LocusCurveComponent => {
  const components = locusCurveComponents(sample);
  if (components.length !== 1) throw new TypeError("The saved contour has disconnected components.");
  return components[0];
};

/** Promotes an already saved numerical sample, preserving its exact Geometry checkpoint as lineage. */
export const promoteSavedAlgebraLocusCurve = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn, componentIndex?: number): CurveDocument => {
  const inspection = resolveProjectAlgebraLocusInspection(project, choice);
  if (inspection.kind !== "sampled" || choice.sourceStatus !== "current")
    throw new TypeError("Choose a current saved bounded contour sample for Curve promotion.");
  const sample = inspection.sample;
  const components = locusCurveComponents(sample);
  if (componentIndex === undefined && components.length !== 1)
    throw new TypeError("Choose a contour component explicitly before Curve promotion.");
  const selectedIndex = componentIndex ?? 0;
  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= components.length)
    throw new RangeError("The selected contour component is unavailable.");
  const ordered = components[selectedIndex];
  const geometry = project.workspace.entries.find(item => item.expected.id === choice.documentId)?.checkpoint;
  if (geometry?.format !== "math3d.geometry-document")
    throw new TypeError("The saved sampled Geometry checkpoint is unavailable.");
  const source = {
    representation: "polyline" as const, dimension: 2 as const,
    domain: { parameter: "vertex", min: 0, max: ordered.points.length - 1,
      closed: ordered.closed, periodic: false },
    units: { position: "unitless", parameter: "unitless", angle: "rad" as const },
    orientation: { direction: "saved-segment-order" }, derivatives: {},
    definition: { familyId: "algebra.bounded-locus-contour", sourceIds: [geometry.identity.id],
      pointCount: ordered.points.length, points: ordered.points,
      settings: { sampleHash: sample.resultHash, sceneHash: sample.scene.sceneHash,
        algorithm: sample.algorithm, completeness: sample.completeness,
        sampleCount: sample.sampleCount, componentIndex: selectedIndex,
        componentCount: components.length, sourceRevision: geometry.identity.revision,
        sourceStructuralHash: geometry.identity.structuralHash } },
    dependencies: [{ sourceId: geometry.identity.id, revision: geometry.identity.revision,
      structuralHash: geometry.identity.structuralHash }],
  };
  return createCurveDocument({ source,
    stableKey: { operation: "algebra.locus-sample-curve", sourceId: geometry.identity.id,
      sampleHash: sample.resultHash, componentIndex: selectedIndex },
    metadata: { title: `Bounded locus contour ${selectedIndex + 1}/${components.length}: ${sample.scene.source.target.label}` } });
};

/** Requalifies the checkpoint and saves the Curve with exact return lineage. */
export const upsertProjectAlgebraLocusCurve = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn, componentIndex?: number):
  Readonly<{ project: Math3DProject; curve: CurveDocument }> => {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const curve = promoteSavedAlgebraLocusCurve(current, choice, componentIndex);
  const source = current.workspace.entries.find(item => item.expected.id === choice.documentId)!.checkpoint;
  const relation = createDocumentRelation({ kind: "promoted-from",
    sources: [viewerSourceFromDocument(source)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(curve) },
    operation: "algebra.locus-sample-curve",
    parameters: { sampleHash: choice.sampleHash, sceneHash: choice.sceneHash,
      componentIndex: componentIndex ?? 0,
      completeness: "bounded-sample" } });
  const workspace = createMixedWorkspaceDocument({ ...current.workspace,
    entries: [...current.workspace.entries.filter(item => item.expected.id !== curve.identity.id),
      { module: "curve", checkpoint: curve, expected: curve.identity, replay: null }],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] });
  return { project: replaceMath3DProjectWorkspace(current, workspace), curve };
};
