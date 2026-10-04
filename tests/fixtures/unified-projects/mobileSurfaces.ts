import { createSurfaceDocument, createMath3DProject, createMixedWorkspaceDocument, createDocumentRelation, viewerSourceFromDocument,
  extrudeGraph2DProfile, revolveGraph2DProfile, exportProjectPackage, updateMath3DProjectMetadata } from "@math3d/core";
import { mobileCurveProjectFixture } from "./mobileCurves";

/** Complete public resource package plus independent Surface and saved construction recipes. */
export const mobileSurfaceProjectFixture = () => {
  const original = mobileCurveProjectFixture(), graph = original.project.workspace.entries.find(entry => entry.expected.id === original.graphIds[1])!.checkpoint;
  const curve = original.project.workspace.entries.find(entry => entry.expected.id === original.helixId)!.checkpoint;
  if (graph.format !== "math3d.graph2d-document" || curve.format !== "math3d.curve-document") throw new Error("Missing workflow sources");
  const surface = createSurfaceDocument({ stableKey: "prj30-literal-saddle", metadata: { title: "Literal saddle" }, source: {
    representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
    units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
    definition: { familyId: "literal-saddle", expressions: { x: "u", y: "v", z: "u*u-v*v" } } } });
  const graphExtrusion = extrudeGraph2DProfile(graph, graph.source.objects[0]!.id, { direction: [0, 0, 1], length: 2, caps: "none" });
  const graphRevolution = revolveGraph2DProfile(graph, graph.source.objects[0]!.id, { axis: "x", orientation: "positive" });
  const curveConstructions = (["extrusion", "revolution"] as const).map(familyId => {
    const document = createSurfaceDocument({ stableKey: `prj30-helix-${familyId}`, metadata: { title: `Helix ${familyId}` }, source: {
      representation: "constructed", domain: { kind: "curve-construction", u: [0, 1], v: [0, 1] }, units: { length: "unitless" }, orientation: {}, branchPolicy: null,
      definition: { familyId, sourceIds: [curve.identity.id] }, parameters: { sourceGenerations: [viewerSourceFromDocument(curve)], depth: 2, angle: 3.14, axis: "y", uSegments: 32, vSegments: 16 } } });
    const relation = createDocumentRelation({ kind: "generated-by", sources: [viewerSourceFromDocument(curve)], sourceOrder: "ordered",
      target: { type: "document", generation: viewerSourceFromDocument(document) }, operation: `curve.construct.${familyId}`, parameters: document.source.parameters });
    return { document, relation };
  });
  const generated = [graphExtrusion, graphRevolution, ...curveConstructions];
  const entries = [...original.project.workspace.entries, ...[surface, ...generated.map(item => item.document)].map(document =>
    ({ module: "surface" as const, checkpoint: document, expected: document.identity, replay: null }))];
  let project = createMath3DProject(createMixedWorkspaceDocument({ ...original.project.workspace, entries,
    relations: [...original.project.workspace.relations, ...generated.map(item => item.relation)], activeDocumentIds: entries.map(entry => entry.expected.id) }),
    { stableKey: "prj28-30-samsung-acceptance-v1", title: "PRJ30 Graph Curve Surface Study" });
  project = updateMath3DProjectMetadata(project, { ...original.project.metadata, title: "PRJ30 Graph Curve Surface Study", tags: ["acceptance", "prj30"],
    documents: { ...original.project.metadata.documents, [surface.identity.id]: { title: surface.metadata.title },
      ...Object.fromEntries(generated.map(item => [item.document.identity.id, { title: item.document.metadata.title }])) } });
  return { project, resources: original.resources, raw: exportProjectPackage(project, original.resources), graphIds: original.graphIds,
    helixId: original.helixId, surfaceId: surface.identity.id, graphSurfaceRelationIds: [graphExtrusion.relation.relationId, graphRevolution.relation.relationId],
    curveSurfaceRelationIds: curveConstructions.map(item => item.relation.relationId) };
};
