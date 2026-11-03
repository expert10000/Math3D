import { canonicalJsonStringify, encodeProjectResourceBytes, sha256Checksum, structuralHash, upsertMath3DProjectWorkbook, type Math3DProject } from "@math3d/core";
import { assessWorkbookClaim, inspectNotebookProvenance, normalizeNotebookReference, workbookSnapshotQualification, type NotebookArtifactReader, type NotebookReference, type Workbook } from "@math3d/workbook";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, type ProjectResourceReader, type VerifiedProjectResources } from "../projects/projectResources";
import { projectNoteRenderedBody } from "../projects/projectNoteValues";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { inspectWorkbookComparisonReference, normalizeWorkbookSavedMeshTrendReference } from "@math3d/workbook";
import { createProjectComparisonEvidence } from "../projects/projectComparisonEvidence";
import { inspectWorkbookSavedMeshTrend } from "../projects/projectSavedMeshWorkbookTrend";
import { inspectWorkbookSavedMeshComparison } from "../projects/projectSavedMeshWorkbookComparison";

export const notebookPublicationManifest = (books: readonly Workbook[], project: Math3DProject | null, reader?: NotebookArtifactReader, selected?: readonly string[], sourceReader?: ProjectResourceReader) => {
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
    const comparison = block.visualize?.comparison ? (() => {
      const inspected = inspectWorkbookComparisonReference(project, block.visualize.comparison!);
      if (inspected.status !== "current" || !project || !inspected.composition || !sourceReader)
        throw new TypeError(`Workbook comparison ${block.title} is stale, missing, or lacks verified source bytes.`);
      return createProjectComparisonEvidence(project, inspected.composition, sourceReader);
    })() : null;
    const savedMeshTrend = block.visualize?.savedMeshTrend ? (() => {
      const inspected = inspectWorkbookSavedMeshTrend(project, block.visualize.savedMeshTrend!, sourceReader);
      if (inspected.status !== "current" || !inspected.study)
        throw new TypeError(`Workbook saved Mesh trend ${block.title} is ${inspected.status}: ${inspected.reason}`);
      return inspected.study;
    })() : null;
    const savedMeshComparison = block.visualize?.savedMeshComparison ? (() => {
      const reference = block.visualize.savedMeshComparison!;
      const inspected = inspectWorkbookSavedMeshComparison(project, reference, sourceReader);
      if (inspected.status !== "current" || !inspected.evidence)
        throw new TypeError(`Workbook saved Mesh comparison ${block.title} is ${inspected.status}: ${inspected.reason}`);
      return { reference, evidence: inspected.evidence };
    })() : null;
    const notes = (book.dependencies ?? []).filter(edge => edge.targetBlockId === block.id && edge.source.kind === "note").map(edge => {
      if (edge.source.kind !== "note") throw new Error("Expected Note source");
      const ref = edge.source, note = ref.projectId === project?.identity.id ? project.notes?.find(note => note.identity.id === ref.noteId) : undefined;
      return { reference: ref, status: note ? note.identity.structuralHash === ref.hash && note.identity.revision === ref.revision ? "current" : "stale" : "missing",
        renderedBody: note ? projectNoteRenderedBody(note, project!.workspace) : null };
    });
    return { workbookId: book.id, blockId: block.id, title: block.title, notes, enabled: block.enabled !== false, contentHash: structuralHash(JSON.parse(JSON.stringify(block))), claim: block.claim ? assessWorkbookClaim(block.claim, book, project) : null, snapshots, comparison, savedMeshTrend, savedMeshComparison };
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
export const notebookPublicationMarkdown = (manifest: NotebookPublicationManifest) => `## Linked-source manifest\n\n${manifest.qualification}\n\n${manifest.blocks.filter(block => block.savedMeshComparison).map(block => {
  const { reference, evidence } = block.savedMeshComparison!;
  return `### Saved Mesh comparison · ${reference.comparisonId}\n\nPinned metric: ${reference.metricPath}; comparison hash ${reference.comparisonHash}.\n\n${([evidence.a, evidence.b] as const).map((side, index) => `- ${index ? "B" : "A"}: result ${side.resultId} · ${side.resultHash}; Mesh r${side.sourceRevision} · ${side.sourceHash}`).join("\n")}\n\n${evidence.metrics.map(metric => `- ${metric.path}: A ${metric.a}; B ${metric.b}; unit ${metric.unit ?? "unqualified"}; B − A ${metric.difference ?? metric.reason}`).join("\n")}\n\n${evidence.qualification}`;
}).join("\n\n")}\n\n${manifest.blocks.filter(block => block.savedMeshTrend).map(block => {
  const study = block.savedMeshTrend!;
  return `### Saved Mesh trend · ${study.metricPath}\n\n${study.qualification}\n\n${study.rows.map(row => `- r${row.revision}: ${row.status === "available" ? `${row.value} ${row.unit}` : row.status}; result ${row.resultId ?? "none"}; result hash ${row.resultHash ?? "none"}; source hash ${row.sourceHash}`).join("\n")}`;
}).join("\n\n")}\n\n${manifest.blocks.filter(block => block.comparison).map(block => {
  const comparison = block.comparison!;
  return `### Saved Project comparison · ${comparison.title}\n\nAlignment: ${comparison.alignment}.\n\n${comparison.members.map(member => `- ${member.slot}: ${member.title} · ${member.documentId} · r${member.revision} · ${member.structuralHash} · ${member.unit ?? "unit not recorded"}`).join("\n")}\n\nSelection: ${comparison.selection ? JSON.stringify(comparison.selection) : "No recorded selection in this report; use the open comparison to export a selected view."}\n\nAuthored observations (not independent measurements):\n${comparison.observations.length ? comparison.observations.map(note => `- ${JSON.stringify(note.title)}: ${JSON.stringify(note.body)} · ${note.noteId} r${note.noteRevision} · ${note.noteHash}`).join("\n") : "- None saved."}`;
}).join("\n\n")}\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const notebookPublicationManifestHtml = (manifest: NotebookPublicationManifest) => {
  const rows = manifest.citations.map(item => {
    const result = item.result, source = item.reference.source;
    return `<tr><td>${escapeHtml(item.reference.targetId)}</td><td>${escapeHtml(item.status)}<br>${escapeHtml(item.reason)}</td><td>${escapeHtml(source.documentId)}<br>r${source.revision} · g${source.generation}<br>${escapeHtml(source.structuralHash)}</td><td>${escapeHtml(result ? result.status + " · " + result.provenance.operation.algorithm + " v" + result.provenance.operation.algorithmVersion + " · " + result.provenance.engine.name : "Document context")}<br>${escapeHtml(result?.warnings.join("; ") ?? "")}</td></tr>`;
  }).join("");
  const comparisons = manifest.blocks.filter(block => block.comparison).map(block => {
    const comparison = block.comparison!;
    return `<section data-comparison-evidence><h3>Saved Project comparison · ${escapeHtml(comparison.title)}</h3><p>Mode: ${comparison.mode} · alignment: <strong>${comparison.alignment}</strong></p><p>Project ${escapeHtml(comparison.projectId)} · composition ${escapeHtml(comparison.compositionHash)}</p><table><thead><tr><th>Source</th><th>Exact saved generation</th><th>Unit</th></tr></thead><tbody>${comparison.members.map(member => `<tr><td>${member.slot} · ${escapeHtml(member.title)}<br>${escapeHtml(member.documentId)}</td><td>r${member.revision} · ${escapeHtml(member.generation)}<br>${escapeHtml(member.structuralHash)}</td><td>${escapeHtml(member.unit ?? "not recorded")}</td></tr>`).join("")}</tbody></table><p>Selection: none recorded in this publication. Export a selected view from the open comparison.</p><h4>Authored observations</h4><p>These Notes are not independent scientific measurements.</p>${comparison.observations.map(note => `<article><strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.body)}</p><small>${escapeHtml(note.noteId)} · r${note.noteRevision} · ${escapeHtml(note.noteHash)}</small></article>`).join("") || "<p>None saved.</p>"}<p>${escapeHtml(comparison.qualification)}</p></section>`;
  }).join("");
  const trends = manifest.blocks.filter(block => block.savedMeshTrend).map(block => {
    const study = block.savedMeshTrend!;
    return `<section data-saved-mesh-trend><h3>Saved Mesh trend · ${escapeHtml(study.metricPath)}</h3><p>${escapeHtml(study.operation)} · ${escapeHtml(study.algorithm)} v${escapeHtml(study.algorithmVersion)} · ${escapeHtml(study.unit ?? "unqualified")}</p><p>${escapeHtml(study.qualification)}</p><table><thead><tr><th>Mesh revision</th><th>Stored value</th><th>Status</th><th>Exact result and hash</th><th>Source hash</th></tr></thead><tbody>${study.rows.map(row => `<tr><td>r${row.revision}</td><td>${row.status === "available" ? escapeHtml(`${row.value} ${row.unit}`) : "—"}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.resultId ?? "No saved result")}<br>${escapeHtml(row.resultHash ?? "—")}</td><td>${escapeHtml(row.sourceHash)}</td></tr>`).join("")}</tbody></table></section>`;
  }).join("");
  const meshComparisons = manifest.blocks.filter(block => block.savedMeshComparison).map(block => {
    const { reference, evidence } = block.savedMeshComparison!;
    return `<section data-saved-mesh-comparison><h3>Saved Mesh comparison · ${escapeHtml(reference.comparisonId)}</h3><p>Pinned metric ${escapeHtml(reference.metricPath)} · comparison hash ${escapeHtml(reference.comparisonHash)}</p><p>${escapeHtml(evidence.qualification)}</p><table><thead><tr><th>Source</th><th>Exact saved result</th><th>Exact Mesh generation</th></tr></thead><tbody>${([evidence.a, evidence.b] as const).map((side, index) => `<tr><th>${index ? "B" : "A"}</th><td>${escapeHtml(side.resultId)}<br>${escapeHtml(side.resultHash)}</td><td>r${side.sourceRevision} · ${escapeHtml(side.sourceHash)}</td></tr>`).join("")}</tbody></table><table><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Unit</th><th>B − A</th></tr></thead><tbody>${evidence.metrics.map(metric => `<tr><th>${escapeHtml(metric.path)}</th><td>${metric.a}</td><td>${metric.b}</td><td>${escapeHtml(metric.unit ?? "unqualified")}</td><td>${escapeHtml(String(metric.difference ?? metric.reason))}</td></tr>`).join("")}</tbody></table></section>`;
  }).join("");
  return `<section data-publication-manifest><h2>Linked-source manifest</h2><p>${escapeHtml(manifest.qualification)}</p>
    ${comparisons}
    ${trends}
    ${meshComparisons}
    <table style="width:100%;font-size:11px;overflow-wrap:anywhere"><thead><tr><th>Exact target</th><th>Freshness</th><th>Recorded source</th><th>Authority, method and warnings</th></tr></thead><tbody>${rows}</tbody></table>
    <details><summary>Exact manifest (JSON)</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(JSON.stringify(manifest, null, 2))}</pre></details></section>`;
};

