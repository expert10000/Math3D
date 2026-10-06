import { createProjectNote, instantiateMath3DProjectTemplate, replaceMath3DProjectWorkspace, structuralHash, updateMath3DProjectMetadata, updateProjectNote, upsertMath3DProjectNote, upsertMath3DProjectWorkbook } from "@math3d/core";
import { bindWorkbookNamedParameter, createDefaultWorkbook, createNotebookReference } from "@math3d/workbook";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { createSavedSurfaceMesh } from "./savedSurfaceMesh";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { captureProjectResources } from "./projectResources";
import { prepareProjectWorkbook } from "./projectWorkbookBinding";

export const NOTEBOOK_STARTERS = [
  { id: "catenoid-evidence", title: "Catenoid Evidence Notebook", description: "A saved catenoid Mesh, computed curvature, live Note values and a bounded scalar claim." },
  { id: "edge-path-evidence", title: "Edge Path Evidence Notebook", description: "A computed Mesh edge path with exact citations, a length check and a bound Workbook grid parameter." },
] as const;
export type NotebookStarterId = typeof NOTEBOOK_STARTERS[number]["id"];

/** Numerical records and source sidecars use the same implementations as the editors. */
export function instantiateNotebookStarter(id: NotebookStarterId, token: string) {
  const recipe = NOTEBOOK_STARTERS.find(item => item.id === id);
  if (!recipe) throw new TypeError("Unknown Notebook starter.");
  let project = instantiateMath3DProjectTemplate("catenary-study", token);
  const surface = project.workspace.entries.find(entry => entry.module === "surface")!.checkpoint;
  if (surface.format !== "math3d.surface-document") throw new TypeError("Starter Surface is unavailable.");
  const made = createSavedSurfaceMesh(project.workspace, surface, { documents: verifyMixedWorkspaceReplay(project.workspace) });
  const result = analyzeSavedMesh(made.adapter, id === "catenoid-evidence" ? "curvature" : "edge-path", { start: 0, end: 32 });
  project = replaceMath3DProjectWorkspace(project, appendSavedMeshAnalysis(made.workspace, result));
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
    { id: `${id}-grid`, type: "compute", title: "Independent chart grid", compute: { operatorId: "chart_grid" } }];
  workbook.namedParameters = [{ schemaVersion: 1, id: "resolution", label: "Grid resolution", unit: "samples", min: 17, max: 65, step: 1, value: 33 }];
  workbook = bindWorkbookNamedParameter(workbook, "resolution", `${id}-grid`, { id: "paramResolution", label: "Resolution", kind: "number", min: 3, max: 129, step: 1, defaultValue: 33 }, `${id}-binding`);
  workbook.stages[3]!.blocks[0]!.text = "Inspect Provenance for the exact source generation, backend, method and warnings. Move or edit the saved Mesh to make this historical result stale; use Rerun stale analysis and explicitly relink only the result cell. Claims retain their exact citations.";
  workbook.stages[3]!.blocks[1]!.claim = { schemaVersion: 1, text: `The recorded ${field} is within the declared broad interval. This checks a scalar only.`, evidence: [{ kind: "result", reference: createNotebookReference(project, "result", result.resultId) as ReturnType<typeof createNotebookReference> & { kind: "result" } }],
    checker: { kind: "scalar-range", evidenceIndex: 0, field, min: id === "catenoid-evidence" ? -100 : 0, max: 100 } };
  const bound = prepareProjectWorkbook(project, workbook, token);
  project = upsertMath3DProjectWorkbook(project, bound.reference);
  const resources = captureProjectResources(project, item => item.kind === "workbook-payload" ? bound.bytes : item.kind === "mesh-buffers" ? made.adapter.resources.bytes(made.adapter.document().source.resource) : null);
  return { project, resources };
}
