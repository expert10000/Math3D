import { projectCommandTransaction } from "./commands";
import { structuralHash, type DocumentIdentity } from "./documentIdentity";
import { createMeshCommandState, meshCommandDefinitions, MESH_COMMAND_TYPES } from "./meshCommands";
import type { MeshDocument } from "./meshDocument";
import type { MixedWorkspaceEntry } from "./mixedWorkspace";

export const MAX_RETAINED_MESH_GENERATIONS = 8;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sameIdentity = (a: DocumentIdentity, b: DocumentIdentity) =>
  a.id === b.id && a.revision === b.revision && a.structuralHash === b.structuralHash;

/** Only revisions explicitly marked before a replayed Mesh edit are selectable. */
export function retainedMeshGenerationDocuments(entry: MixedWorkspaceEntry): readonly MeshDocument[] {
  if (entry.module !== "mesh" || !entry.replay) return [];
  if (entry.checkpoint.format !== "math3d.mesh-document" || entry.replay.format !== "math3d.mesh-replay.v1")
    throw new TypeError("Invalid retained Mesh replay source.");
  const replay = entry.replay.payload;
  if (!record(replay) || !Array.isArray(replay.transactions) || replay.transactions.length > 100 ||
      !Number.isSafeInteger(replay.cursor) || Number(replay.cursor) < 0 || Number(replay.cursor) > replay.transactions.length)
    throw new TypeError("Invalid retained Mesh replay history.");
  let state = createMeshCommandState(entry.checkpoint);
  const retained: MeshDocument[] = [];
  for (const transaction of replay.transactions.slice(0, Number(replay.cursor))) {
    if (!record(transaction) || !Array.isArray(transaction.commands)) throw new TypeError("Invalid retained Mesh transaction.");
    for (const command of transaction.commands) {
      if (!record(command) || !record(command.command) || command.command.type !== MESH_COMMAND_TYPES.commitResource) continue;
      const payload = command.command.payload;
      const parameters = record(payload) ? payload.parameters : null;
      const marker = record(parameters) ? parameters.retainedBefore : undefined;
      if (marker === undefined) continue;
      if (marker !== state.document.identity.structuralHash)
        throw new TypeError("Retained Mesh marker does not match the exact pre-edit revision.");
      if (retained.some(document => sameIdentity(document.identity, state.document.identity)))
        throw new TypeError("Duplicate retained Mesh generation.");
      if (retained.length >= MAX_RETAINED_MESH_GENERATIONS)
        throw new TypeError("Too many retained Mesh generations.");
      retained.push(state.document);
    }
    const next = projectCommandTransaction(state, transaction.commands, meshCommandDefinitions, "replay");
    if (!next.ok || structuralHash(next.state) !== transaction.stateHash)
      throw new TypeError("Retained Mesh transaction failed replay verification.");
    state = next.state;
  }
  if (!sameIdentity(state.document.identity, entry.expected))
    throw new TypeError("Retained Mesh replay does not match the saved current revision.");
  return retained;
}
