import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createAnalysisResultEnvelope, instantiateMath3DProjectTemplate,
  viewerSourceFromDocument, VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
  type AnalysisResultStatus } from "@math3d/core";
import type { ProjectDependencyInspection } from "../projects/projectDependencies";
import { ProjectResultsBrowser } from "./ProjectResultsBrowser";

const base = instantiateMath3DProjectTemplate("derivative-study", "result-browser-evidence");
const source = viewerSourceFromDocument({ identity: base.workspace.entries[0]!.expected });
const result = createAnalysisResultEnvelope({ resultId: "result-browser-evidence",
  status: "numerical", provenance: { source, operation: { type: "graph.sample",
    algorithm: "bounded-sample", algorithmVersion: "1", parameters: {} },
    numericContext: { tolerance: { absolute: 0.01 } },
    engine: { name: "test", version: "1" }, elapsedMs: 2 },
  summary: { value: 2, unit: "m" }, warnings: [], diagnostics: [], artifacts: [] });
const render = (generation = source, status: AnalysisResultStatus = "numerical") => {
  const project = { ...base, workspace: { ...base.workspace, results: [
    { ...result, status, provenance: { ...result.provenance, source: generation } }] } };
  return renderToStaticMarkup(<ProjectResultsBrowser project={project} inspection={null}
    titles={new Map([[source.documentId, "Saved Graph"]])} canOpen={() => true}
    onOpen={() => {}} />);
};

describe("Project saved result presentation", () => {
  it("separates a numerical claim from source freshness and keeps units", () => {
    const html = render();
    expect(html).toContain("Recorded numerical result");
    expect(html).toContain("numerical approximations");
    expect(html).toContain('data-testid="project-result-verification" data-scope="not-checked"');
    expect(html).toContain("Source document");
    expect(html).toContain("Saved Graph</button>");
    expect(html).toContain("<code>m</code>");
  });

  it("shows a historical source without a misleading current-document button", () => {
    const html = render({ ...source, generation: source.generation + 1 });
    expect(html).toContain("historical source generation");
    expect(html).not.toContain("Saved Graph</button>");
  });

  it("withholds summary values for an operation without a completed result", () => {
    for (const status of ["failed", "cancelled", "unsupported"] as const) {
      const html = render(source, status);
      expect(html).toContain("No completed result values are available");
      expect(html).not.toContain("<code>m</code>");
    }
  });

  it("disables report actions until the exact external source check succeeds", () => {
    const scientific = { ...result, provenance: { ...result.provenance,
      operation: { ...result.provenance.operation,
        type: VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE } } };
    const project = { ...base, workspace: { ...base.workspace, results: [scientific] } };
    const inspection = { results: [{ id: scientific.resultId, sourceFreshness: "current",
      freshness: "current", missingArtifactIds: [] }], artifacts: [] } as unknown as ProjectDependencyInspection;
    const show = (sourceStatus: "checking" | "source-current") => renderToStaticMarkup(
      <ProjectResultsBrowser project={project} inspection={inspection} titles={new Map()}
        canOpen={() => true} onOpen={() => {}} onCreateScientificReport={() => {}}
        onExportScientificReport={() => {}}
        regionResultStatuses={{ [scientific.resultId]: sourceStatus }} />);
    const pending = show("checking"), verified = show("source-current");
    expect(pending).toMatch(/data-testid="project-create-subrectangle-workbook" disabled=""/);
    expect(pending).toMatch(/data-testid="project-export-subrectangle-report" disabled=""/);
    expect(pending).toContain('data-summary="withheld"');
    expect(verified).not.toMatch(/data-testid="project-create-subrectangle-workbook" disabled=""/);
    expect(verified).not.toMatch(/data-testid="project-export-subrectangle-report" disabled=""/);
    expect(verified).toContain('data-summary="recorded"');
  });
});
