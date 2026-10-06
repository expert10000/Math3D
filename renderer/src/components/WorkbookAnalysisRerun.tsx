import React, { useEffect, useRef, useState } from "react";
import { inspectNotebookReference, type NotebookReference } from "@math3d/workbook";
import type { NotebookProjectContext } from "../workbook/notebookProjectContext";
import { notebookRerunSupported } from "../workbook/notebookRerun";

export const WorkbookAnalysisRerun = ({ context, reference, onRelink }: { context: NotebookProjectContext | null; reference: NotebookReference; onRelink: (reference: NotebookReference) => void }) => {
  const [message, setMessage] = useState(""), [next, setNext] = useState<NotebookReference | null>(null), [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { controller.current?.abort(); setNext(null); setMessage(""); return () => controller.current?.abort(); }, [reference.targetId, reference.source.structuralHash]);
  const inspection = context && inspectNotebookReference(context.project, reference);
  if (!context?.live || !context.rerunAnalysis || inspection?.status !== "stale" || !notebookRerunSupported(inspection.result)) return null;
  return <div data-testid="workbook-analysis-rerun">
    <button disabled={running} onClick={async () => {
      const request = new AbortController(); controller.current = request; setRunning(true); setNext(null);
      try { const published = await context.rerunAnalysis!(reference, request.signal); setNext(published); setMessage("New result published. Historical citations stay unchanged until you relink this cell."); }
      catch (cause) { setMessage((cause as Error).message); }
      finally { setRunning(false); }
    }}>Rerun stale analysis</button>
    {running && <button onClick={() => controller.current?.abort()}>Cancel rerun</button>}
    {message && <p role="status">{message}</p>}
    {next && <button data-testid="workbook-analysis-relink" onClick={() => onRelink(next)}>Relink this cell to published result</button>}
  </div>;
};
