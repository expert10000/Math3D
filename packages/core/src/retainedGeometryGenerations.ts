import { projectCommandTransaction } from "./commands";
import { structuralHash, type DocumentIdentity } from "./documentIdentity";
import { geometryCommandDefinitions, GEOMETRY_COMMAND_TYPES, type GeometryCommandState } from "./geometryCommands";
import type { GeometryDocument } from "./geometryDocument";
import type { MixedWorkspaceEntry } from "./mixedWorkspace";

export const MAX_RETAINED_GEOMETRY_GENERATIONS = 8;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sameIdentity = (a: DocumentIdentity, b: DocumentIdentity) =>
  a.id === b.id && a.revision === b.revision && a.structuralHash === b.structuralHash;

/** Only revisions explicitly marked before a verified Geometry source edit are selectable. */
export function retainedGeometryGenerationDocuments(entry: MixedWorkspaceEntry): readonly GeometryDocument[] {
  if (entry.module !== "geometry" || !entry.replay) return [];
  if (entry.checkpoint.format !== "math3d.geometry-document" || entry.replay.format !== "math3d.geometry-replay.v1")
    throw new TypeError("Invalid retained Geometry replay source.");
  const replay = entry.replay.payload;
  if (!record(replay) || !record(replay.checkpoint) || !Array.isArray(replay.transactions) ||
    replay.transactions.length > 100 || !Number.isSafeInteger(replay.cursor) ||
    Number(replay.cursor) < 0 || Number(replay.cursor) > replay.transactions.length)
    throw new TypeError("Invalid retained Geometry replay history.");
  const checkpoint = replay.checkpoint as GeometryCommandState;
  if (!record(checkpoint.document) || !sameIdentity(checkpoint.document.identity, entry.checkpoint.identity))
    throw new TypeError("Retained Geometry checkpoint does not match the saved source.");
  let state = checkpoint;
  const retained: GeometryDocument[] = [];
  for (const transaction of replay.transactions.slice(0, Number(replay.cursor))) {
    if (!record(transaction) || !Array.isArray(transaction.commands))
      throw new TypeError("Invalid retained Geometry transaction.");
    if (transaction.retainedBefore !== undefined) {
      if (transaction.retainedBefore !== state.document.identity.structuralHash ||
        transaction.commands.length !== 1 || !record(transaction.commands[0]) ||
        !record(transaction.commands[0].command) ||
        transaction.commands[0].command.type !== GEOMETRY_COMMAND_TYPES.replaceSource)
        throw new TypeError("Retained Geometry marker does not match an exact source edit.");
      if (retained.some(document => sameIdentity(document.identity, state.document.identity)))
        throw new TypeError("Duplicate retained Geometry generation.");
      if (retained.length >= MAX_RETAINED_GEOMETRY_GENERATIONS)
        throw new TypeError("Too many retained Geometry generations.");
      retained.push(state.document);
    }
    const next = projectCommandTransaction(state, transaction.commands, geometryCommandDefinitions, "replay");
    if (!next.ok || structuralHash(next.state) !== transaction.stateHash)
      throw new TypeError("Retained Geometry transaction failed replay verification.");
    state = next.state;
  }
  if (!sameIdentity(state.document.identity, entry.expected))
    throw new TypeError("Retained Geometry replay does not match the saved current revision.");
  return retained;
}
