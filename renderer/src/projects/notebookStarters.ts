import { createDocumentRelation, createGeometryDocument, createGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject, createMixedWorkspaceDocument, createProjectNote, createVolumeDocument, extrudeGraph2DProfile, instantiateMath3DProjectTemplate, parseGraph2DExpression, replaceMath3DProjectWorkspace, structuralHash, updateMath3DProjectMetadata, updateProjectNote, upsertMath3DProjectNote, upsertMath3DProjectWorkbook, viewerSourceFromDocument } from "@math3d/core";
import { bindWorkbookNamedParameter, createDefaultWorkbook, createNotebookReference } from "@math3d/workbook";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { createSavedSurfaceMesh } from "./savedSurfaceMesh";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { captureProjectResources } from "./projectResources";
import { prepareProjectWorkbook } from "./projectWorkbookBinding";
import { instantiateMeshComparisonStarter } from "./meshComparisonStarter";
import { CATENOID_WAIST_OPERATION, recordCatenoidWaistComparison } from "./catenoidCurvatureJourney";

export const NOTEBOOK_STARTERS = [
  { id: "catenoid-evidence", title: "Catenoid Evidence Notebook", description: "A saved catenoid Mesh, computed curvature, live Note values and a bounded scalar claim." },
  { id: "edge-path-evidence", title: "Edge Path Evidence Notebook", description: "A computed Mesh edge path with exact citations, a length check and a bound Workbook grid parameter." },
  { id: "graph-derivative-notebook", title: "Graph Derivative Investigation", description: "Compare a parabola, its Curve snapshot and a recorded numerical derivative in a Project Workbook." },
  { id: "curve-construction-notebook", title: "Curve Construction Investigation", description: "Follow a measured Curve into revolution and extrusion Surfaces with exact source references." },
  { id: "ripple-wave-study", title: "Ripple Wave Study", description: "A Graph wave profile, its native Surface, a saved Mesh snapshot, Geometry sample markers and a research Workbook with exact source links." },
  { id: "mesh-comparison-study", title: "Saved Mesh Comparison Study", description: "Three retained Mesh generations with recorded quality results, ready for A/B comparison and a verified trend." },
  { id: "mesh-comparison-review", title: "Saved Mesh Comparison Review", description: "Three retained Mesh generations, three exact saved A/B pairs, and two authored observations for testing the verified comparison index." },
  { id: "mesh-subdivision-study", title: "Retained Mesh Generation Study", description: "An octahedron before subdivision, after subdivision, and after a transform, with exact source sidecars." },
  { id: "mesh-curvature-study", title: "Saved Mesh Curvature Study", description: "Three saved discrete-curvature results from a closed triangulated sphere at different scales." },
  { id: "mesh-trend-gap-study", title: "Mesh Trend With Missing Result", description: "A three-generation Mesh trend whose middle generation has no saved quality result." },
  { id: "mesh-geometry-probe", title: "Mesh and Geometry Coordinate Probe", description: "A saved Mesh and Geometry pair with matching declared metre coordinates for source-backed probe observations." },
  { id: "surface-mesh-probe", title: "Surface and Mesh Coordinate Probe", description: "A saved Surface and Mesh pair with matching declared metre coordinates for a bounded cross-model coordinate marker." },
  { id: "surface-geometry-probe", title: "Surface and Geometry Coordinate Probe", description: "A saved Surface and Geometry pair with matching declared metre coordinates for exact source-backed observations." },
  { id: "volume-isosurface-study", title: "Volume to Mesh Isosurface Study", description: "Extract an isosurface from a saved analytic Volume, retain its Mesh, and cite the exact result in a Project Study and Workbook." },
] as const;
export type NotebookStarterId = typeof NOTEBOOK_STARTERS[number]["id"];

const waveHeight = (x: number) => Math.sin(2 * x) / (1 + 0.1 * x * x);

