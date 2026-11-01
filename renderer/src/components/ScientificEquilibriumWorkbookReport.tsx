import React, { useEffect, useRef, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { scientificEquilibriumReportMarkdown,
  verifyScientificEquilibriumReport } from "../projects/scientificEquilibriumWorkbook";
import { renderNotebookMarkdown } from "../workbook/notebookContent";

export const ScientificEquilibriumWorkbookReport: React.FC<{
  project?: Math3DProject | null; reference?: NotebookReference;
}> = ({ project, reference }) => {
  const [markdown, setMarkdown] = useState("");
  const [message, setMessage] = useState("Checking equilibrium source…");
  const [busy, setBusy] = useState(false);
  const verificationEpoch = useRef(0);
  useEffect(() => {
    let active = true;
    ++verificationEpoch.current;
    setMarkdown("");
    if (!project || !reference) { setMessage("Open the named Project to verify this report.");
      return () => { active = false; }; }
    setBusy(true); setMessage("Checking equilibrium source and solver statistics…");
    void verifyScientificEquilibriumReport(project, reference).then(checked => {
      if (active) { setMarkdown(scientificEquilibriumReportMarkdown(checked));
        setMessage("Source and equilibrium statistics verified"); }
    }).catch(cause => { if (active) setMessage(
      `Equilibrium values withheld: ${(cause as Error).message}`); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [project, reference]);
  const exportReport = async () => {
    if (!project || !reference || busy) return;
    const epoch = verificationEpoch.current;
    setBusy(true); setMarkdown("");
    try {
      const checked = await verifyScientificEquilibriumReport(project, reference);
      if (epoch !== verificationEpoch.current) return;
      const report = scientificEquilibriumReportMarkdown(checked);
      const url = URL.createObjectURL(new Blob([report], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `equilibrium-solver-${checked.resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}.md`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMarkdown(report); setMessage("Source reverified; equilibrium report exported.");
    } catch (cause) { if (epoch === verificationEpoch.current)
      setMessage(`Export withheld: ${(cause as Error).message}`); }
    finally { if (epoch === verificationEpoch.current) setBusy(false); }
  };
  return <section data-testid="scientific-equilibrium-workbook-report">
    <p role="status">{message}</p>
    <button type="button" disabled={!project || !reference || busy}
      onClick={() => void exportReport()}>Verify and export equilibrium report</button>
    {markdown && <div dangerouslySetInnerHTML={{ __html: renderNotebookMarkdown(markdown) }} />}
  </section>;
};
