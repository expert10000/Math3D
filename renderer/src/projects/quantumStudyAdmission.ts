import { createMixedWorkspaceDocument, linkQuantumSceneDocuments, replaceMath3DProjectWorkspace,
  upsertMath3DProjectQuantumScene, type Math3DProject, type ProjectQuantumSceneReference,
  type QuantumSceneDocument } from "@math3d/core";

export type VerifiedQwzStudy = { runId: string; resultSha256: string; references: ProjectQuantumSceneReference[] };

/** Reverify every declared scene before publishing either document to a Project. */
export async function admitVerifiedQwzStudy(base: Math3DProject, handoff: VerifiedQwzStudy,
  verify: (reference: ProjectQuantumSceneReference) => Promise<QuantumSceneDocument>): Promise<Math3DProject> {
  if (handoff.references.length !== 2 || new Set(handoff.references.map(item => item.sceneFingerprint)).size !== 2)
    throw new TypeError("Study needs two distinct exact scene identities.");
  const documents = await Promise.all(handoff.references.map(async reference => {
    const document = await verify(reference);
    if (document.location.directory !== reference.directory || document.source.sceneFingerprint !== reference.sceneFingerprint ||
        document.source.provenance.runId !== handoff.runId ||
        document.source.provenance.resultSha256 !== handoff.resultSha256 ||
        document.source.provenance.model !== "qwz") throw new TypeError("Verified study source differs from its declared run.");
    return document;
  }));
  let next = base;
  for (const reference of handoff.references) next = upsertMath3DProjectQuantumScene(next, reference);
  const existing = next.workspace.entries;
  const present = new Set(existing.filter(entry => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document")
    .map(entry => (entry.checkpoint as QuantumSceneDocument).source.sceneFingerprint));
  const added = documents.filter(document => !present.has(document.source.sceneFingerprint));
  const staged = [...existing, ...added.map(document => ({ module: "quantum" as const, checkpoint: document,
    expected: document.identity, replay: null }))];
  const linked = new Map(linkQuantumSceneDocuments(staged.filter(entry => entry.module === "quantum")
    .map(entry => entry.checkpoint as QuantumSceneDocument)).map(document => [document.source.sceneFingerprint, document]));
  const workspace = createMixedWorkspaceDocument({ ...next.workspace,
    entries: staged.map(entry => entry.module === "quantum" && entry.checkpoint.format === "math3d.quantum-scene-document"
      ? { ...entry, checkpoint: linked.get(entry.checkpoint.source.sceneFingerprint)! } : entry),
    activeDocumentIds: [...next.workspace.activeDocumentIds, ...added.map(document => document.identity.id)] });
  return replaceMath3DProjectWorkspace(next, workspace);
}
