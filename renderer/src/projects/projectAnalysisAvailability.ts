import { GRAPH2D_TOOLS, graph2DToolUnavailable, type KernelWorkspaceModule, type Math3DProject } from "@math3d/core";
import { inspectProjectCompatibility, type ProjectCompatibilityOptions } from "./projectTransfer";
import { additionalRepresentationView } from "./additionalProjectRepresentations";
import { capturedCurveSources } from "./capturedCurveSources";
import { nativeDocumentEditable } from "./nativeProjectRestore";
import { geometryDocumentEditable } from "./nativeGeometryRestore";

export type ProjectAnalysisRoute = "surface" | "surface-mesh" | "mesh" | "graph-tools" | "curve" | "geometry" | "volume" | "complex";
export type ProjectAnalysisAvailability = { id: string; module: KernelWorkspaceModule; route: ProjectAnalysisRoute | null; tools: string[]; reason: string | null; qualification: string };

/** Advertise only analysis entry points the saved-document host can actually open. */
export const projectAnalysisAvailability = (project: Math3DProject, options: ProjectCompatibilityOptions = {}): ProjectAnalysisAvailability[] => {
  const compatibility = inspectProjectCompatibility(project, options);
  const documents = new Map(compatibility.checkpoint.entries.map(entry => [entry.expected.id, entry.checkpoint]));
  const context = { documents, resources: options.resources, capturedCurves: capturedCurveSources(project.workspace) };
  return compatibility.checkpoint.entries.map(entry => {
    const document = entry.checkpoint;
    const item: ProjectAnalysisAvailability = { id: document.identity.id, module: entry.module, route: null, tools: [], reason: null, qualification: "" };
    if (project.metadata.documents?.[item.id]?.archived) return { ...item, reason: "Archived document. Restore it before opening analysis." };
    if (!compatibility.documents.find(candidate => candidate.id === item.id)?.editable) return { ...item, reason: "This saved representation has preview support; its analysis editor cannot be restored." };
    if (document.format === "math3d.surface-document") {
      try {
        const view = additionalRepresentationView(document, context);
        if (view.meshes.length !== 1 || !view.meshes[0].indices?.length) throw new TypeError("No single triangle mesh is available from this source.");
        if (nativeDocumentEditable(document)) return { ...item, route: "surface", tools: ["Surface curvature", "Normals and probes", "Saved Mesh studies"], qualification: "Uses the current parametric formulas. Saved Mesh studies require an opened saved project and use a separate sampled Mesh." };
        return { ...item, route: "surface-mesh", tools: ["Mesh quality", "Discrete curvature", "Shortest edge path"], qualification: "Create a saved sampled Mesh first. Curvature is numerical; paths follow Mesh edges." };
      } catch (error) { return { ...item, reason: (error as Error).message }; }
    }
    if (document.format === "math3d.mesh-document") {
      const resource = document.source.resource;
      const available = !!options.resources?.bytes({ kind: "mesh-buffers", id: resource.id }) || !!options.artifactAvailable?.(resource.id, resource.checksum);
      if (!available) return { ...item, reason: "Verified Mesh source buffers are unavailable. Import the project with source resources." };
      return { ...item, route: "mesh", tools: ["Mesh quality", "Discrete curvature", "Shortest edge path"], qualification: "Saved triangle Mesh measurements; continuous surface geodesics are not certified." };
    }
    if (document.format === "math3d.graph2d-document") {
      const missing = document.source.objects.some(object => object.kind === "point-series" && !options.resources?.bytes({ kind: "graph-point-table", id: object.table.id }) && !options.tableAvailable?.(object.table));
      if (missing) return { ...item, reason: "A source point table is unavailable. Import the project with source resources." };
      const tools = GRAPH2D_TOOLS.filter(tool => ["roots", "extrema", "intersections", "regression"].includes(tool.id) && document.source.objects.some(object => {
        const candidate = { ...document, selection: { objectId: object.id, probe: null } };
        return !graph2DToolUnavailable(candidate, tool.id, true);
      })).map(tool => tool.label as string);
      if (document.source.objects.some(object => object.kind === "explicit-cartesian")) tools.push("Tangent (probe required)");
      tools.unshift("Point/probe");
      return { ...item, route: "graph-tools", tools, qualification: "Select the corresponding Graph object and required probe or interval. Each tool checks its inputs before analysis." };
    }
    if (document.format === "math3d.curve-document" && nativeDocumentEditable(document)) return { ...item, route: "curve", tools: ["Curve analysis"], qualification: "Analysis uses the current Curve formulas and domain; operation availability is checked in the module." };
    if (document.format === "math3d.geometry-document" && geometryDocumentEditable(document)) return { ...item, route: "geometry", tools: ["Geometry analysis"], qualification: "Select an object or construction; individual tools check their required inputs." };
    if (document.format === "math3d.volume-document") return { ...item, route: "volume", tools: ["Volume analysis"], qualification: "Volume tools check the current saved recipe or verified scalar samples." };
    if (document.format === "math3d.complex-analysis-document") return { ...item, route: "complex", tools: ["Complex diagnostics"], qualification: "Inspect the current function, domain and branch settings in the Complex module." };
    return { ...item, reason: "This representation has no qualified linked analysis entry point yet. Existing saved results remain available below." };
  });
};
