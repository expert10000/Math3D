import React, { useState } from "react";
import { inspectWorkbookComparisonReference, type WorkbookComparisonReference } from "@math3d/workbook";
import type { Math3DProject } from "@math3d/core";
import type { ProjectResourceReader } from "../projects/projectResources";

const ComparisonPreview = React.lazy(() => import("./WorkbookComparisonPreview"));
type Props = { project: Math3DProject | null; reference: WorkbookComparisonReference; readResource?: ProjectResourceReader };

/** A non-owning checked link. The renderers and source arrays load only when expanded. */
export const WorkbookComparisonBlock: React.FC<Props> = ({ project, reference, readResource }) => {
  const [open, setOpen] = useState(false);
  let inspection: ReturnType<typeof inspectWorkbookComparisonReference>;
  try { inspection = inspectWorkbookComparisonReference(project, reference); }
  catch { return <p role="alert">Invalid saved comparison reference.</p>; }
  const ready = inspection.status === "current" && !!project && !!inspection.composition && !!readResource;
  return <section data-testid="workbook-comparison-link" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, minWidth: 0 }}>
    <strong>Saved Project comparison · {inspection.composition?.title ?? reference.compositionId}</strong>
    <div role={inspection.status === "current" ? "status" : "alert"}>
      {inspection.status === "current" ? "Exact composition and source generations referenced; open to verify source data" :
        `Comparison ${inspection.status}: the exact saved composition or source generation cannot be opened.`}
    </div>
    <small>Project {reference.projectId} · composition {reference.compositionHash.slice(0, 16)}… · source data stays in its Project documents.</small>
    {ready && <details onToggle={event => setOpen(event.currentTarget.open)}><summary>Show embedded comparison</summary>
      {open && <React.Suspense fallback={<p role="status">Loading comparison viewer…</p>}>
        <ComparisonPreview project={project} composition={inspection.composition!} readResource={readResource} />
      </React.Suspense>}
    </details>}
  </section>;
};
