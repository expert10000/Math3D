import React, { useEffect, useMemo, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { scientificSubrectangleDifferences, scientificSubrectangleReportMarkdown,
  inspectScientificSubrectangleReport, subrectangleSourcesCurrent,
  takeJustCreatedScientificSubrectangleReport } from
  "../projects/scientificSubrectangleWorkbook";
import { scientificSubrectangleChartSvg,
  type ScientificSubrectangleChart } from
  "../projects/scientificSubrectangleChart";
import { renderNotebookMarkdown } from "../workbook/notebookContent";

export const ScientificSubrectangleWorkbookReport: React.FC<{
  project: Math3DProject | null; reference: NotebookReference | undefined;
  workbookId?: string; previousResultId?: string;
}> = ({ project, reference, workbookId, previousResultId }) => {
  const [report, setReport] = useState("");
  const [chart, setChart] = useState<ScientificSubrectangleChart | null>(null);
  const [message, setMessage] = useState("Checking verified sources…");
  const [busy, setBusy] = useState(false);
  const [differences, setDifferences] = useState("");
  const reportHtml = useMemo(() => report ? renderNotebookMarkdown(report) : "", [report]);
  const chartSvg = useMemo(() => chart ? scientificSubrectangleChartSvg(chart) : "", [chart]);
  const differencesHtml = useMemo(() => differences ?
    renderNotebookMarkdown(differences) : "", [differences]);
  useEffect(() => {
    let active = true;
    setReport("");
    setChart(null);
    setDifferences("");
    setMessage("Checking verified sources…");
    if (!project || !reference) { setMessage("Open the named Project to verify this report."); return; }
    const primed = takeJustCreatedScientificSubrectangleReport(project, reference);
    void (primed ? Promise.resolve(primed) :
      inspectScientificSubrectangleReport(project, reference)).then(({ result,
      status, chart: checkedChart }) => {
      if (active) {
        setChart(checkedChart);
        if (subrectangleSourcesCurrent(status)) {
          setReport(scientificSubrectangleReportMarkdown(result));
          const previous = project.workspace.results.find(item => item.resultId === previousResultId);
          setDifferences(previous ? scientificSubrectangleDifferences(previous, result) : "");
          setMessage("Sources verified; profile rows verified");
        } else setMessage("Some profile values are withheld; current fields remain in the chart.");
      }
    }).catch(error => { if (active) setMessage((error as Error).message); });
    return () => { active = false; };
  }, [project?.identity.id,
    reference?.targetId, reference?.kind === "result" ? reference.resultHash : undefined,
    previousResultId]);
  const exportReport = async () => {
    if (!project || !reference || busy) return;
    setBusy(true);
    setReport(""); setChart(null);
    setMessage("Rechecking sources before export…");
    try {
      const { result, status, chart: checkedChart } =
        await inspectScientificSubrectangleReport(project, reference);
      if (!subrectangleSourcesCurrent(status))
        throw new TypeError("Report values withheld: one or more saved sources or profile rows changed.");
      const markdown = scientificSubrectangleReportMarkdown(result);
      const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url; link.download = `scientific-subrectangle-${result.resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.report.md`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setReport(markdown);
      setChart(checkedChart);
      setMessage("Sources verified; report exported.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  const exportChart = async () => {
    if (!project || !reference || busy) return;
    setBusy(true); setChart(null);
    setMessage("Rechecking sources and profile rows before chart export…");
    try {
      const { chart: checkedChart } = await inspectScientificSubrectangleReport(
        project, reference);
      if (!checkedChart.fields.some(field => field.status === "source-current"))
        throw new TypeError("No verified profile values are available to export.");
      const svg = scientificSubrectangleChartSvg(checkedChart);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `scientific-subrectangle-${checkedChart.resultId.replace(
        /[^a-zA-Z0-9_-]/g, "-")}.chart.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setChart(checkedChart);
      setMessage(checkedChart.fields.every(field => field.status === "source-current") ?
        "Sources verified; profile rows verified; chart exported." :
        "Chart exported with changed fields withheld.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  const rerun = () => {
    if (!project || !reference || !workbookId || busy) return;
    const requestId = crypto.randomUUID();
    const progress = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string;
        message: string }>).detail;
      if (detail?.requestId === requestId) setMessage(detail.message);
    };
    const completed = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; message?: string;
        error?: string }>).detail;
      if (detail?.requestId !== requestId) return;
      window.removeEventListener("math3d:subrectangle-rerun-complete", completed);
      window.removeEventListener("math3d:subrectangle-rerun-progress", progress);
      setBusy(false);
      setMessage(detail.error ? `Rerun blocked: ${detail.error}` :
        "New result revision published; the original report remains in the Workbook. " +
        (detail.message ?? ""));
    };
    window.setTimeout(() => {
      setBusy(true); setReport(""); setChart(null);
      setMessage("Rerunning saved physical bounds from verified sources…");
      window.addEventListener("math3d:subrectangle-rerun-complete", completed);
      window.addEventListener("math3d:subrectangle-rerun-progress", progress);
      window.dispatchEvent(new CustomEvent("math3d:subrectangle-rerun", { detail: {
        requestId, projectId: project.identity.id, resultId: reference.targetId, workbookId } }));
    }, 0);
  };
  return <section data-testid="scientific-subrectangle-workbook-report">
    <p role="status">{message}</p>
    <button type="button" disabled={!project || !reference || busy} onClick={() => { void exportReport(); }}>Verify and export report</button>
    <button type="button" data-testid="scientific-subrectangle-export-chart"
      disabled={!project || !reference || busy}
      onClick={() => { void exportChart(); }}>Verify and export chart (SVG)</button>
    {workbookId &&
      <button type="button" data-testid="scientific-subrectangle-rerun"
        disabled={!project || !reference || busy} onClick={rerun}>Rerun from verified sources</button>}
    {report && <div dangerouslySetInnerHTML={{ __html: reportHtml }} />}
    {chart && <section aria-label="Source-linked profile chart"
      data-testid="scientific-subrectangle-profile-chart">
      <h4>Source-linked profile chart</h4>
      <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{
        __html: chartSvg }} />
      <ul>{chart.fields.map(field => <li key={field.key}>
        {field.label}: {field.status === "source-current" ?
          `${field.column!.yUnit}; ${field.column!.rows.filter(row => row.y === null).length} column gaps, ${field.row!.rows.filter(row => row.y === null).length} row gaps` :
          `values withheld (${field.status})`}
      </li>)}</ul>
    </section>}
    {differences && <div data-testid="scientific-subrectangle-differences"
      dangerouslySetInnerHTML={{ __html: differencesHtml }} />}
  </section>;
};
