import { canonicalJsonStringify, createCurveDocument, createDocumentIdentity, type CurveDocument, type CurveDocumentSource,
  type MixedWorkspaceDocument, type ScientificSourceGeneration } from "@math3d/core";
import { CurveCommandAdapter, type CurveReplayBundle } from "@math3d/kernel";

export const capturedCurveKey = (source: Pick<ScientificSourceGeneration, "documentId" | "revision" | "structuralHash">) =>
  canonicalJsonStringify({ documentId: source.documentId, revision: source.revision, structuralHash: source.structuralHash });

/** Recover only lineage-requested source hashes from verified retained Curve history.
 * Undo/redo advances revisions, so a recorded source hash may occur at several
 * generations. The original relation provides the captured generation identity.
 */
export const capturedCurveSources = (workspace: MixedWorkspaceDocument): ReadonlyMap<string, CurveDocument> => {
  const snapshots = new Map<string, CurveDocument>();
  for (const entry of workspace.entries) {
    if (entry.checkpoint.format !== "math3d.curve-document") continue;
    const wanted = workspace.relations.flatMap(relation => relation.sources).filter(source => source.documentId === entry.expected.id);
    if (!wanted.length) continue;
    const candidates: CurveDocumentSource[] = [entry.checkpoint.source];
    if (entry.replay) {
      if (entry.replay.format !== "math3d.curve-replay.v1") throw new TypeError("Unsupported captured Curve replay format.");
      const replay = CurveCommandAdapter.fromReplayBundle(entry.replay.payload as unknown as CurveReplayBundle).replayBundle();
      candidates.push(replay.checkpoint.source);
      for (const transaction of replay.transactions) for (const envelope of [transaction.forward, transaction.inverse])
        if (envelope.command.type === "curve.source.replace") candidates.push(envelope.command.payload as CurveDocumentSource);
    }
    for (const generation of wanted) {
      const source = candidates.find(candidate => createDocumentIdentity(entry.expected.id, candidate, generation.revision).structuralHash === generation.structuralHash);
      if (source) snapshots.set(capturedCurveKey(generation), createCurveDocument({ source,
        identity: createDocumentIdentity(entry.expected.id, source, generation.revision), metadata: entry.checkpoint.metadata }));
    }
  }
  return snapshots;
};
