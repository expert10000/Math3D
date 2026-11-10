import { resultPublicationJson, type ResultPublication } from "./resultPublication";

export function ResultPublicationActions({ publication, onExport, jsonTestId, csvTestId,
  jsonLabel = "Export evidence JSON", csvLabel = "Export evidence CSV" }: Readonly<{
  publication: ResultPublication<unknown>;
  onExport: (format: "json" | "csv") => void;
  jsonTestId?: string;
  csvTestId?: string;
  jsonLabel?: string;
  csvLabel?: string;
}>) {
  const { assessment } = publication;
  const exportReceipt = () => {
    const url = URL.createObjectURL(new Blob([resultPublicationJson(publication)],
      { type: "application/json;charset=utf-8" }));
    const link = globalThis.document.createElement("a");
    link.href = url;
    link.download = `result-${publication.resultId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80)}.publication.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="result-publication-actions" data-testid="result-publication-actions"
    data-publication-status={assessment.status} aria-label="Result evidence exports"
    style={{ display: "grid", gap: 6, padding: "8px 10px", border: "1px solid #cbd5e1",
      borderRadius: 8, background: "var(--workspace-section-bg, #fff)" }}>
    <p data-testid="result-publication-scope"><strong>Evidence export: {assessment.status}.</strong>{" "}
      {assessment.omissions.length ? `Omitted: ${assessment.omissions.join(", ")}.` :
        "Summary values are included as producer-recorded evidence."}</p>
    <details><summary>Claim and check scope</summary>
      <p>Recorded claim: {assessment.recordedClaim}</p>
      <p>Independent check: {assessment.independentCheck}</p>
      <p>Source: {publication.source.id} · revision {publication.source.revision ?? "unavailable"}
        {publication.source.generation === null ? "" : ` · generation ${publication.source.generation}`}
        {publication.source.hash === null ? " · no retained source hash" :
          ` · hash ${publication.source.hash}`}</p>
      <p>{assessment.reason}</p>
    </details>
    <div className="result-publication-downloads" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button type="button" data-testid={jsonTestId} onClick={() => onExport("json")}>{jsonLabel}</button>
      <button type="button" data-testid={csvTestId} onClick={() => onExport("csv")}>{csvLabel}</button>
      <button type="button" data-testid="result-publication-export-receipt"
        onClick={exportReceipt}>Export common receipt JSON</button>
    </div>
  </section>;
}
