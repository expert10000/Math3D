import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Graph2DResultEvidence } from "./Graph2DResultEvidence";
import { createGraph2DResultEvidence, graph2DResultEvidenceCsv,
  graph2DResultEvidenceJson } from "./graph2dResultEvidenceModel";

const input = {
  current: true, resultId: "graph-result", source: { documentId: "graph", revision: 2,
    generation: 2, structuralHash: "sha256:saved" }, claim: "bounded root scan",
  method: "bracket-and-refine", limitation: "Completeness is not certified.", units: "m",
  summary: { roots: 7, scanStatus: "complete" },
} as const;

describe("Graph numerical Inspector evidence", () => {
  it("exports a bounded, source-qualified summary in JSON and CSV", () => {
    const evidence = createGraph2DResultEvidence(input);
    expect(evidence).toMatchObject({ assessment: { status: "current", omissions: [] },
      summary: { roots: 7 }, source: { revision: 2 } });
    expect(graph2DResultEvidenceJson(evidence)).toContain('"roots": 7');
    expect(graph2DResultEvidenceCsv(evidence)).toContain('"summary","{""roots"":7,""scanStatus"":""complete""}"');
    const html = renderToStaticMarkup(<Graph2DResultEvidence {...input} />);
    expect(html).toContain('data-qualification="current"');
    expect(html).toContain('data-testid="graph2d-result-export-evidence-json"');
    expect(html).toContain('data-testid="graph2d-result-export-evidence-csv"');
  });

  it("withholds historical and transient summaries in the card and both exports", () => {
    for (const state of [{ current: false }, { current: true, preview: true }]) {
      const entry = { ...input, ...state };
      const evidence = createGraph2DResultEvidence(entry);
      expect(evidence.summary).toBeNull();
      expect(evidence.assessment.omissions).toContain("summary values");
      expect(graph2DResultEvidenceJson(evidence)).not.toContain('"roots": 7');
      expect(graph2DResultEvidenceCsv(evidence)).not.toContain("roots");
      const html = renderToStaticMarkup(<Graph2DResultEvidence {...entry} />);
      expect(html).not.toContain("roots: 7");
      expect(html).toContain("Values withheld");
    }
  });

  it("neutralizes formula-like source IDs and escapes quotes", () => {
    const evidence = createGraph2DResultEvidence({ ...input,
      source: { ...input.source, documentId: "=1+1" }, claim: 'scan "quoted"' });
    const csv = graph2DResultEvidenceCsv(evidence);
    expect(csv).toContain('"source.documentId","\'=1+1"');
    expect(csv).toContain('"claim","scan ""quoted"""');
  });
});
