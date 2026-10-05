import { createGraph2DDocument } from "./graph2dDocument";
import { parseGraph2DExpression } from "./graph2dExpression";
import { analyzeGraph2DDerivative } from "./graph2dDerivatives";
import { promoteGraph2DToCurve, revolveGraph2DProfile } from "./graph2dInterop";
import { createGraph2DWorkspaceProject } from "./graph2dPersistence";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { createDocumentRelation } from "./documentRelations";
import { viewerSourceFromDocument } from "./viewerProvenance";
import { createMath3DProject, updateMath3DProjectMetadata, upsertMath3DProjectNote } from "./math3dProject";
import { createRepresentationTemplateWorkspace } from "./projectRepresentationTemplates";
import { createGeometryDocument, geometryObjectShape } from "./geometryDocument";
import { createProjectNote } from "./projectNotes";
import { structuralHash } from "./documentIdentity";

/** Built-in recipes create ordinary documents; there is no executable template input. */
export const MATH3D_PROJECT_TEMPLATES = Object.freeze([
  Object.freeze({ id: "catenary-study", version: 1, title: "Minimal Surface Study",
    description: "Explore a catenary, its Curve snapshot and its catenoid surface of revolution.",
    steps: Object.freeze(["Inspect y = (exp(x) + exp(-x))/2 on [-1.5, 1.5].",
      "Compare the Curve snapshot and the surface formed by rotation around the x axis.",
      "Open Notes for saved explanations linked to the Graph profile and derivative result.",
      "Inspect the local numerical derivative at x = 0; it is not a proof of minimality.",
      "Meshing, curvature and geodesics are follow-up steps; no engine or result is assumed."]) }),
  Object.freeze({ id: "derivative-study", version: 1, title: "Derivative Study",
    description: "Compare a parabola with its Curve snapshot and a recorded numerical derivative.",
    steps: Object.freeze(["Inspect y = x^2 on [-3, 3] and compare its Curve snapshot.",
      "Inspect the derivative at x = 1 with its source generation and numerical authority.",
      "Edit the Graph and compare the historical result's source freshness."]) }),
  Object.freeze({ id: "spline-surface-lab", version: 1, title: "Spline and Surface Lab",
    description: "Compare a weighted NURBS curve, a rational patch and an implicit sphere.",
    steps: Object.freeze(["Select a document, then expand Edit source definition.",
      "Change curve weights, patch controls or the sphere formula; inspect measured bounds.",
      "Undo and redo, save the project, then export or reopen its source history."]) }),
  Object.freeze({ id: "curve-construction-study", version: 1, title: "Curve Construction Study",
    description: "Explore a measured profile, its revolution and extrusion, and a Curve on a parameter chart.",
    steps: Object.freeze(["Compare the saved profile with its two constructed Surfaces.",
      "Change the revolution angle or extrusion depth through Edit source definition.",
      "Inspect Relations. Parent edits leave dependent definitions stale until explicitly updated."]) }),
  Object.freeze({ id: "scene-topology-study", version: 1, title: "Scene and Topology Study",
    description: "Inspect a midpoint and circle alongside a CW interval and simplicial triangle.",
    steps: Object.freeze(["Select Scene constructions and inspect the saved points and constructions.",
      "Compare the interval and triangle incidence counts; their layout is schematic.",
      "Edit a source, undo/redo, and save. No homology result or external engine is assumed."]) }),
  Object.freeze({ id: "geometry-note-pins", version: 1, title: "Geometry Notes and Pins",
    description: "Explore two saved Geometry objects with Project Notes placed on their surfaces.",
    steps: Object.freeze(["Open the Geometry document and choose Notes: All in the viewer.",
      "Open the Notes sidebar to read the two anchored observations.",
      "Move or rotate an object: its pin follows. Change its shape: the Note becomes stale and its pin disappears."]) }),
] as const);
export type Math3DProjectTemplateId = typeof MATH3D_PROJECT_TEMPLATES[number]["id"];

