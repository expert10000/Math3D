import { createCurveDocument, type CurveDocument } from "./curveDocument";
import { createDocumentRelation } from "./documentRelations";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { parseMath3DProject, replaceMath3DProjectWorkspace, serializeMath3DProject,
  type Math3DProject } from "./math3dProject";
import { resolveProjectAlgebraLocusInspection, type ProjectAlgebraLocusReturn } from
  "./projectAlgebraLocusReturn";
import type { SageAlgebraicLocusSample } from "./sageAlgebraicLocusSampling";
import { viewerSourceFromDocument } from "./viewerProvenance";

/** Orders every edge of one simple 2D contour; never selects or drops a component. */
export const orderedLocusCurvePoints = (sample: SageAlgebraicLocusSample):
  Readonly<{ points: readonly (readonly number[])[]; closed: boolean }> => {
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
  const endpoints = [...nodes.entries()].filter(([, node]) => node.edges.length === 1).map(([id]) => id);
  if (endpoints.length !== 0 && endpoints.length !== 2)
    throw new TypeError("The saved contour has disconnected components.");
  const start = endpoints[0] ?? [...nodes.keys()].sort()[0]!;
  const visited = new Set<number>();
  const points: (readonly number[])[] = [nodes.get(start)!.point];
  let at = start;
  while (visited.size < edges.length) {
    const edge = nodes.get(at)!.edges.find(index => !visited.has(index));
    if (edge === undefined) break;
    visited.add(edge);
    at = edges[edge][0] === at ? edges[edge][1] : edges[edge][0];
    points.push(nodes.get(at)!.point);
  }
  if (visited.size !== edges.length || (endpoints.length === 0 && at !== start) ||
      (endpoints.length === 2 && at !== endpoints[1]))
    throw new TypeError("The saved contour has disconnected components.");
  return { points, closed: endpoints.length === 0 };
};

/** Promotes an already saved numerical sample, preserving its exact Geometry checkpoint as lineage. */
export const promoteSavedAlgebraLocusCurve = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn): CurveDocument => {
  const inspection = resolveProjectAlgebraLocusInspection(project, choice);
  if (inspection.kind !== "sampled" || choice.sourceStatus !== "current")
    throw new TypeError("Choose a current saved bounded contour sample for Curve promotion.");
  const sample = inspection.sample;
  const ordered = orderedLocusCurvePoints(sample);
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
        sampleCount: sample.sampleCount, sourceRevision: geometry.identity.revision,
        sourceStructuralHash: geometry.identity.structuralHash } },
    dependencies: [{ sourceId: geometry.identity.id, revision: geometry.identity.revision,
      structuralHash: geometry.identity.structuralHash }],
  };
  return createCurveDocument({ source,
    stableKey: { operation: "algebra.locus-sample-curve", sourceId: geometry.identity.id,
      sampleHash: sample.resultHash },
    metadata: { title: `Bounded locus contour: ${sample.scene.source.target.label}` } });
};

/** Requalifies the checkpoint and saves the Curve with exact return lineage. */
export const upsertProjectAlgebraLocusCurve = (project: Math3DProject,
  choice: ProjectAlgebraLocusReturn): Readonly<{ project: Math3DProject; curve: CurveDocument }> => {
  const current = parseMath3DProject(serializeMath3DProject(project));
  const curve = promoteSavedAlgebraLocusCurve(current, choice);
  const source = current.workspace.entries.find(item => item.expected.id === choice.documentId)!.checkpoint;
  const relation = createDocumentRelation({ kind: "promoted-from",
    sources: [viewerSourceFromDocument(source)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(curve) },
    operation: "algebra.locus-sample-curve",
    parameters: { sampleHash: choice.sampleHash, sceneHash: choice.sceneHash,
      completeness: "bounded-sample" } });
  const workspace = createMixedWorkspaceDocument({ ...current.workspace,
    entries: [...current.workspace.entries.filter(item => item.expected.id !== curve.identity.id),
      { module: "curve", checkpoint: curve, expected: curve.identity, replay: null }],
    relations: [...current.workspace.relations.filter(item => item.relationId !== relation.relationId), relation] });
  return { project: replaceMath3DProjectWorkspace(current, workspace), curve };
};
