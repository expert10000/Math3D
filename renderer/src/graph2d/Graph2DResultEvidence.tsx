import type { ScientificSourceGeneration } from "@math3d/core";
import { createGraph2DResultEvidence, graph2DResultEvidenceCsv,
  graph2DResultEvidenceJson } from "./graph2dResultEvidenceModel";

type Props = Readonly<{
  current: boolean;
  resultId: string;
  source: ScientificSourceGeneration;
  claim: string;
  method: string;
  limitation: string;
  units: string;
  preview?: boolean;
  summary?: Readonly<Record<string, string | number | boolean | null>>;
}>;

/** Presentation of the recorded claim and its exact source, not a second scientific check. */
export function Graph2DResultEvidence({ current, resultId, source, claim, method, limitation, units,
  preview, summary }: Props) {
  const evidence = createGraph2DResultEvidence({ current, preview, resultId, source, claim,
    method, limitation, units, summary });
  const exportEvidence = (format: "json" | "csv") => {
    const content = format === "json" ? graph2DResultEvidenceJson(evidence) :
      graph2DResultEvidenceCsv(evidence);
    const url = URL.createObjectURL(new Blob([content],
      { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `graph-result-${resultId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80)}.evidence.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="graph2d-result-evidence" data-testid="graph2d-result-evidence"
    data-qualification={evidence.assessment.status}>
    <p role="status"><strong>{preview ? "Transient numerical preview" : current ?
      "Current numerical result" : "Historical numerical result"}</strong>
      {evidence.assessment.status === "current" ? ` · ${claim}` :
        preview ? " · preview values are omitted from evidence export" :
          " · source or settings changed; recorded values are withheld"}</p>
    <details><summary>Result evidence</summary><dl>
      <div><dt>Result</dt><dd><code>{resultId}</code></dd></div>
      <div><dt>Source</dt><dd><code>{source.documentId}</code> revision {source.revision}
        {" "}· <code>{source.structuralHash}</code></dd></div>
      <div><dt>Method</dt><dd>{method}</dd></div>
      <div><dt>Units</dt><dd>{units}</dd></div>
      <div><dt>Independent check</dt><dd>None recorded. {limitation}</dd></div>
      <div><dt>Summary</dt><dd>{evidence.summary === null ? "Values withheld" :
        Object.entries(evidence.summary).map(([key, value]) =>
          <span key={key}>{key}: {String(value)}; </span>)}</dd></div>
    </dl></details>
    <div className="graph2d-result-evidence-actions">
      <button type="button" data-testid="graph2d-result-export-evidence-json"
        onClick={() => exportEvidence("json")}>Export evidence JSON</button>
      <button type="button" data-testid="graph2d-result-export-evidence-csv"
        onClick={() => exportEvidence("csv")}>Export evidence CSV</button>
    </div>
  </div>;
}
