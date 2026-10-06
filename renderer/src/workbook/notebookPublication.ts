import { canonicalJsonStringify, encodeProjectResourceBytes, sha256Checksum, structuralHash, upsertMath3DProjectWorkbook, type Math3DProject } from "@math3d/core";
import { assessWorkbookClaim, inspectNotebookProvenance, normalizeNotebookReference, workbookSnapshotQualification, type NotebookArtifactReader, type NotebookReference, type Workbook } from "@math3d/workbook";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, type ProjectResourceReader, type VerifiedProjectResources } from "../projects/projectResources";
import { projectNoteRenderedBody } from "../projects/projectNoteValues";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";

export const notebookPublicationManifest = (books: readonly Workbook[], project: Math3DProject | null, reader?: NotebookArtifactReader, selected?: readonly string[]) => {
  const citations = new Map<string, NotebookReference>();
  const blocks = books.flatMap(book => book.stages.flatMap(stage => stage.blocks.filter(block => !selected || selected.includes(block.id)).map(block => {
    const cite = (reference: NotebookReference) => { if (!normalizeNotebookReference(reference)) throw new TypeError("Invalid publication citation."); citations.set(canonicalJsonStringify(reference), reference); };
    if (block.notebookReference) cite(block.notebookReference);
    for (const edge of book.dependencies?.filter(edge => edge.targetBlockId === block.id) ?? []) if (edge.source.kind === "project") cite(edge.source.reference);
    for (const item of block.claim?.evidence ?? []) if (item.kind === "result") cite(item.reference); else {
      const sourceBlock = book.stages.flatMap(s => s.blocks).find(b => b.id === item.blockId), snapshot = item.slot === "A" ? sourceBlock?.visualize?.snapshotA ?? sourceBlock?.visualize?.snapshot : sourceBlock?.visualize?.snapshotB;
      for (const result of snapshot?.provenance?.results ?? []) cite(result.reference);
    }
    const snapshots = [block.visualize?.snapshotA ?? block.visualize?.snapshot, block.visualize?.snapshotB].filter(snapshot => !!snapshot).map(snapshot => {
      for (const result of snapshot!.provenance?.results ?? []) cite(result.reference);
      return { hash: structuralHash(snapshot!), capturedAt: snapshot!.capturedAt, qualification: workbookSnapshotQualification(snapshot!), provenance: snapshot!.provenance ?? null };
    });
    const notes = (book.dependencies ?? []).filter(edge => edge.targetBlockId === block.id && edge.source.kind === "note").map(edge => {
      if (edge.source.kind !== "note") throw new Error("Expected Note source");
      const ref = edge.source, note = ref.projectId === project?.identity.id ? project.notes?.find(note => note.identity.id === ref.noteId) : undefined;
      return { reference: ref, status: note ? note.identity.structuralHash === ref.hash && note.identity.revision === ref.revision ? "current" : "stale" : "missing",
        renderedBody: note ? projectNoteRenderedBody(note, project!.workspace) : null };
    });
    return { workbookId: book.id, blockId: block.id, title: block.title, notes, enabled: block.enabled !== false, contentHash: structuralHash(JSON.parse(JSON.stringify(block))), claim: block.claim ? assessWorkbookClaim(block.claim, book, project) : null, snapshots };
  })));
  return { schemaVersion: 1 as const, projectId: project?.identity.id ?? null, projectHash: project ? structuralHash(project) : null,
    parameters: books.map(book => ({ workbookId: book.id, namedParameters: book.namedParameters ?? [] })),
    qualification: "Publication records selected blocks, exact citations and freshness at export. Stale and unavailable evidence remains qualified. Numerical support checks only the declared scalar interval; it is not proof of arbitrary prose. A captured availability label alone does not establish portability. The Project package includes its saved Workbooks and current/replay source resources.", blocks,
    citations: [...citations.values()].map(reference => {
      const detail = inspectNotebookProvenance(project, reference, reader);
      return { reference, status: detail.inspection?.status ?? "unresolved", reason: detail.inspection?.reason ?? "No named Project available.", currentSource: detail.inspection?.currentSource ?? null, result: detail.result ?? null, relations: detail.relations, artifacts: detail.artifacts };
    }) };
};
export type NotebookPublicationManifest = ReturnType<typeof notebookPublicationManifest>;
export const notebookPublicationMarkdown = (manifest: NotebookPublicationManifest) => `## Linked-source manifest\n\n${manifest.qualification}\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const notebookPublicationManifestHtml = (manifest: NotebookPublicationManifest) => {
  const rows = manifest.citations.map(item => {
    const result = item.result, source = item.reference.source;
    return `<tr><td>${escapeHtml(item.reference.targetId)}</td><td>${escapeHtml(item.status)}<br>${escapeHtml(item.reason)}</td><td>${escapeHtml(source.documentId)}<br>r${source.revision} · g${source.generation}<br>${escapeHtml(source.structuralHash)}</td><td>${escapeHtml(result ? result.status + " · " + result.provenance.operation.algorithm + " v" + result.provenance.operation.algorithmVersion + " · " + result.provenance.engine.name : "Document context")}<br>${escapeHtml(result?.warnings.join("; ") ?? "")}</td></tr>`;
  }).join("");
  return `<section data-publication-manifest><h2>Linked-source manifest</h2><p>${escapeHtml(manifest.qualification)}</p>
    <table style="width:100%;font-size:11px;overflow-wrap:anywhere"><thead><tr><th>Exact target</th><th>Freshness</th><th>Recorded source</th><th>Authority, method and warnings</th></tr></thead><tbody>${rows}</tbody></table>
    <details><summary>Exact manifest (JSON)</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(JSON.stringify(manifest, null, 2))}</pre></details></section>`;
};

/** Uses an ordinary Project package. Reports never introduce another Project container. */
export function createPortableNotebookPublication(project: Math3DProject, books: readonly Workbook[], resources: VerifiedProjectResources, reader?: NotebookArtifactReader, sourceReader?: ProjectResourceReader, selected?: readonly string[]) {
  let next = project;
  const workbookBytes = new Map<string, Uint8Array>();
  for (const book of books) { const prepared = prepareProjectWorkbook(next, book, `publication-${book.id}`); next = upsertMath3DProjectWorkbook(next, prepared.reference); workbookBytes.set(prepared.reference.id, prepared.bytes); }
  const captured = captureProjectResources(next, item => workbookBytes.get(item.id) ?? sourceReader?.(item) ?? resources.bytes(item));
  const manifest = notebookPublicationManifest(books, project, reader, selected);
  const artifacts: { id: string; source: NotebookReference["source"]; checksum: string; byteLength: number; data: string }[] = [];
  for (const item of manifest.citations) {
    if (["unresolved", "missing", "different-project", "invalid"].includes(item.status)) throw new TypeError(`Publication evidence is unavailable: ${item.reference.targetId}.`);
    for (const artifact of item.artifacts) {
      if (artifact.status !== "verified" || !reader || !item.result) throw new TypeError(`Required publication artifact bytes are unavailable: ${artifact.handle.artifactId}.`);
      const bytes = reader(artifact.handle, item.result.provenance.source);
      const metadata = project.workspace.artifacts.find(entry => entry.handle.artifactId === artifact.handle.artifactId && entry.handle.kind === artifact.handle.kind && entry.handle.role === artifact.handle.role);
      if (!bytes || !metadata || metadata.byteLength !== bytes.length || metadata.contentHash !== sha256Checksum(bytes)) throw new TypeError("Publication artifact changed during export.");
      artifacts.push({ id: artifact.handle.artifactId, source: item.result.provenance.source, checksum: sha256Checksum(bytes), byteLength: bytes.length, data: encodeProjectResourceBytes(bytes) });
    }
  }
  const packageJson = exportProjectPackage(next, captured), packageChecksum = sha256Checksum(new TextEncoder().encode(packageJson));
  const manifestChecksum = sha256Checksum(new TextEncoder().encode(JSON.stringify(manifest)));
  const payload = { schemaVersion: 1 as const, packageJson, packageChecksum, manifest, manifestChecksum, artifacts };
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 112 * 1024 * 1024) throw new TypeError("Publication exceeds 112 MiB.");
  return payload;
}

export const inspectPortableNotebookPublication = (payload: ReturnType<typeof createPortableNotebookPublication>) => {
  if (payload.schemaVersion !== 1 || sha256Checksum(new TextEncoder().encode(payload.packageJson)) !== payload.packageChecksum) throw new TypeError("Publication Project checksum mismatch.");
  if (sha256Checksum(new TextEncoder().encode(JSON.stringify(payload.manifest))) !== payload.manifestChecksum) throw new TypeError("Publication manifest checksum mismatch.");
  const reopened = parseProjectPackage(payload.packageJson);
  captureProjectResources(reopened.project, item => reopened.resources.bytes(item));
  for (const ref of reopened.project.workbooks ?? []) readProjectWorkbook(reopened.resources.bytes({ kind: "workbook-payload", id: ref.id })!, ref);
  if (payload.manifest.projectId !== reopened.project.identity.id) throw new TypeError("Publication belongs to another Project.");
  for (const artifact of payload.artifacts) {
    const binary = atob(artifact.data), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (bytes.length !== artifact.byteLength || sha256Checksum(bytes) !== artifact.checksum) throw new TypeError("Publication artifact checksum mismatch.");
  }
  for (const item of payload.manifest.citations) for (const artifact of item.artifacts) if (!payload.artifacts.some(bytes => bytes.id === artifact.handle.artifactId && structuralHash(bytes.source) === structuralHash(item.reference.source))) throw new TypeError("Required publication artifact is missing.");
  for (const item of payload.manifest.citations) {
    const inspected = inspectNotebookProvenance(reopened.project, item.reference, (handle, source) => {
      const resource = payload.artifacts.find(bytes => bytes.id === handle.artifactId && structuralHash(bytes.source) === structuralHash(source));
      return resource ? Uint8Array.from(atob(resource.data), c => c.charCodeAt(0)) : null;
    });
    if (["missing", "different-project", "invalid"].includes(inspected.inspection?.status ?? "missing") || inspected.artifacts.some(artifact => artifact.status !== "verified")) throw new TypeError("Required publication evidence bytes are unavailable or do not match the Project inventory.");
  }
  return reopened;
};

/** Standalone report plus a verified, downloadable normal Project package. No network assets. */
export function portableNotebookPublicationHtml(reportHtml: string, payload: ReturnType<typeof createPortableNotebookPublication>) {
  inspectPortableNotebookPublication(payload);
  const json = JSON.stringify(payload).replace(/</g, "\\u003c"), script = `
  (async () => {
    const output=document.getElementById('publication-status'), button=document.getElementById('publication-project');
    try {
      const p=JSON.parse(document.getElementById('publication-data').textContent);
      const sha=async bytes=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
      if(await sha(new TextEncoder().encode(p.packageJson))!==p.packageChecksum) throw Error('Project checksum mismatch');
      if(await sha(new TextEncoder().encode(JSON.stringify(p.manifest)))!==p.manifestChecksum) throw Error('Manifest checksum mismatch');
      const project=JSON.parse(p.packageJson), binary=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0)), same=(a,b)=>a.documentId===b.documentId && a.revision===b.revision && a.generation===b.generation && a.structuralHash===b.structuralHash;
      for(const r of [...project.resources,...p.artifacts]) { const bytes=binary(r.data); if(bytes.length!==r.byteLength || await sha(bytes)!==r.checksum) throw Error('Resource checksum mismatch: '+r.id); }
      for(const c of p.manifest.citations) for(const a of c.artifacts) if(!p.artifacts.some(r=>r.id===a.handle.artifactId && same(r.source,c.reference.source))) throw Error('Missing required artifact');
      button.disabled=false; output.textContent='Embedded source resources and publication artifact bytes verified. Import the downloaded Project in Projects to reopen its saved Workbook.';
      button.onclick=()=>{ const a=document.createElement('a'), url=URL.createObjectURL(new Blob([p.packageJson],{type:'application/json'})); a.href=url;a.download='publication.math3d.project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
    } catch(error) { output.textContent='Publication unavailable: '+error.message; }
  })();`;
  return reportHtml.replace("</body>", `<aside style="margin:24px"><button id="publication-project" disabled>Download embedded Project with resources</button><p id="publication-status" role="status">Verifying embedded bytes…</p></aside><script id="publication-data" type="application/json">${json}</script><script>${script}</script></body>`);
}
