import React, { useEffect, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { scientificSubrectangleDifferences, scientificSubrectangleReportMarkdown,
  verifyScientificSubrectangleReport } from
  "../projects/scientificSubrectangleWorkbook";
import { renderNotebookMarkdown } from "../workbook/notebookContent";

export const ScientificSubrectangleWorkbookReport: React.FC<{
  project: Math3DProject | null; reference: NotebookReference | undefined;
  workbookId?: string; previousResultId?: string;
}> = ({ project, reference, workbookId, previousResultId }) => {
  const [report, setReport] = useState("");
  const [message, setMessage] = useState("Checking verified sources…");
  const [busy, setBusy] = useState(false);
  const [differences, setDifferences] = useState("");
  useEffect(() => {
    let active = true;
    setReport("");
    setDifferences("");
    setMessage("Checking verified sources…");
    if (!project || !reference) { setMessage("Open the named Project to verify this report."); return; }
    void verifyScientificSubrectangleReport(project, reference).then(result => {
      if (active) {
        setReport(scientificSubrectangleReportMarkdown(result));
        const previous = project.workspace.results.find(item => item.resultId === previousResultId);
        setDifferences(previous ? scientificSubrectangleDifferences(previous, result) : "");
        setMessage("Sources verified");
      }
    }).catch(error => { if (active) setMessage((error as Error).message); });
    return () => { active = false; };
  }, [project?.identity.id, project?.identity.structuralHash,
    reference?.targetId, reference?.kind === "result" ? reference.resultHash : undefined,
    previousResultId]);
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
  const rerun = () => {
    if (!project || !reference || !workbookId || busy) return;
    const requestId = crypto.randomUUID();
    const completed = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; message?: string;
        error?: string }>).detail;
      if (detail?.requestId !== requestId) return;
      window.removeEventListener("math3d:subrectangle-rerun-complete", completed);
      setBusy(false);
      setMessage(detail.error ? `Rerun blocked: ${detail.error}` :
        "New result revision published; the original report remains in the Workbook. " +
        (detail.message ?? ""));
    };
    window.setTimeout(() => {
      setBusy(true); setReport("");
      setMessage("Rerunning saved physical bounds from verified sources…");
      window.addEventListener("math3d:subrectangle-rerun-complete", completed);
      window.dispatchEvent(new CustomEvent("math3d:subrectangle-rerun", { detail: {
        requestId, projectId: project.identity.id, resultId: reference.targetId, workbookId } }));
    }, 0);
  };
  return <section data-testid="scientific-subrectangle-workbook-report">
    <p role="status">{message}</p>
    {report && <div dangerouslySetInnerHTML={{ __html: renderNotebookMarkdown(report) }} />}
    {differences && <div data-testid="scientific-subrectangle-differences"
      dangerouslySetInnerHTML={{ __html: renderNotebookMarkdown(differences) }} />}
    <button type="button" disabled={!project || !reference || busy} onClick={() => { void exportReport(); }}>Verify and export report</button>
    {workbookId &&
      <button type="button" data-testid="scientific-subrectangle-rerun"
        disabled={!project || !reference || busy} onClick={rerun}>Rerun from verified sources</button>}
  </section>;
};
