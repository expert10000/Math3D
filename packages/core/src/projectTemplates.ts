import { createGraph2DDocument } from "./graph2dDocument";
import { parseGraph2DExpression } from "./graph2dExpression";
import { analyzeGraph2DDerivative } from "./graph2dDerivatives";
import { promoteGraph2DToCurve, revolveGraph2DProfile } from "./graph2dInterop";
import { createGraph2DWorkspaceProject } from "./graph2dPersistence";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createDocumentRelation } from "./documentRelations";
import { viewerSourceFromDocument } from "./viewerProvenance";
import { createMath3DProject, updateMath3DProjectMetadata } from "./math3dProject";

/** Built-in recipes create ordinary documents; there is no executable template input. */
export const MATH3D_PROJECT_TEMPLATES = Object.freeze([
  Object.freeze({ id: "catenary-study", version: 1, title: "Minimal Surface Study",
    description: "Explore a catenary, its Curve snapshot and its catenoid surface of revolution.",
    steps: Object.freeze(["Inspect y = (exp(x) + exp(-x))/2 on [-1.5, 1.5].",
      "Compare the Curve snapshot and the surface formed by rotation around the x axis.",
      "Inspect the local numerical derivative at x = 0; it is not a proof of minimality.",
      "Meshing, curvature and geodesics are follow-up steps; no engine or result is assumed."]) }),
  Object.freeze({ id: "derivative-study", version: 1, title: "Derivative Study",
    description: "Compare a parabola with its Curve snapshot and a recorded numerical derivative.",
    steps: Object.freeze(["Inspect y = x^2 on [-3, 3] and compare its Curve snapshot.",
      "Inspect the derivative at x = 1 with its source generation and numerical authority.",
      "Edit the Graph and compare the historical result's source freshness."]) }),
] as const);
export type Math3DProjectTemplateId = typeof MATH3D_PROJECT_TEMPLATES[number]["id"];

export const instantiateMath3DProjectTemplate = (id: string, instanceKey: string) => {
  const template = MATH3D_PROJECT_TEMPLATES.find((item) => item.id === id);
  if (!template) throw new TypeError("Unknown project template.");
  if (typeof instanceKey !== "string" || instanceKey.trim() !== instanceKey || !instanceKey.length || instanceKey.length > 160)
    throw new TypeError("A fresh template instance token of 1–160 characters is required.");
  const catenary = template.id === "catenary-study", expression = catenary ? "(exp(x) + exp(-x))/2" : "x^2";
  const parsed = parseGraph2DExpression(expression);
  if (!parsed.ok) throw new Error("Invalid built-in project expression.");
  const graph = createGraph2DDocument({ stableKey: ["project-template", id, template.version, instanceKey],
    title: catenary ? "catenary-profile" : "parabola", source: { objects: [{ id: "profile", label: catenary ? "catenary" : "parabola",
      kind: "explicit-cartesian", expression: { source: expression, variable: "x", ast: parsed.ast },
      domain: { min: catenary ? -1.5 : -3, max: catenary ? 1.5 : 3, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
  const curve = promoteGraph2DToCurve(graph, "profile"), surface = catenary ? revolveGraph2DProfile(graph, "profile", { axis: "x", orientation: "positive" }) : null;
  const derivative = analyzeGraph2DDerivative({ document: graph, objectId: "profile", x: catenary ? 0 : 1, order: 1, tolerance: 1e-5 }).publication;
  const analysisRelation = createDocumentRelation({ kind: "analysis-of", sources: [viewerSourceFromDocument(graph)], sourceOrder: "ordered",
    target: { type: "result", resultId: derivative.resultId, resultType: derivative.provenance.operation.type }, operation: "project-template.derivative",
    parameters: { objectId: "profile", x: catenary ? 0 : 1, order: 1, tolerance: 1e-5 } });
  const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(graph), entries: [
    ...createGraph2DWorkspaceProject(graph).entries, { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null },
    ...(surface ? [{ module: "surface" as const, checkpoint: surface.document, expected: surface.document.identity, replay: null }] : [])],
    results: [derivative], relations: [curve.relation, ...(surface ? [surface.relation] : []), analysisRelation] });
  const project = createMath3DProject(workspace, { stableKey: ["project-template", id, template.version, instanceKey], title: template.title });
  return updateMath3DProjectMetadata(project, { ...project.metadata, description: template.description, tags: ["starter", id, `template-v${template.version}`],
    documents: { [graph.identity.id]: { title: graph.metadata.title }, [curve.document.identity.id]: { title: catenary ? "catenary-curve" : "parabola-curve" },
      ...(surface ? { [surface.document.identity.id]: { title: "catenoid" } } : {}) } });
};
