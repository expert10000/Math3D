import type { Math3DProject } from "@math3d/core";
import { inspectCatenoidWaistComparison } from "../projects/catenoidCurvatureJourney";
import type { VerifiedProjectResources } from "../projects/projectResources";
import { downloadStudyBlob } from "../projects/studyComparisonExport";

/** Reads the saved comparison and exact sidecar; it never reruns either analysis on reopen. */
export function CatenoidWaistEvidencePanel({ project, resources }: {
  project: Math3DProject; resources?: VerifiedProjectResources;
}) {
  const inspected = inspectCatenoidWaistComparison(project, id =>
    resources?.bytes({ kind: "mesh-buffers", id }) ?? null);
  if (inspected.status !== "current") return <p role="status" data-testid="project-catenoid-waist-status">
    Waist comparison withheld: {inspected.reason}</p>;
  const summary = inspected.result.summary as Record<string, number | string>;
  return <section data-testid="project-catenoid-waist-evidence" aria-label="Catenoid waist comparison">
    <h6>Catenoid waist |K| ridge</h6>
    <p>Saved sampled Curve at x=0; analytic reference K={summary.analyticWaistGaussian}.
      At Mesh vertex {summary.meshVertex}, x={summary.chartX}, analytic reference K={summary.analyticGaussian},
      discrete estimate K={summary.discreteGaussian}; absolute difference {summary.absoluteDifference}.
      This local estimate is not a convergence or minimality proof.</p>
    <button type="button" data-testid="project-catenoid-waist-export" onClick={() => {
      const checked = inspectCatenoidWaistComparison(project, id =>
        resources?.bytes({ kind: "mesh-buffers", id }) ?? null);
      if (checked.status !== "current") return;
      downloadStudyBlob(new Blob([JSON.stringify({ format: "math3d.catenoid-waist-evidence/v1",
        projectId: project.identity.id, result: checked.result }, null, 2) + "\n"],
      { type: "application/json" }), `catenoid-waist-${checked.result.resultId.slice(-12)}.json`);
    }}>Download pinned comparison JSON</button>
  </section>;
}
