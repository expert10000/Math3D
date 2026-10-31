import { inspectProjectNoteAnchor, qualifyProjectOverlayCoordinates, structuralHash, type Math3DProject, type ProjectComposition } from "@math3d/core";
import { verifyProjectCompositionEvidenceSources } from "./projectCompositionEvidenceSource";
import type { ProjectResourceReader } from "./projectResources";

export type ComparisonEvidenceSelection = Readonly<{
  memberId: string; revision: number; hash: string;
  point: Readonly<{ x: number; y: number; z: number }>;
  uv?: Readonly<{ u: number; v: number }>;
  meshKey?: string; faceIndex?: number;
}>;

/** A report of checked saved bytes and a captured *view*, never a copied scientific source. */
export function createProjectComparisonEvidence(project: Math3DProject, composition: ProjectComposition,
  readResource: ProjectResourceReader, selection: ComparisonEvidenceSelection | null = null) {
  const saved = project.compositions?.find(item => item.id === composition.id);
  if (!saved || structuralHash(saved) !== structuralHash(composition)) throw new TypeError("Save the exact comparison before exporting evidence.");
  const resolved = verifyProjectCompositionEvidenceSources(project, composition, readResource);
  const vertices = resolved.reduce((total, member) => total + member.vertexCount, 0);
  if (vertices > 500_000) throw new TypeError("Comparison exceeds the bounded 500,000-vertex preview limit.");
  let alignment: "source-declared match" | "operator assertion" | "not applicable" = "not applicable";
  if (composition.mode === "overlay") {
    if (composition.members.some(member => project.workspace.entries.find(entry => entry.expected.id === member.documentId)?.module === "surface"))
      throw new TypeError("Surface overlays are unavailable.");
    const status = qualifyProjectOverlayCoordinates(resolved[0]!.coordinates, resolved[1]!.coordinates, composition.alignment!);
    if (status === "invalid" || status === "mismatch") throw new TypeError("Overlay source coordinate declarations are invalid or mismatched.");
    alignment = status === "verified" ? "source-declared match" : "operator assertion";
  }
  if (selection && (!resolved.some(member => member.id === selection.memberId && member.revision === selection.revision && member.hash === selection.hash) ||
    !Object.values(selection.point).every(Number.isFinite) || selection.uv && !Object.values(selection.uv).every(Number.isFinite)))
    throw new TypeError("Selected value no longer belongs to an exact comparison source.");
  const compositionHash = structuralHash(composition);
  const observations = (project.notes ?? []).filter(note => note.anchor?.kind === "comparison" && note.anchor.compositionId === composition.id).map(note => {
    const state = inspectProjectNoteAnchor(note, { projectId: project.identity.id, source: () => null,
      comparison: () => ({ hash: compositionHash, members: [composition.members[0].expected, composition.members[1].expected],
        alignment, available: true }) });
    if (state.status !== "current") throw new TypeError(`Comparison observation is ${state.status}; reopen or repair its exact source before export.`);
    return { noteId: note.identity.id, noteRevision: note.identity.revision, noteHash: note.identity.structuralHash,
      title: note.title, body: note.body };
  });
  return {
    schemaVersion: 1 as const, projectId: project.identity.id, compositionId: composition.id, compositionHash,
    title: composition.title, mode: composition.mode, alignment,
    alignmentFrame: composition.alignment?.frame ?? null, alignmentUnit: composition.alignment?.unit ?? null,
    members: resolved.map((member, index) => ({ slot: index === 0 ? "A" as const : "B" as const, documentId: member.id,
      title: project.metadata.documents?.[member.id]?.title ?? member.id, revision: member.revision, structuralHash: member.hash, generation: member.generation,
      unit: member.unit, visible: composition.members[index]!.visible })),
    selection: selection ? { ...selection, coordinateMeaning: selection.uv ? "source-defined surface chart (u,v) and display-derived local xyz" : "display-derived local xyz; no cross-source correspondence inferred" } : null,
    observations,
    qualification: "Captured views and viewer-picked coordinates are display derivations of verified saved sources, not copied source samples or proof of scientific equivalence. Hashes verify saved bytes, not producer claims.",
  };
}
export type ProjectComparisonEvidence = ReturnType<typeof createProjectComparisonEvidence>;