export const instantiateMath3DProjectTemplate = (id: string, instanceKey: string) => {
  const template = MATH3D_PROJECT_TEMPLATES.find((item) => item.id === id);
  if (!template) throw new TypeError("Unknown project template.");
  if (typeof instanceKey !== "string" || instanceKey.trim() !== instanceKey || !instanceKey.length || instanceKey.length > 160)
    throw new TypeError("A fresh template instance token of 1–160 characters is required.");
  if (template.id === "geometry-note-pins") {
    const position = (x: number) => ({ position: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
    const geometry = createGeometryDocument({ stableKey: ["project-template", id, template.version, instanceKey, "geometry"],
      metadata: { title: "Annotated solids" },
      source: { geometry: null, objects: [
        { id: "box", type: "box", params: { width: 2, height: 2, depth: 2 }, transform: position(-2) },
        { id: "sphere", type: "sphere", params: { radius: 1 }, transform: position(2) },
      ], surfaces: [], constructions: [], relationships: [], parameters: {}, extensions: {} },
      display: { objects: {
        box: { name: "Box", visible: true, material: { color: 0x5574b8, opacity: 1 } },
        sphere: { name: "Sphere", visible: true, material: { color: 0x16a085, opacity: 1 } },
      } },
    });
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "geometry", checkpoint: geometry, expected: geometry.identity, replay: null }],
      activeDocumentIds: [geometry.identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null });
    let project = createMath3DProject(workspace, { stableKey: ["project-template", id, template.version, instanceKey], title: template.title });
    project = updateMath3DProjectMetadata(project, { ...project.metadata, description: template.description,
      tags: ["starter", "geometry", "notes", `template-v${template.version}`], documents: { [geometry.identity.id]: { title: "Annotated solids" } } });
    for (const [objectId, title, body] of [
      ["box", "Box top", "This pin is on the box's top face. Move or rotate the box to see the anchor follow its transform."],
      ["sphere", "Sphere north pole", "This pin marks the sphere's north pole. Resize the sphere to see the Note become stale."],
    ] as const) {
      const shapeHash = geometryObjectShape(geometry, objectId);
      if (!shapeHash) throw new Error("Built-in Geometry object is missing.");
      project = upsertMath3DProjectNote(project, createProjectNote({ projectId: project.identity.id,
        stableKey: ["project-template", id, instanceKey, objectId], kind: "pinned", title, body,
        anchor: { kind: "object-local", source: viewerSourceFromDocument(geometry), objectId,
          localPosition: [0, 1, 0], shapeHash }, createdAt: 0 }));
    }
    return project;
  }
  if (template.id !== "catenary-study" && template.id !== "derivative-study") {
    const project = createMath3DProject(createRepresentationTemplateWorkspace(template.id, instanceKey), {
      stableKey: ["project-template", id, template.version, instanceKey], title: template.title,
    });
    return updateMath3DProjectMetadata(project, { ...project.metadata, description: template.description,
      tags: ["starter", id, `template-v${template.version}`], documents: Object.fromEntries(project.workspace.entries.map((entry) => {
        const document = entry.checkpoint;
        const title = "metadata" in document && "title" in document.metadata ? document.metadata.title : document.format === "math3d.topology-document" ? String(document.source.model.name) : document.format;
        return [entry.expected.id, { title }];
      })) });
  }
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
  let named = updateMath3DProjectMetadata(project, { ...project.metadata, description: template.description, tags: ["starter", id, `template-v${template.version}`],
    documents: { [graph.identity.id]: { title: graph.metadata.title }, [curve.document.identity.id]: { title: catenary ? "catenary-curve" : "parabola-curve" },
      ...(surface ? { [surface.document.identity.id]: { title: "catenoid" } } : {}) } });
  if (catenary) {
    named = upsertMath3DProjectNote(named, createProjectNote({ projectId: named.identity.id,
      stableKey: ["project-template", id, instanceKey, "graph-note"], kind: "text", title: "Catenary profile",
      body: "The saved Graph is the source of the Curve and Surface documents. Compare their relations before changing the profile.",
      anchor: { kind: "graph-selection", source: viewerSourceFromDocument(graph), objectId: "profile",
        objectHash: structuralHash(graph.source.objects[0]!) }, createdAt: 0 }));
    named = upsertMath3DProjectNote(named, createProjectNote({ projectId: named.identity.id,
      stableKey: ["project-template", id, instanceKey, "derivative-note"], kind: "result", title: "Recorded derivative",
      body: "This saved local derivative is numerical evidence at x = 0, not a proof that the Surface is minimal.",
      anchor: { kind: "result", source: derivative.provenance.source, resultId: derivative.resultId,
        resultHash: structuralHash(derivative) }, createdAt: 0 }));
  }
  return named;
};
