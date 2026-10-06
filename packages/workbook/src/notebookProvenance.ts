import { evaluateDocumentRelationStatus, sha256Checksum, viewerSourceFromDocument,
  type AnalysisArtifactHandle, type Math3DProject, type ScientificSourceGeneration } from "@math3d/core";
import { inspectNotebookReference, type NotebookReference } from "./notebookReferences";

/** Readers must resolve the exact handle and generation before returning bytes. Metadata alone is insufficient. */
export type NotebookArtifactReader = (handle: AnalysisArtifactHandle, source: ScientificSourceGeneration) => Uint8Array | null;
export function inspectNotebookProvenance(project: Math3DProject | null, reference: NotebookReference, reader?: NotebookArtifactReader) {
  const inspection = project ? inspectNotebookReference(project, reference) : null;
  const result = inspection?.result;
  const sameProject = project?.identity.id === reference.projectId;
  const relations = sameProject ? project.workspace.relations.filter(relation =>
    relation.sources.some(source => source.documentId === reference.source.documentId) ||
    (relation.target.type === "document" ? relation.target.generation.documentId === reference.targetId :
      relation.target.type === "result" ? relation.target.resultId === reference.targetId : result?.artifacts.some(handle => relation.target.type === "artifact" && handle.artifactId === relation.target.artifactId)))
    .map(relation => ({ relation, status: evaluateDocumentRelationStatus(relation, id => {
      const entry = project.workspace.entries.find(item => item.expected.id === id);
      return entry ? viewerSourceFromDocument({ identity: entry.expected }) : null;
    }) })) : [];
  const artifacts = (result?.artifacts ?? []).map(handle => {
    const metadata = sameProject ? project.workspace.artifacts.find(item => item.handle.artifactId === handle.artifactId && item.handle.kind === handle.kind && item.handle.role === handle.role) : null;
    if (!reader) return { handle, status: "unverified" as const, reason: "Artifact bytes have not been checked." };
    if (!metadata?.contentHash || metadata.byteLength === null) return { handle, status: "unverified" as const, reason: "No retained checksum and byte count to verify." };
    try {
      const bytes = reader(handle, result!.provenance.source);
      if (!bytes) return { handle, status: "unavailable" as const, reason: "Exact source artifact bytes are unavailable." };
      if (bytes.byteLength !== metadata.byteLength || sha256Checksum(bytes) !== metadata.contentHash)
        return { handle, status: "unavailable" as const, reason: "Artifact checksum or byte count does not match the saved inventory." };
      return { handle, status: "verified" as const, reason: `Verified checksum and ${bytes.byteLength} bytes for the recorded source.` };
    } catch { return { handle, status: "unavailable" as const, reason: "Artifact could not be resolved for its recorded source." }; }
  });
  return { inspection, result, relations, artifacts };
}
