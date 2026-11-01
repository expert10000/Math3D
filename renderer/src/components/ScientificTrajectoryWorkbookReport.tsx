import React, { useEffect, useRef, useState } from "react";
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
  const verificationEpoch = useRef(0);
  useEffect(() => {
    let active = true;
    ++verificationEpoch.current;
    setMarkdown("");
    if (!project || !reference) { setMessage("Open the named Project to verify this report.");
      return () => { active = false; }; }
    setBusy(true); setMessage("Checking trajectory source and solver statistics…");
    void verifyScientificTrajectoryReport(project, reference).then(checked => {
      if (active) { setMarkdown(scientificTrajectoryReportMarkdown(checked));
        setMessage("Source and solver statistics verified"); }
    }).catch(cause => { if (active) setMessage(
      `Solver values withheld: ${(cause as Error).message}`); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [project, reference]);
  const exportReport = async () => {
    if (!project || !reference || busy) return;
    const epoch = verificationEpoch.current;
    setBusy(true); setMarkdown("");
    try {
      const checked = await verifyScientificTrajectoryReport(project, reference);
      if (epoch !== verificationEpoch.current) return;
      const report = scientificTrajectoryReportMarkdown(checked);
      const url = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `trajectory-solver-${checked.resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.md`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMarkdown(report); setMessage("Source reverified; solver report exported.");
    } catch (cause) { if (epoch === verificationEpoch.current)
      setMessage(`Export withheld: ${(cause as Error).message}`); }
    finally { if (epoch === verificationEpoch.current) setBusy(false); }
  };
  return <section data-testid="scientific-trajectory-workbook-report">
    <p role="status">{message}</p>
    <button type="button" disabled={!project || !reference || busy}
      onClick={exportReport}>Verify and export solver report</button>
    {markdown && <div dangerouslySetInnerHTML={{
      __html: renderNotebookMarkdown(markdown) }} />}
  </section>;
};