/** Adds exact research references without replacing an existing Ripple Project's documents or Mesh bytes. */
export const addRippleWaveResearch = (source: ReturnType<typeof createMath3DProject>) => {
  if (!source.metadata.tags?.includes("ripple-wave-study")) throw new TypeError("This is not a Ripple Wave Study Project.");
  if (source.workbooks?.some(item => item.title === "Ripple Wave Research")) return null;
  const entries = (["graph2d", "surface", "mesh", "geometry"] as const).map(module => {
    const entry = source.workspace.entries.find(item => item.module === module);
    if (!entry) throw new TypeError(`Ripple Wave ${module} document is unavailable.`);
    return entry;
  });
  let project = source;
  for (const [index, title, body] of [
    [0, "Wave profile source", "The Graph records the wave formula and domain used to construct the Surface. A later Graph edit does not automatically update the saved Surface."],
    [2, "Saved mesh snapshot", "This Mesh captures one generation of the Surface. Inspect Project Relations for freshness before comparing it with an edited Surface; no curvature or accuracy claim is recorded here."],
  ] as const) {
    const note = createProjectNote({ projectId: project.identity.id, stableKey: ["ripple-wave-study", project.identity.id, title],
      kind: "text", title, body, anchor: { kind: "document", source: viewerSourceFromDocument({ identity: entries[index]!.expected }) }, createdAt: 0 });
    project = upsertMath3DProjectNote(project, note);
  }
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `ripple-wave-research-${project.identity.id}-${++sequence}`);
  workbook.title = "Ripple Wave Research";
  workbook.stages[0]!.blocks[0]!.text = "Follow the saved Graph → Surface → Mesh chain, then inspect the Geometry sample markers. These are exact Project document references; check Relations after editing a source.";
  workbook.stages[0]!.blocks[1]!.formula = "f(x)=\\frac{\\sin(2x)}{1+0.1x^2}";
  workbook.stages[1]!.blocks = entries.map((entry, index) => ({ id: `ripple-wave-source-${index}`, type: "reference" as const,
    title: project.metadata.documents?.[entry.expected.id]?.title ?? entry.module,
    notebookReference: createNotebookReference(project, "document", entry.expected.id) }));
  workbook.stages[3]!.blocks = [{ id: "ripple-wave-interpretation", type: "text", title: "Interpret the snapshots",
    text: "The Surface is derived from the recorded Graph generation. The Mesh and sample markers derive from the recorded Surface generation. Freshness is a provenance check, not a numerical proof about the wave." }];
  const bound = prepareProjectWorkbook(project, workbook, project.identity.id);
  project = upsertMath3DProjectWorkbook(project, bound.reference);
  return { project, workbook: { id: bound.reference.id, bytes: bound.bytes } };
};

