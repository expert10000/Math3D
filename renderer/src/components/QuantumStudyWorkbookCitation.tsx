import { useCallback, useEffect, useRef, useState } from "react";
import type { Math3DProject } from "@math3d/core";
import type { NotebookReference, WorkbookQuantumStudyEvidence } from "@math3d/workbook";
import { inspectQuantumStudyWorkbookEvidence,
  normalizeQuantumStudyWorkbookEvidence } from "../projects/quantumStudyWorkbook";

type Inspection = Awaited<ReturnType<typeof inspectQuantumStudyWorkbookEvidence>>;

/** This block never renders the historical snapshot's values until exact source read-back succeeds. */
export function QuantumStudyWorkbookCitation({ project, reference, evidence }: {
  project: Math3DProject | null; reference: NotebookReference | undefined;
  evidence: WorkbookQuantumStudyEvidence | undefined;
}) {
  const saved = normalizeQuantumStudyWorkbookEvidence(evidence);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const check = useCallback(async () => {
    const current = ++epoch.current;
    setBusy(true); setInspection(null);
    try {
      const result = await inspectQuantumStudyWorkbookEvidence(project, reference, evidence);
      if (epoch.current === current) setInspection(result);
    } catch (error) { if (epoch.current === current) setInspection({ status: "withheld", report: null, saved,
      omissions: [`Source verification failed: ${String((error as Error).message)}`] }); }
    finally { if (epoch.current === current) setBusy(false); }
  }, [project, reference, evidence]);
  useEffect(() => { void check(); return () => { epoch.current++; }; }, [check]);
  return <section data-testid="workbook-quantum-study-citation" aria-label="Verified quantum Study citation">
    <h5>Selected quantum Study evidence</h5>
    <p>Saved Study {saved?.studyId ?? "unavailable"} · {saved?.snapshot.templateId ?? "unknown"}</p>
    {saved && <>
      <p>Saved run {saved.snapshot.runId} · result SHA-256 {saved.snapshot.resultSha256}</p>
      {saved.snapshot.sources.map(source => <p key={source.role}>{source.role} saved source fingerprint {source.sceneFingerprint} ·
        {source.datasets.map(dataset => `${dataset.id}: ${dataset.sha256} (${dataset.unit})`).join("; ")}</p>)}
    </>}
    {busy && <p role="status">Rechecking the cited Study and exact bundles…</p>}
    {inspection && <div data-testid="workbook-quantum-citation-status" data-status={inspection.status}>
      <strong>{inspection.status === "current" ? "Current verified citation" : "Values withheld"}</strong>
      {inspection.report && Object.entries(inspection.report.values).map(([role, value]) =>
        <pre key={role} data-testid={`workbook-quantum-value-${role}`} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {role}: {JSON.stringify(value, null, 2)}</pre>)}
      {inspection.omissions.map((reason, index) => <p key={index} role="status"
        data-testid="workbook-quantum-omission">Omitted: {reason}</p>)}
    </div>}
    <button type="button" disabled={busy} data-testid="workbook-quantum-recheck" onClick={() => void check()}>
      Recheck citation</button>
  </section>;
}
