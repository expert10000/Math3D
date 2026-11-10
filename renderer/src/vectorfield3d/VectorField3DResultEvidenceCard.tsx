import type { VectorField3DResultEvidence } from "./vectorField3DResultEvidence";
import { vectorField3DResultEvidenceCsv, vectorField3DResultEvidenceJson } from "./vectorField3DResultEvidence";
import { ResultPublicationActions } from "../results/ResultPublicationActions";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VectorField3DResultEvidenceCard({ evidence, label, testId }: Readonly<{
  evidence: VectorField3DResultEvidence;
  label: string;
  testId: string;
}>) {
  const current = evidence.qualification === "current" && evidence.values !== null;
  const values = current ? evidence.values : null;
  const primary = values && ("value" in values ? values.value :
    "absoluteResidual" in values ? values.absoluteResidual : null);
  const safeName = evidence.resultId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100);
  return <div data-testid={testId} data-qualification={evidence.qualification}
    data-publication-status={evidence.publication.assessment.status}
    className="vectorfield3d-result-evidence-card">
    <strong>{label}</strong>
    <p role="status">{current ? `${primary} ${evidence.unit}; ${evidence.method}` :
      `Value withheld: ${evidence.reason ?? "unavailable"}`}</p>
    <p><strong>Recorded claim:</strong> {evidence.claim}</p>
    <p><strong>Check scope:</strong> {evidence.checkScope}</p>
    {values && <dl>{Object.entries(values).map(([key, value]) => <div key={key}>
      <dt>{key}</dt><dd>{value === null ? "unavailable" : String(value)}</dd>
    </div>)}</dl>}
    <details><summary>Source and method</summary><dl>
      <div><dt>Result</dt><dd><code>{evidence.resultId}</code></dd></div>
      <div><dt>Source</dt><dd><code>{evidence.source.documentId}</code>
        {" "}revision {evidence.source.revision}, generation {evidence.source.generation}</dd></div>
      <div><dt>Source hash</dt><dd><code>{evidence.source.structuralHash}</code></dd></div>
      <div><dt>Operation</dt><dd>{evidence.operation}</dd></div>
      <div><dt>Selection</dt><dd><code>{evidence.selectionId}</code></dd></div>
      <div><dt>Orientation</dt><dd>{evidence.orientation}</dd></div>
      <div><dt>Method</dt><dd>{evidence.method}</dd></div>
      <div><dt>Unit</dt><dd>{evidence.unit}</dd></div>
    </dl></details>
    <ResultPublicationActions publication={evidence.publication} onExport={format =>
      download(`${safeName}.${format}`, format === "json" ?
        vectorField3DResultEvidenceJson(evidence) : vectorField3DResultEvidenceCsv(evidence),
        format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8")}
    />
  </div>;
}
