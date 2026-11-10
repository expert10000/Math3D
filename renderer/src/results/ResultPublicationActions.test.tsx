import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createResultPublication } from "./resultPublication";
import { ResultPublicationActions } from "./ResultPublicationActions";

const base = {
  module: "graph2d" as const, resultId: "result-1",
  source: { id: "source-1", revision: 3, generation: 4, hash: "sha256:abc" },
  sourceStatus: "current", status: "recorded" as const, reason: "Exact source checked",
  recordedClaim: "Numerical scan", independentCheck: "No independent proof", summary: { count: 2 },
};

describe("shared result publication actions", () => {
  it("shows a recorded summary scope and both exports", () => {
    const html = renderToStaticMarkup(<ResultPublicationActions
      publication={createResultPublication(base)} onExport={() => {}}
      jsonTestId="domain-json" csvTestId="domain-csv" />);
    expect(html).toContain('data-publication-status="recorded"');
    expect(html).toContain("Summary values are included as producer-recorded evidence");
    expect(html).toContain("Numerical scan");
    expect(html).toContain("No independent proof");
    expect(html).toContain("generation 4");
    expect(html).toContain('data-testid="domain-json"');
    expect(html).toContain('data-testid="domain-csv"');
    expect(html).toContain('data-testid="result-publication-export-receipt"');
  });

  it("keeps metadata exports available while spelling out omissions", () => {
    for (const status of ["withheld", "preview"] as const) {
      const html = renderToStaticMarkup(<ResultPublicationActions
        publication={createResultPublication({ ...base, status })} onExport={() => {}} />);
      expect(html).toContain(`data-publication-status="${status}"`);
      expect(html).toContain("Omitted: summary values");
      expect(html).toContain("Export evidence JSON");
      expect(html).toContain("Export evidence CSV");
      expect(html).toContain("Export common receipt JSON");
      expect(html).not.toContain("count: 2");
    }
  });
});
