import React, { useEffect, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { scientificSubrectangleReportMarkdown, verifyScientificSubrectangleReport } from
  "../projects/scientificSubrectangleWorkbook";
import { renderNotebookMarkdown } from "../workbook/notebookContent";

export const ScientificSubrectangleWorkbookReport: React.FC<{
  project: Math3DProject | null; reference: NotebookReference | undefined;
}> = ({ project, reference }) => {
  const [report, setReport] = useState("");
  const [message, setMessage] = useState("Checking verified sources…");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setReport("");
    setMessage("Checking verified sources…");
    if (!project || !reference) { setMessage("Open the named Project to verify this report."); return; }
    void verifyScientificSubrectangleReport(project, reference).then(result => {
      if (active) { setReport(scientificSubrectangleReportMarkdown(result)); setMessage("Sources verified"); }
    }).catch(error => { if (active) setMessage((error as Error).message); });
    return () => { active = false; };
  }, [project?.identity.id, project?.identity.structuralHash,
    reference?.targetId, reference?.kind === "result" ? reference.resultHash : undefined]);
  const exportReport = async () => {
    if (!project || !reference || busy) return;
    setBusy(true);
    setReport("");
    setMessage("Rechecking sources before export…");
    try {
      const result = await verifyScientificSubrectangleReport(project, reference);
      const markdown = scientificSubrectangleReportMarkdown(result);
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url; link.download = `scientific-subrectangle-${result.resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.report.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setReport(markdown);
      setMessage("Sources verified; report exported.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  return <section data-testid="scientific-subrectangle-workbook-report">
    <p role="status">{message}</p>
    {report && <div dangerouslySetInnerHTML={{ __html: renderNotebookMarkdown(report) }} />}
    <button type="button" disabled={!project || !reference || busy} onClick={() => { void exportReport(); }}>Verify and export report</button>
  </section>;
};
