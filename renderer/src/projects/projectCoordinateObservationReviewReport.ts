import type { Math3DProject } from "@math3d/core";
import { buildProjectCoordinateObservationReview } from "./projectCoordinateObservationReview";
import type { ProjectResourceReader } from "./projectResources";

export function createProjectCoordinateObservationReviewSnapshot(project: Math3DProject, readResource: ProjectResourceReader) {
  return { format: "math3d.coordinate-observation-review/v1" as const, projectId: project.identity.id,
    projectRevision: project.identity.revision, rows: buildProjectCoordinateObservationReview(project, readResource) };
}
const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function projectCoordinateObservationReviewHtml(snapshot: ReturnType<typeof createProjectCoordinateObservationReviewSnapshot>) {
  const rows = snapshot.rows.map(row => `<article><h2>${esc(row.title)} · ${esc(row.status)}</h2>
    <p>Note ${esc(row.noteId)} r${row.noteRevision} · <code>${esc(row.noteHash)}</code><br>
    Comparison ${esc(row.compositionTitle ?? row.compositionId)} · <code>${esc(row.compositionId)}</code> · <code>${esc(row.compositionHash)}</code><br>
    ${row.sources.map(source => `${source.slot}: ${esc(source.id)} r${source.revision} · <code>${esc(source.hash)}</code>`).join("<br>")}</p>
    <p>Recorded source ${row.sourceSlot} · frame ${esc(row.frame)} · unit ${esc(row.unit)}</p>
    ${row.status === "current" && row.point && row.body !== null ? `<p>Shared coordinate: ${esc(row.point.join(", "))} ${esc(row.unit)}</p><p>${esc(row.body)}</p>
      <p>No matching target element or measured value is inferred.</p>` : `<p>Unavailable: ${esc(row.reason ?? "Exact evidence did not verify.")} Coordinate and observation text withheld.</p>`}</article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Coordinate observation review</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:1000px;margin:auto;padding:24px;color:#172033}article{border-top:1px solid #94a3b8;padding:12px 0}code{overflow-wrap:anywhere}</style></head><body><main><h1>Coordinate observation review</h1><p>Project <code>${esc(snapshot.projectId)}</code> r${snapshot.projectRevision} · ${esc(snapshot.format)}</p><p>Authored positions in saved comparisons. Hashes verify saved bytes, not producer claims.</p>${rows || "<p>No coordinate observations saved.</p>"}</main></body></html>`;
}