const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function projectComparisonEvidenceHtml(evidence: ProjectComparisonEvidence, views: readonly string[]): string {
  const expected = evidence.mode === "overlay" ? 1 : 2;
  if (views.length !== expected || views.some(image => !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 4_000_000))
    throw new TypeError("All comparison view captures must be present and bounded.");
  const members = evidence.members.map(member => `<tr><th>${member.slot}</th><td>${esc(member.title)}<br>${esc(member.documentId)}</td><td>r${member.revision} · ${esc(member.generation)}<br><code>${esc(member.structuralHash)}</code></td><td>${esc(member.unit ?? "not recorded")}</td></tr>`).join("");
  const selected = evidence.selection ? `<p>Selected ${esc(evidence.selection.memberId)} · r${evidence.selection.revision} · <code>${esc(evidence.selection.hash)}</code><br>Local xyz: ${esc(JSON.stringify(evidence.selection.point))}${evidence.selection.uv ? `<br>Source-defined chart (u,v): ${esc(JSON.stringify(evidence.selection.uv))}` : ""}${evidence.selection.meshKey ? `<br>Display mesh: ${esc(evidence.selection.meshKey)}` : ""}${evidence.selection.faceIndex !== undefined ? `<br>Display face: ${esc(evidence.selection.faceIndex)}` : ""}<br>${esc(evidence.selection.coordinateMeaning)}</p>` : "<p>No sample selected.</p>";
  const observations = evidence.observations.map(note => `<article><h3>${esc(note.title)}</h3><p>${esc(note.body)}</p><small>Note ${esc(note.noteId)} · r${note.noteRevision} · <code>${esc(note.noteHash)}</code></small></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${esc(evidence.title)} · comparison evidence</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;color:#172033}table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:8px;text-align:left;overflow-wrap:anywhere}code{overflow-wrap:anywhere}figure{margin:16px 0}img{max-width:100%;border:1px solid #94a3b8}section{break-inside:avoid}@media print{body{padding:0}}</style></head><body><main><h1>${esc(evidence.title)}</h1><p>Saved Project comparison · ${esc(evidence.mode)} · alignment: <strong>${esc(evidence.alignment)}</strong>${evidence.alignmentFrame ? ` · ${esc(evidence.alignmentFrame)} / ${esc(evidence.alignmentUnit)}` : ""}</p><p>Project <code>${esc(evidence.projectId)}</code><br>Composition <code>${esc(evidence.compositionId)}</code> · <code>${esc(evidence.compositionHash)}</code></p><section><h2>Exact saved sources</h2><table><thead><tr><th>Slot</th><th>Document</th><th>Generation and hash</th><th>Unit</th></tr></thead><tbody>${members}</tbody></table></section><section><h2>Captured views</h2>${views.map((image, index) => `<figure><img src="${image}" alt="${evidence.mode === "overlay" ? "Overlay" : index === 0 ? "A" : "B"} comparison view"><figcaption>${evidence.mode === "overlay" ? "Overlay" : index === 0 ? "A" : "B"} · saved-source view at export</figcaption></figure>`).join("")}</section><section><h2>Selected viewer value</h2>${selected}</section><section><h2>Saved observations</h2><p>Observations are authored Notes, not independent scientific measurements.</p>${observations || "<p>No observations saved.</p>"}</section><p>${esc(evidence.qualification)}</p><details><summary>Machine-readable evidence</summary><pre>${esc(JSON.stringify(evidence, null, 2))}</pre></details></main></body></html>`;
}
