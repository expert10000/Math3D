import type { Math3DProject } from "@math3d/core";
import { normalizeWorkbookCoordinateReviewReference, type WorkbookCoordinateReviewReference } from "@math3d/workbook";
import { buildProjectCoordinateObservationReview } from "./projectCoordinateObservationReview";
import type { ProjectResourceReader } from "./projectResources";

/** Resolve each pinned Note independently; never expose a coordinate or authored text from changed evidence. */
export function inspectWorkbookCoordinateReview(project: Math3DProject | null,
  value: WorkbookCoordinateReviewReference, readResource?: ProjectResourceReader) {
  const reference = normalizeWorkbookCoordinateReviewReference(value);
  const rows = project && project.identity.id === reference.projectId && readResource
    ? buildProjectCoordinateObservationReview(project, readResource) : [];
  return { reference, entries: reference.notes.map(item => {
    const row = rows.find(candidate => candidate.noteId === item.noteId);
    const reason = !project ? "Project unavailable." : project.identity.id !== reference.projectId
      ? "Different Project." : !readResource ? "Verified source bytes unavailable."
        : !row ? "Saved coordinate Note unavailable."
          : row.noteRevision !== item.revision || row.noteHash !== item.hash || row.title !== item.title ||
            row.compositionId !== item.compositionId || row.compositionHash !== item.compositionHash
            ? "Pinned Note or comparison changed." : row.status !== "current"
              ? row.reason ?? "Exact source evidence unavailable." : null;
    return { noteId: item.noteId, noteRevision: item.revision, noteHash: item.hash,
      title: item.title, compositionId: item.compositionId, compositionHash: item.compositionHash,
      status: reason ? "unavailable" as const : "verified" as const, reason,
      evidence: reason ? null : row! };
  }) };
}

const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function workbookCoordinateReviewHtml(snapshot: ReturnType<typeof inspectWorkbookCoordinateReview>) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Saved coordinate review</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:1000px;margin:auto;padding:24px;color:#172033}article{border-top:1px solid #94a3b8;padding:12px 0}code{overflow-wrap:anywhere}</style></head><body><main><h1>Saved coordinate review</h1><p>Project <code>${esc(snapshot.reference.projectId)}</code>. Saved evidence only; no element matching or measured value inferred.</p>${snapshot.entries.map(entry =>
    `<article><h2>${esc(entry.title)} · ${esc(entry.status)}</h2><p>Note ${esc(entry.noteId)} r${entry.noteRevision} · <code>${esc(entry.noteHash)}</code><br>Comparison ${esc(entry.compositionId)} · <code>${esc(entry.compositionHash)}</code></p>${entry.evidence && entry.status === "verified" ?
      `<p>Shared coordinate ${esc(entry.evidence.point?.join(", "))} ${esc(entry.evidence.unit)} · frame ${esc(entry.evidence.frame)} · source ${esc(entry.evidence.sourceSlot)}</p><p>${esc(entry.evidence.body)}</p><p>${entry.evidence.sources.map(source => `${source.slot}: ${esc(source.id)} r${source.revision} · <code>${esc(source.hash)}</code>`).join("<br>")}</p>` :
      `<p>Unavailable: ${esc(entry.reason)} Coordinate and observation text withheld.</p>`}</article>`).join("")}</main></body></html>`;
}
