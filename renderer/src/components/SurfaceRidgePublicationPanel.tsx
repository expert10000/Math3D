import { useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { inspectSurfaceRidgeComparison, supportedSurfaceRidges,
  SURFACE_RIDGE_COMPARISON_OPERATION } from "../projects/surfaceRidgePublication";
import { downloadStudyBlob } from "../projects/studyComparisonExport";

/** Saved revolution ridges are offered as explicit, bounded publication choices. */
export function SurfaceRidgePublicationPanel({ project, resources, editable, onPublish }: {
  project: Math3DProject; resources?: VerifiedProjectResources; editable: boolean;
  onPublish?: (surfaceId: string, meshId: string, ridgeIndex: number) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const surfaces = project.workspace.entries.flatMap(entry => entry.module === "surface" &&
    entry.checkpoint.format === "math3d.surface-document" ? [entry.checkpoint] : []);
  const results = project.workspace.results.filter(item =>
    item.provenance.operation.type === SURFACE_RIDGE_COMPARISON_OPERATION);
  if (!surfaces.some(surface => supportedSurfaceRidges(surface).length) && !results.length) return null;
  return <section data-testid="project-surface-ridge-publication" aria-label="Surface ridge publication">
    <h5>Surface ridge to Mesh comparison</h5>
    <p>Choose a sampled interior |K| maximum on a saved full revolution. Publish after generating a Mesh and recording its discrete curvature.</p>
    {editable && surfaces.map(surface => {
      const ridges = supportedSurfaceRidges(surface);
      const meshes = project.workspace.relations.flatMap(relation =>
        relation.status === "current" && relation.operation === "surface.tessellate-saved" &&
        relation.sources.length === 1 && relation.sources[0]!.documentId === surface.identity.id &&
        relation.sources[0]!.revision === surface.identity.revision &&
        relation.sources[0]!.structuralHash === surface.identity.structuralHash &&
        relation.target.type === "document" ? project.workspace.entries.filter(entry =>
          relation.target.type === "document" && entry.module === "mesh" &&
          entry.expected.id === relation.target.generation.documentId) : []);
      return ridges.map(ridge => <div key={`${surface.identity.id}:${ridge.index}`}>
        <span>{surface.metadata.title}: u={ridge.u.toPrecision(5)}, analytic K={ridge.gaussian.toPrecision(5)}</span>{" "}
        {meshes.map(mesh => <button key={mesh.expected.id} type="button" disabled={busy || !onPublish}
          data-testid={`project-publish-ridge-${surface.identity.id}-${ridge.index}-${mesh.expected.id}`}
          onClick={() => { setBusy(true); setMessage("Rechecking exact Surface, Mesh and curvature sources…");
            void onPublish?.(surface.identity.id, mesh.expected.id, ridge.index)
              .then(() => setMessage("Ridge Curve, comparison result and Workbook staged. Save Project to keep them."))
              .catch(error => setMessage(`Ridge publication withheld: ${(error as Error).message}`))
              .finally(() => setBusy(false)); }}>
          Publish with {mesh.checkpoint.format === "math3d.mesh-document" ? mesh.checkpoint.metadata.label : "Mesh"}
        </button>)}
        {!meshes.length && <small>Generate a saved Mesh from this Surface first.</small>}
      </div>);
    })}
    {results.map(result => {
      const checked = inspectSurfaceRidgeComparison(project, result.resultId,
        id => resources?.bytes({ kind: "mesh-buffers", id }) ?? null);
      if (checked.status !== "current") return <p key={result.resultId} role="status"
        data-testid="project-surface-ridge-withheld">Comparison withheld: {checked.reason}</p>;
      const summary = result.summary as Record<string, number | string>;
      return <div key={result.resultId} data-testid="project-surface-ridge-evidence">
        <p>At u={summary.ridgeParameter}, analytic K={summary.analyticGaussian}, nearest Mesh vertex {summary.meshVertex} K={summary.discreteGaussian}; absolute error {summary.absoluteDifference} {summary.curvatureUnit}, spatial offset {summary.spatialOffset} {summary.lengthUnit}.</p>
        <button type="button" data-testid="project-surface-ridge-export" onClick={() => {
          const current = inspectSurfaceRidgeComparison(project, result.resultId,
            id => resources?.bytes({ kind: "mesh-buffers", id }) ?? null);
          if (current.status !== "current") { setMessage(`Export withheld: ${current.reason}`); return; }
          downloadStudyBlob(new Blob([JSON.stringify({ format: "math3d.surface-ridge-evidence/v1",
            projectId: project.identity.id, result: current.result }, null, 2) + "\n"],
          { type: "application/json" }), `surface-ridge-${result.resultId.slice(-12)}.json`);
        }}>Download checked comparison JSON</button>
      </div>;
    })}
    {message && <p role="status" data-testid="project-surface-ridge-status">{message}</p>}
  </section>;
}
