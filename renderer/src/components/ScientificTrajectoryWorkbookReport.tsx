import React, { useEffect, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { scientificTrajectoryReportMarkdown,
  verifyScientificTrajectoryReport } from "../projects/scientificTrajectoryWorkbook";
import { renderNotebookMarkdown } from "../workbook/notebookContent";

export const ScientificTrajectoryWorkbookReport: React.FC<{
  project?: Math3DProject | null; reference?: NotebookReference;
}> = ({ project, reference }) => {
  const [markdown, setMarkdown] = useState("");
  const [message, setMessage] = useState("Checking trajectory source…");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMarkdown("");
    if (!project || !reference) { setMessage("Open the named Project to verify this report."); return; }
    try {
      setMarkdown(scientificTrajectoryReportMarkdown(
        verifyScientificTrajectoryReport(project, reference)));
      setMessage("Source and solver statistics verified");
    } catch (cause) { setMessage(`Solver values withheld: ${(cause as Error).message}`); }
  }, [project, reference]);
  const exportReport = () => {
    if (!project || !reference || busy) return;
    setBusy(true); setMarkdown("");
    try {
      const checked = verifyScientificTrajectoryReport(project, reference);
      const report = scientificTrajectoryReportMarkdown(checked);
      const url = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `trajectory-solver-${checked.resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.md`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMarkdown(report); setMessage("Source reverified; solver report exported.");
    } catch (cause) { setMessage(`Export withheld: ${(cause as Error).message}`); }
    finally { setBusy(false); }
  };
  return <section data-testid="scientific-trajectory-workbook-report">
    <p role="status">{message}</p>
    <button type="button" disabled={!project || !reference || busy}
      onClick={exportReport}>Verify and export solver report</button>
    {markdown && <div dangerouslySetInnerHTML={{
      __html: renderNotebookMarkdown(markdown) }} />}
  </section>;
};
