import { canonicalJsonStringify, isScientificSourceGeneration, isStructuralHash, structuralHash, viewerSourceFromDocument, type CanonicalJsonValue, type Math3DProject, type ScientificSourceGeneration, type StructuralHash } from "@math3d/core";
import { createNotebookReference, normalizeNotebookReference, type NotebookReference } from "./notebookReferences";
import { inspectNotebookProvenance, type NotebookArtifactReader } from "./notebookProvenance";
import type { WorkbookViewSnapshot } from "./workbookModel";

export type WorkbookSnapshotProvenance = Readonly<{
  schemaVersion: 1; projectId: string | null; viewerSource: ScientificSourceGeneration | null; sources: readonly ScientificSourceGeneration[];
  selection: CanonicalJsonValue; presentation: CanonicalJsonValue;
  annotations: readonly { id: string; hash: StructuralHash; title: string; body: string }[];
  results: readonly { reference: NotebookReference; authority: string; artifacts: readonly { id: string; status: "verified" | "unavailable" | "unverified" }[] }[];
  qualification: string;
}>;

export function normalizeWorkbookSnapshotProvenance(value: unknown): WorkbookSnapshotProvenance {
  const p = value as WorkbookSnapshotProvenance;
  if (!p || Object.keys(p).sort().join() !== "annotations,presentation,projectId,qualification,results,schemaVersion,selection,sources,viewerSource" || p.schemaVersion !== 1 ||
    (p.projectId !== null && (typeof p.projectId !== "string" || !p.projectId)) || typeof p.qualification !== "string" || (p.viewerSource !== null && !isScientificSourceGeneration(p.viewerSource)) ||
    !Array.isArray(p.sources) || p.sources.some(source => !isScientificSourceGeneration(source)) || !Array.isArray(p.annotations) ||
    p.annotations.some(note => !note || typeof note.id !== "string" || !isStructuralHash(note.hash) || typeof note.title !== "string" || typeof note.body !== "string") ||
    !Array.isArray(p.results) || p.results.some(result => !result || !normalizeNotebookReference(result.reference) || result.reference.kind !== "result" || result.reference.projectId !== p.projectId || typeof result.authority !== "string" || !Array.isArray(result.artifacts) ||
      result.artifacts.some((artifact: WorkbookSnapshotProvenance["results"][number]["artifacts"][number]) => !artifact || typeof artifact.id !== "string" || !["verified", "unavailable", "unverified"].includes(artifact.status)))) throw new TypeError("Invalid frozen snapshot provenance.");
  const json = canonicalJsonStringify(p as unknown as CanonicalJsonValue);
  if (new TextEncoder().encode(json).length > 512 * 1024) throw new TypeError("Snapshot provenance exceeds 512 KiB.");
  return JSON.parse(json);
}

/** A frozen record never derives annotations or selection from a later live scene. */
export function freezeWorkbookSnapshot(snapshot: WorkbookViewSnapshot, project: Math3DProject | null, reader?: NotebookArtifactReader,
  annotations?: WorkbookSnapshotProvenance["annotations"], presentation: CanonicalJsonValue = null, viewerSource: ScientificSourceGeneration | null = null): WorkbookViewSnapshot {
  const results = project?.workspace.results.map(result => {
    const reference = createNotebookReference(project, "result", result.resultId);
    return { reference, authority: result.status, artifacts: inspectNotebookProvenance(project, reference, reader).artifacts.map(item => ({ id: item.handle.artifactId, status: item.status })) };
  }) ?? [];
  const provenance = normalizeWorkbookSnapshotProvenance({ schemaVersion: 1, projectId: project?.identity.id ?? null, viewerSource,
    sources: project?.workspace.entries.map(entry => viewerSourceFromDocument({ identity: entry.expected })) ?? [], selection: project?.workspace.committedSelection ?? null, presentation,
    annotations: annotations ?? project?.notes?.map(note => ({ id: note.identity.id, hash: note.identity.structuralHash, title: note.title, body: note.body })) ?? [], results,
    qualification: "Frozen view and recorded Project context. The viewer source is recorded separately; an unavailable viewer source does not establish a scientific source for the picture. Artifact availability was checked at capture time; portability requires exact bytes to be included and verified again at export. A personal view without a Project has no scientific source provenance." });
  return JSON.parse(JSON.stringify({ ...snapshot, provenance }));
}

export const workbookSnapshotQualification = (snapshot: WorkbookViewSnapshot) => snapshot.provenance
  ? `Frozen snapshot · ${new Date(snapshot.capturedAt).toISOString()} · ${snapshot.provenance.sources.length} recorded sources · ${snapshot.provenance.results.length} result citations · ${structuralHash(snapshot)}. ${snapshot.provenance.qualification}`
  : "Legacy snapshot: no recorded Project provenance or artifact availability.";
