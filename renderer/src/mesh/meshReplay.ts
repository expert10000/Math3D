import { canonicalJsonStringify, createMeshCommandState, meshCommandDefinitions, projectCommandTransaction, type MeshCommandState } from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import type { MeshReplayPackage } from "./meshDocumentAdapter";

/** Replay verification is independent of buffer availability. Activation checks sidecars separately. */
export type MeshReplayBundle = Omit<MeshReplayPackage, "resources">;
export const restoreMeshReplayKernel = (bundle: MeshReplayBundle) => {
  if (!bundle || !Array.isArray(bundle.transactions) || bundle.transactions.length > 100 ||
    !Number.isSafeInteger(bundle.cursor) || bundle.cursor < 0 || bundle.cursor > bundle.transactions.length)
    throw new TypeError("Invalid or oversized Mesh replay history.");
  const kernel = createInMemoryDocumentKernel({ initialState: createMeshCommandState(bundle.checkpoint.document, bundle.checkpoint.committedSelection), commandDefinitions: meshCommandDefinitions, historyLimit: 100 });
  for (const transaction of bundle.transactions) {
    const before = kernel.query((state) => state) as MeshCommandState;
    const result = kernel.transact({ transactionId: transaction.transactionId, commands: transaction.commands, mode: "replay", history: { kind: "reversible", inverseCommands: transaction.inverseCommands } });
    if (!result.ok || result.event.stateHash !== transaction.stateHash) throw new TypeError(`Mesh replay transaction '${transaction.transactionId}' failed.`);
    const inverse = projectCommandTransaction(kernel.query((state) => state) as MeshCommandState, transaction.inverseCommands, meshCommandDefinitions, "replay");
    if (!inverse.ok || canonicalJsonStringify({ ...inverse.state, document: { ...inverse.state.document, identity: { ...inverse.state.document.identity, revision: before.document.identity.revision } } }) !== canonicalJsonStringify(before))
      throw new TypeError(`Mesh replay inverse '${transaction.transactionId}' does not restore its source and selection.`);
  }
  for (let index = bundle.transactions.length; index > bundle.cursor; index--) if (!kernel.undo().ok) throw new TypeError("Mesh replay cursor could not be restored.");
  return kernel;
};
export const meshReplayState = (bundle: MeshReplayBundle): MeshCommandState => restoreMeshReplayKernel(bundle).query((state) => state) as MeshCommandState;
