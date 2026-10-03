import { createCurveDocument, createMath3DProject, createMixedWorkspaceDocument, exportProjectPackage, updateMath3DProjectMetadata } from "@math3d/core";
import { mobileMixedProjectFixture } from "./mobileProjects";

/** All module checkpoints/resources plus an independent literal 3D Curve. */
export const mobileCurveProjectFixture = () => {
  const source = mobileMixedProjectFixture();
  const curve = createCurveDocument({ stableKey: "prj27-literal-helix", metadata: { title: "Literal helix" }, source: {
    representation: "parametric", dimension: 3, domain: { parameter: "t", min: 0, max: 6.28, closed: false, periodic: false },
    units: { position: "unitless", parameter: "unitless", angle: "rad" }, orientation: {}, derivatives: {}, dependencies: [],
    definition: { familyId: "literal-helix", expressions: { x: "cos(t)", y: "sin(t)", z: "t/4" } } } });
  const entries = [...source.project.workspace.entries, { module: "curve" as const, checkpoint: curve, expected: curve.identity, replay: null }];
  // Public fixture bytes must not depend on the machine's probe execution time.
  const results = source.project.workspace.results.map(result => result.provenance.engine.name === "math3d-core"
    ? { ...result, provenance: { ...result.provenance, elapsedMs: 0 } } : result);
  let project = createMath3DProject(createMixedWorkspaceDocument({ ...source.project.workspace, entries, results,
    activeDocumentIds: [...source.project.workspace.activeDocumentIds, curve.identity.id] }),
    { title: "PRJ27 Graph Curve Study", stableKey: "prj25-27-samsung-acceptance-v1" });
  project = updateMath3DProjectMetadata(project, { ...source.project.metadata, title: "PRJ27 Graph Curve Study", tags: ["acceptance", "prj27"],
    documents: { ...source.project.metadata.documents, [curve.identity.id]: { title: "Literal helix" } } });
  const relation = project.workspace.relations.find(item => item.operation === "graph2d.promote-curve" && item.sources[0]?.documentId === source.graphIds[1])!;
  return { project, resources: source.resources, raw: exportProjectPackage(project, source.resources), graphIds: source.graphIds,
    helixId: curve.identity.id, refreshRelationId: relation.relationId };
};