/** Uses an ordinary Project package. Reports never introduce another Project container. */
export function createPortableNotebookPublication(project: Math3DProject, books: readonly Workbook[], resources: VerifiedProjectResources, reader?: NotebookArtifactReader, sourceReader?: ProjectResourceReader, selected?: readonly string[]) {
  let next = project;
  const workbookBytes = new Map<string, Uint8Array>();
  for (const book of books) { const prepared = prepareProjectWorkbook(next, book, `publication-${book.id}`); next = upsertMath3DProjectWorkbook(next, prepared.reference); workbookBytes.set(prepared.reference.id, prepared.bytes); }
  const captured = captureProjectResources(next, item => workbookBytes.get(item.id) ?? sourceReader?.(item) ?? resources.bytes(item));
  const manifest = notebookPublicationManifest(books, project, reader, selected, sourceReader);
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
  for (const block of payload.manifest.blocks) if (block.comparison) {
    const saved = reopened.project.compositions?.find(item => item.id === block.comparison!.compositionId);
    if (!saved) throw new TypeError("Publication comparison is missing from the Project.");
    const checked = createProjectComparisonEvidence(reopened.project, saved, item => reopened.resources.bytes(item));
    if (structuralHash(checked) !== structuralHash(block.comparison)) throw new TypeError("Publication comparison source or generation changed.");
  }
  for (const block of payload.manifest.blocks) if (block.savedMeshTrend) {
    const saved = block.savedMeshTrend;
    const reference = normalizeWorkbookSavedMeshTrendReference(
      { schemaVersion: 1, projectId: saved.projectId, meshId: saved.sourceDocumentId, operation: saved.operation,
        algorithm: saved.algorithm, algorithmVersion: saved.algorithmVersion, metricPath: saved.metricPath,
        results: saved.rows.filter(row => row.resultId).map(row => ({ resultId: row.resultId!, resultHash: row.resultHash!,
          revision: row.revision, sourceHash: row.sourceHash })) });
    const checked = inspectWorkbookSavedMeshTrend(reopened.project, reference, item => reopened.resources.bytes(item));
    if (checked.status !== "current" || !checked.study || structuralHash(checked.study) !== structuralHash(saved))
      throw new TypeError("Publication saved Mesh trend source or generation changed.");
  }
  for (const block of payload.manifest.blocks) if (block.savedMeshComparison) {
    const saved = block.savedMeshComparison;
    const checked = inspectWorkbookSavedMeshComparison(reopened.project, saved.reference, item => reopened.resources.bytes(item));
    if (checked.status !== "current" || !checked.evidence || structuralHash(checked.evidence) !== structuralHash(saved.evidence))
      throw new TypeError("Publication saved Mesh comparison source or result changed.");
  }
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
