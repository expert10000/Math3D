import { structuralHash, type Math3DProject, type ProjectSavedMeshComparison } from "@math3d/core";
import type { ProjectResourceReader } from "./projectResources";
import { inspectSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import { inspectProjectSavedMeshComparisonNote } from "./projectSavedMeshComparisonNotes";

type SideReference = ProjectSavedMeshComparison["a"];
export type MeshReviewObservation = {
  noteId: string; noteRevision: number; noteHash: string;
  status: "verified" | "unavailable"; reason: string;
  title?: string; body?: string;
};
export type MeshReviewEntry = {
  comparisonId: string; comparisonHash: string; title: string; metricPath: string;
  a: SideReference; b: SideReference;
  status: "verified" | "unavailable"; reason: string;
  values: { a: number; b: number; difference: number; unit: string } | null;
  observations: MeshReviewObservation[];
};
export type SavedMeshComparisonReviewSnapshot = {
  format: "mesh-comparison-review/v1";
  project: { id: string; revision: number; hash: string; title: string };
  entries: MeshReviewEntry[];
};

/** Captures exact references and only values/Note text whose sources verify now. */
export function createSavedMeshComparisonReviewSnapshot(project: Math3DProject,
  readResource: ProjectResourceReader): SavedMeshComparisonReviewSnapshot {
  const entries = (project.savedMeshComparisons ?? []).map((pair): MeshReviewEntry => {
    const linked = (project.notes ?? []).filter(note => note.anchor?.kind === "saved-mesh-comparison" && note.anchor.comparisonId === pair.id);
    const base = { comparisonId: pair.id, comparisonHash: structuralHash(pair), title: pair.title,
      metricPath: pair.metricPath, a: pair.a, b: pair.b };
    try {
      const evidence = inspectSavedMeshPinnedComparison(project, pair, readResource);
      const metric = evidence.metrics.find(item => item.path === pair.metricPath && item.difference !== null);
      if (!metric || metric.a === null || metric.b === null || metric.difference === null || !metric.unit)
        throw new TypeError("The selected scalar metric has no verified, qualified values.");
      const observations = linked.map((note): MeshReviewObservation => {
        const reference = { noteId: note.identity.id, noteRevision: note.identity.revision, noteHash: note.identity.structuralHash };
        const state = inspectProjectSavedMeshComparisonNote(project, note, readResource);
        return state.status === "current" ? { ...reference, status: "verified", reason: state.reason,
          title: note.title, body: note.body } : { ...reference, status: "unavailable", reason: state.reason };
      });
      return { ...base, status: "verified", reason: "Both exact saved results and Mesh sidecars verify.",
        values: { a: metric.a, b: metric.b, difference: metric.difference, unit: metric.unit }, observations };
    } catch (error) {
      return { ...base, status: "unavailable", reason: (error as Error).message, values: null,
        observations: linked.map(note => ({ noteId: note.identity.id, noteRevision: note.identity.revision,
          noteHash: note.identity.structuralHash, status: "unavailable", reason: "The comparison evidence is unavailable." })) };
    }
  });
  return { format: "mesh-comparison-review/v1", project: { id: project.identity.id,
    revision: project.identity.revision, hash: structuralHash(project), title: project.metadata.title }, entries };
}

/** A self-contained status report; unavailable evidence never contributes values or Note text. */
export function savedMeshComparisonReviewHtml(snapshot: SavedMeshComparisonReviewSnapshot): string {
  const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const entryHtml = snapshot.entries.map(entry => `<article><h2>${esc(entry.title)}</h2>
    <p><strong>${entry.status === "verified" ? "Verified" : "Unavailable"}</strong> · ${esc(entry.reason)}</p>
    <p>Comparison ${esc(entry.comparisonId)} · <code>${esc(entry.comparisonHash)}</code><br>
    Metric ${esc(entry.metricPath)}<br>
    A: result ${esc(entry.a.resultId)} · <code>${esc(entry.a.resultHash)}</code> · Mesh ${esc(entry.a.meshId)} r${esc(entry.a.revision)} · <code>${esc(entry.a.sourceHash)}</code><br>
    B: result ${esc(entry.b.resultId)} · <code>${esc(entry.b.resultHash)}</code> · Mesh ${esc(entry.b.meshId)} r${esc(entry.b.revision)} · <code>${esc(entry.b.sourceHash)}</code></p>
    ${entry.values ? `<table><thead><tr><th>A</th><th>B</th><th>B − A</th><th>Unit</th></tr></thead><tbody><tr><td>${esc(entry.values.a)}</td><td>${esc(entry.values.b)}</td><td>${esc(entry.values.difference)}</td><td>${esc(entry.values.unit)}</td></tr></tbody></table>` : "<p>Values withheld: exact evidence is unavailable.</p>"}
    <h3>Authored observations (${entry.observations.filter(note => note.status === "verified").length} verified / ${entry.observations.length} saved)</h3>
    ${entry.observations.map(note => note.status === "verified" ? `<section><h4>${esc(note.title)}</h4><p>${esc(note.body)}</p><small>${esc(note.noteId)} · r${esc(note.noteRevision)} · <code>${esc(note.noteHash)}</code></small></section>` :
    `<p>Note ${esc(note.noteId)} unavailable · ${esc(note.reason)}. Text withheld.</p>`).join("") || "<p>No observations saved.</p>"}</article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Saved Mesh comparison review</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:auto;padding:24px;color:#172033}article{border:1px solid #94a3b8;border-radius:8px;padding:16px;margin:16px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #94a3b8;padding:8px;text-align:left}code,pre,p{overflow-wrap:anywhere}</style></head><body><h1>Saved Mesh comparison review</h1><p>Project ${esc(snapshot.project.title)} · ${esc(snapshot.project.id)} r${esc(snapshot.project.revision)} · <code>${esc(snapshot.project.hash)}</code></p><p>Verified values come from saved scalar results only. Authored observations are interpretations, not independent measurements. Unavailable references are listed without values or Note text. No Mesh calculation or interpolation was performed for this report.</p>${entryHtml || "<p>No saved Mesh comparisons.</p>"}<details><summary>Versioned review snapshot</summary><pre>${esc(JSON.stringify(snapshot, null, 2))}</pre></details></body></html>`;
}