const instantiateRippleWaveStarter = (token: string) => {
  const id = "ripple-wave-study", recipe = NOTEBOOK_STARTERS.find(item => item.id === id)!;
  const expression = "sin(2*x)/(1+0.1*x^2)", parsed = parseGraph2DExpression(expression);
  if (!parsed.ok) throw new TypeError("Built-in Ripple Wave profile is invalid.");
  const graph = createGraph2DDocument({ stableKey: [id, token, "graph"], title: "wave-profile",
    source: { objects: [{ id: "wave", label: "Wave profile", kind: "explicit-cartesian",
      expression: { source: expression, variable: "x", ast: parsed.ast },
      domain: { min: -3, max: 3, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
  const surface = extrudeGraph2DProfile(graph, "wave", { direction: [0, 0, 1], length: 3, caps: "none" });
  const graphWorkspace = createGraph2DWorkspaceProject(graph);
  const sourceWorkspace = createMixedWorkspaceDocument({ ...graphWorkspace,
    entries: [...graphWorkspace.entries, { module: "surface", checkpoint: surface.document, expected: surface.document.identity, replay: null }],
    activeDocumentIds: [...graphWorkspace.activeDocumentIds, surface.document.identity.id],
    relations: [...graphWorkspace.relations, surface.relation] });
  const made = createSavedSurfaceMesh(sourceWorkspace, surface.document, { documents: verifyMixedWorkspaceReplay(sourceWorkspace) }, 33, "Ripple Wave Mesh");
  const sampleX = [-2.25, -0.75, 0.75, 2.25];
  const geometry = createGeometryDocument({ stableKey: [id, token, "geometry"], metadata: { title: "Wave sample markers" },
    source: { geometry: null,
      objects: sampleX.map((x, index) => ({ id: `marker-${index + 1}`, type: "sphere" as const, params: { radius: 0.32 },
        transform: { position: { x, y: waveHeight(x), z: 1.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } })),
      surfaces: [], constructions: [], relationships: [], parameters: { sampleX, sampleDepth: 1.5 }, extensions: {} },
    display: { objects: Object.fromEntries(sampleX.map((x, index) => [`marker-${index + 1}`, {
      name: `${waveHeight(x) >= 0 ? "Crest" : "Trough"} at x=${x}`, visible: true,
      material: { color: waveHeight(x) >= 0 ? 0x2776ce : 0xd27d35, opacity: 1 },
    }])) } });
  const geometryRelation = createDocumentRelation({ kind: "derived-from", sources: [viewerSourceFromDocument(surface.document)], sourceOrder: "ordered",
    target: { type: "document", generation: viewerSourceFromDocument(geometry) }, operation: "project-template.wave-sample-markers",
    parameters: { sampleX, sampleDepth: 1.5, sampleFunction: expression } });
  const workspace = createMixedWorkspaceDocument({ ...made.workspace,
    entries: [...made.workspace.entries, { module: "geometry", checkpoint: geometry, expected: geometry.identity, replay: null }],
    activeDocumentIds: [...made.workspace.activeDocumentIds, geometry.identity.id],
    relations: [...made.workspace.relations, geometryRelation] });
  let project = createMath3DProject(workspace, { stableKey: [id, token], title: recipe.title });
  project = updateMath3DProjectMetadata(project, { ...project.metadata, description: recipe.description,
    tags: ["starter", id, "graph", "surface", "mesh", "geometry"],
    documents: { [graph.identity.id]: { title: "Wave profile" }, [surface.document.identity.id]: { title: "Ripple Wave Surface" },
      [made.adapter.document().identity.id]: { title: "Ripple Wave Mesh" }, [geometry.identity.id]: { title: "Wave sample markers" } } });
  const research = addRippleWaveResearch(project);
  if (!research) throw new TypeError("Ripple Wave research content was not created.");
  project = research.project;
  const resources = captureProjectResources(project, item => item.kind === "mesh-buffers" ? made.adapter.resources.bytes(made.adapter.document().source.resource)
    : item.kind === "workbook-payload" && item.id === research.workbook.id ? research.workbook.bytes : null);
  return { project, resources };
};

const instantiateDocumentNotebookStarter = (id: "graph-derivative-notebook" | "curve-construction-notebook", token: string) => {
  const graph = id === "graph-derivative-notebook";
  const recipe = NOTEBOOK_STARTERS.find(item => item.id === id)!;
  let project = instantiateMath3DProjectTemplate(graph ? "derivative-study" : "curve-construction-study", token);
  project = updateMath3DProjectMetadata(project, { ...project.metadata, title: recipe.title, description: recipe.description,
    tags: ["starter", id, "workbook", "notes", graph ? "graph" : "curve"] });
  const entry = (module: string, title?: string) => {
    const found = project.workspace.entries.find(item => item.module === module && (!title || ("metadata" in item.checkpoint && "title" in item.checkpoint.metadata && item.checkpoint.metadata.title === title)));
    if (!found) throw new TypeError(`Starter ${module} source is unavailable.`);
    return found;
  };
  const primary = graph ? entry("graph2d") : entry("curve", "Measured profile");
  const note = createProjectNote({ projectId: project.identity.id, stableKey: [id, token, "source-note"], kind: "text",
    title: graph ? "Derivative source" : "Construction source",
    body: graph
      ? "The saved derivative at x = 1 is a numerical result for this Graph generation. Edit the parabola and inspect the historical citation before drawing a new conclusion."
      : "The measured Curve is the source for the revolution and extrusion. Edit it to inspect stale descendants; this starter contains no computed curvature or minimality claim.",
    anchor: { kind: "document", source: viewerSourceFromDocument({ identity: primary.expected }) }, createdAt: 0 });
  project = upsertMath3DProjectNote(project, note);
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `${id}-${token}-${++sequence}`);
  workbook.title = recipe.title;
  workbook.stages[0]!.blocks[0]!.text = graph
    ? "Open the Graph, compare its Curve snapshot and inspect the saved derivative at x = 1. Source edits leave the recorded numerical result historical until an explicit rerun."
    : "Open the measured Curve, then compare its revolution and extrusion Surfaces. Inspect Project Relations after editing the source Curve; no analysis result is supplied by this starter.";
  workbook.stages[0]!.blocks[1]!.formula = graph ? "y=x^2,\\quad y'=2x" : "C(t)\\rightarrow\\{\\text{revolution},\\text{extrusion}\\}";
  const cited = graph
    ? [primary, entry("curve")]
    : [primary, entry("surface", "Profile revolution"), entry("surface", "Profile extrusion")];
  workbook.stages[1]!.blocks = cited.map((item, index) => ({ id: `${id}-source-${index}`, type: "reference" as const,
    title: "metadata" in item.checkpoint && "title" in item.checkpoint.metadata ? item.checkpoint.metadata.title : item.module,
    notebookReference: createNotebookReference(project, "document", item.expected.id) }));
  if (graph) {
    const result = project.workspace.results[0];
    if (!result) throw new TypeError("Starter derivative result is unavailable.");
    workbook.stages[1]!.blocks.push({ id: `${id}-result`, type: "reference", title: "Recorded numerical derivative",
      notebookReference: createNotebookReference(project, "result", result.resultId) });
  }
  workbook.stages[3]!.blocks = [{ id: `${id}-explanation`, type: "text", title: "Interpret the sources",
    text: graph
      ? "The derivative citation records a numerical evaluation at x = 1 with its original Graph generation. The Curve is a snapshot, not a live edit of the Graph. Inspect freshness before comparing them."
      : "The revolution and extrusion cite the measured profile through Project Relations. Their geometry is constructed from recorded source generations; this Workbook does not assert curvature, convergence or minimality." }];
  const bound = prepareProjectWorkbook(project, workbook, token);
  project = upsertMath3DProjectWorkbook(project, bound.reference);
  return { project, resources: captureProjectResources(project, item => item.kind === "workbook-payload" ? bound.bytes : null) };
};

const instantiateVolumeIsosurfaceStarter = (token: string) => {
  const id = "volume-isosurface-study", recipe = NOTEBOOK_STARTERS.find(item => item.id === id)!;
  const volume = createVolumeDocument({ stableKey: [id, token, "volume"],
    metadata: { title: "Analytic sphere Volume" }, source: {
      representation: "custom-scalar-field", recipe: { kind: "custom-field", expression: "x*x+y*y+z*z-1", parameters: {} },
      spatial: { dimensions: [24, 24, 24], origin: [-1.5, -1.5, -1.5],
        spacing: [3 / 23, 3 / 23, 3 / 23], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        centering: "point", coordinateSystem: "world", positionUnits: "m", valueUnits: "unitless" },
      dependencies: [], payload: null,
    } });
  const workspace = createMixedWorkspaceDocument({
    entries: [{ module: "volume", checkpoint: volume, expected: volume.identity, replay: null }],
    activeDocumentIds: [volume.identity.id], results: [], artifacts: [], relations: [],
    constructions: [], committedSelection: null,
  });
  let project = createMath3DProject(workspace, { stableKey: [id, token], title: recipe.title });
  project = updateMath3DProjectMetadata(project, { ...project.metadata,
    description: recipe.description, tags: ["starter", id, "volume", "mesh", "analysis"],
    documents: { [volume.identity.id]: { title: volume.metadata.title } } });
  return { project, resources: captureProjectResources(project, () => null) };
};

/** Numerical records and source sidecars use the same implementations as the editors. */
export function instantiateNotebookStarter(id: NotebookStarterId, token: string) {
  let phaseStart = performance.now();
  const measurePhase = (name: string) => {
    performance.clearMeasures(`project-open:starter-${name}`);
    performance.measure(`project-open:starter-${name}`, { start: phaseStart, end: performance.now() });
    phaseStart = performance.now();
  };
  const recipe = NOTEBOOK_STARTERS.find(item => item.id === id);
  if (!recipe) throw new TypeError("Unknown Notebook starter.");
  if (id === "mesh-comparison-study" || id === "mesh-comparison-review" || id === "mesh-subdivision-study" ||
    id === "mesh-curvature-study" || id === "mesh-trend-gap-study" || id === "mesh-geometry-probe" ||
    id === "surface-mesh-probe" || id === "surface-geometry-probe")
    return instantiateMeshComparisonStarter(token, id);
  if (id === "ripple-wave-study") return instantiateRippleWaveStarter(token);
  if (id === "volume-isosurface-study") return instantiateVolumeIsosurfaceStarter(token);
  if (id === "graph-derivative-notebook" || id === "curve-construction-notebook") return instantiateDocumentNotebookStarter(id, token);
  let project = instantiateMath3DProjectTemplate("catenary-study", token);
  measurePhase("template");
  const surface = project.workspace.entries.find(entry => entry.module === "surface")!.checkpoint;
  if (surface.format !== "math3d.surface-document") throw new TypeError("Starter Surface is unavailable.");
  const made = createSavedSurfaceMesh(project.workspace, surface, { documents: verifyMixedWorkspaceReplay(project.workspace) });
  measurePhase("mesh");
  const result = analyzeSavedMesh(made.adapter, id === "catenoid-evidence" ? "curvature" : "edge-path", { start: 0, end: 32 });
  measurePhase("analysis");
  project = replaceMath3DProjectWorkspace(project, appendSavedMeshAnalysis(made.workspace, result));
  if (id === "catenoid-evidence") project = recordCatenoidWaistComparison(project, made.adapter);
  measurePhase("project-update");
  project = updateMath3DProjectMetadata(project, { ...project.metadata, title: recipe.title, description: recipe.description, tags: ["starter", id, "workbook", "notes", "evidence"] });
  const field = id === "catenoid-evidence" ? "mean.avg" : "length";
  const note = createProjectNote({ projectId: project.identity.id, stableKey: [id, token, "measured"], kind: "result", title: "Measured evidence",
    body: `Saved ${field}: {{value:measured}}. This is numerical Mesh evidence; it does not prove analytic minimality or a continuous geodesic.`,
    anchor: { kind: "result", source: result.provenance.source, resultId: result.resultId, resultHash: structuralHash(result) }, createdAt: 0 });
  project = upsertMath3DProjectNote(project, updateProjectNote(note, { valueBindings: [{ id: "measured", kind: "result", source: result.provenance.source, resultId: result.resultId, resultHash: structuralHash(result), field }] }, 0));
  let n = 0, workbook = createDefaultWorkbook(() => `${id}-${token}-${++n}`);
  workbook.title = recipe.title;
  workbook.stages[0]!.blocks[0]!.text = "Open Projects → Workbooks → this Workbook, then choose Document. Open Notes for the measured value. Change Grid resolution and use Preview affected work / Run affected. The grid operation is independent of the retained saved Mesh: recomputing a grid does not replace its evidence.";
  workbook.stages[0]!.blocks[1]!.formula = "x=v,\\quad y=\\cosh(v)\\cos(u),\\quad z=\\cosh(v)\\sin(u)";
  workbook.stages[1]!.blocks = [{ id: `${id}-result`, type: "reference", title: "Recorded numerical analysis", notebookReference: createNotebookReference(project, "result", result.resultId) },
    ...(id === "catenoid-evidence" ? [{ id: `${id}-waist-comparison`, type: "reference" as const,
      title: "Pinned analytic waist and discrete Mesh comparison",
      notebookReference: createNotebookReference(project, "result", project.workspace.results.find(item =>
        item.provenance.operation.type === CATENOID_WAIST_OPERATION)!.resultId) }] : []),
    { id: `${id}-grid`, type: "compute", title: "Independent chart grid", compute: { operatorId: "chart_grid" } }];
  workbook.namedParameters = [{ schemaVersion: 1, id: "resolution", label: "Grid resolution", unit: "samples", min: 17, max: 65, step: 1, value: 33 }];
  workbook = bindWorkbookNamedParameter(workbook, "resolution", `${id}-grid`, { id: "paramResolution", label: "Resolution", kind: "number", min: 3, max: 129, step: 1, defaultValue: 33 }, `${id}-binding`);
  workbook.stages[3]!.blocks[0]!.text = "Inspect Provenance for the exact source generation, backend, method and warnings. Move or edit the saved Mesh to make this historical result stale; use Rerun stale analysis and explicitly relink only the result cell. Claims retain their exact citations.";
  workbook.stages[3]!.blocks[1]!.claim = { schemaVersion: 1, text: `The recorded ${field} is within the declared broad interval. This checks a scalar only.`, evidence: [{ kind: "result", reference: createNotebookReference(project, "result", result.resultId) as ReturnType<typeof createNotebookReference> & { kind: "result" } }],
    checker: { kind: "scalar-range", evidenceIndex: 0, field, min: id === "catenoid-evidence" ? -100 : 0, max: 100 } };
  const bound = prepareProjectWorkbook(project, workbook, token);
  project = upsertMath3DProjectWorkbook(project, bound.reference);
  measurePhase("workbook");
  const resources = captureProjectResources(project, item => item.kind === "workbook-payload" ? bound.bytes : item.kind === "mesh-buffers" ? made.adapter.resources.bytes(made.adapter.document().source.resource) : null);
  measurePhase("resources");
  return { project, resources };
}
