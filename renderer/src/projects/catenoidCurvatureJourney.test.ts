import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { prepareCuratedStudyProject } from "./curatedStudyProject";
import { CATENOID_WAIST_OPERATION, inspectCatenoidWaistComparison } from "./catenoidCurvatureJourney";

const bundle = instantiateNotebookStarter("catenoid-evidence", "waist-comparison");
const project = prepareCuratedStudyProject(bundle.project, "catenoid-evidence", "waist-comparison");
const read = (id: string) => bundle.resources.bytes({ kind: "mesh-buffers", id });

describe("pinned Catenoid waist comparison", () => {
  it("records a sampled ridge Curve, analytic reference and exact discrete result through export/reopen", () => {
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const checked = inspectCatenoidWaistComparison(reopened, read);
    expect(checked.status).toBe("current");
    if (checked.status !== "current") return;
    expect(checked.result.provenance.operation.type).toBe(CATENOID_WAIST_OPERATION);
    expect(checked.result.summary).toMatchObject({ analyticWaistGaussian: -1,
      ridgeKind: "maximum |K| for the pinned cosh revolution" });
    expect(reopened.workspace.entries.some(entry => entry.module === "curve" &&
      entry.checkpoint.format === "math3d.curve-document" &&
      entry.checkpoint.source.definition.familyId === "catenoid.waist-ridge-v1")).toBe(true);
    expect(reopened.workbooks).toHaveLength(1);
  });
  it("withholds changed source, missing discrete evidence and missing Mesh bytes", () => {
    expect(inspectCatenoidWaistComparison(project, () => null)).toMatchObject({ status: "withheld",
      reason: "Saved Mesh buffer resource is missing or changed." });
    const withoutResult = { ...project, workspace: { ...project.workspace,
      results: project.workspace.results.filter(result => result.provenance.operation.type !== "mesh.saved.curvature") } };
    expect(inspectCatenoidWaistComparison(withoutResult, read).status).toBe("withheld");
    const surface = project.workspace.entries.find(entry => entry.module === "surface")!;
    const changed = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.map(entry => entry === surface ?
        { ...entry, expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) } };
    expect(inspectCatenoidWaistComparison(changed, read).status).toBe("withheld");
  });
});
