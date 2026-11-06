import { projectCommandTransaction } from "./commands";
import { canonicalJsonStringify, type DocumentIdentity } from "./documentIdentity";
import { SURFACE_COMMAND_TYPES, surfaceCommandDefinitions } from "./surfaceCommands";
import type { SurfaceDocument } from "./surfaceDocument";
import type { MixedWorkspaceEntry } from "./mixedWorkspace";

export const MAX_RETAINED_SURFACE_GENERATIONS = 8;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sameIdentity = (a: DocumentIdentity, b: DocumentIdentity) =>
  a.id === b.id && a.revision === b.revision && a.structuralHash === b.structuralHash;

/** Only explicitly marked pre-edit Surface revisions are selectable. */
export function retainedSurfaceGenerationDocuments(entry: MixedWorkspaceEntry): readonly SurfaceDocument[] {
  if (entry.module !== "surface" || !entry.replay) return [];
  if (entry.checkpoint.format !== "math3d.surface-document" || entry.replay.format !== "math3d.surface-replay.v1")
    throw new TypeError("Invalid retained Surface replay source.");
  const replay = entry.replay.payload;
  if (!record(replay) || !Array.isArray(replay.transactions))
    throw new TypeError("Invalid retained Surface replay history.");
  if (!replay.transactions.some(transaction => record(transaction) && transaction.retainedBefore !== undefined)) return [];
  if (!record(replay.checkpoint) || replay.transactions.length > 100 || !Number.isSafeInteger(replay.cursor) ||
    Number(replay.cursor) < 0 || Number(replay.cursor) > replay.transactions.length)
    throw new TypeError("Invalid retained Surface replay history.");
  const checkpoint = replay.checkpoint as SurfaceDocument;
  if (!sameIdentity(checkpoint.identity, entry.checkpoint.identity))
    throw new TypeError("Retained Surface checkpoint does not match the saved source.");
  let document = checkpoint;
  const retained: SurfaceDocument[] = [];
  for (const [index, transaction] of replay.transactions.entries()) {
    if (!record(transaction) || !record(transaction.forward) || !record(transaction.forward.command) ||
      !record(transaction.inverse) || !record(transaction.inverse.command))
      throw new TypeError("Invalid retained Surface transaction.");
    const previous = transaction.forward.command.type === SURFACE_COMMAND_TYPES.replaceSource ? document.source :
      transaction.forward.command.type === SURFACE_COMMAND_TYPES.setAnalysisSettings ? document.metadata.analysisSettings : null;
    if (previous === null || transaction.inverse.command.type !== transaction.forward.command.type ||
      canonicalJsonStringify(transaction.inverse.command.payload) !== canonicalJsonStringify(previous))
      throw new TypeError("Retained Surface inverse does not restore the previous source or metadata.");
    if (transaction.retainedBefore !== undefined) {
      if (transaction.forward.command.type !== SURFACE_COMMAND_TYPES.replaceSource ||
        transaction.retainedBefore !== document.identity.structuralHash)
        throw new TypeError("Retained Surface marker does not match an exact source edit.");
      if (index < Number(replay.cursor)) {
        if (retained.some(item => sameIdentity(item.identity, document.identity)))
          throw new TypeError("Duplicate retained Surface generation.");
        if (retained.length >= MAX_RETAINED_SURFACE_GENERATIONS)
          throw new TypeError("Too many retained Surface generations.");
        retained.push(document);
      }
    }
    const next = projectCommandTransaction(document, [transaction.forward], surfaceCommandDefinitions, "replay");
    if (!next.ok) throw new TypeError("Retained Surface transaction failed replay verification.");
    document = next.state;
  }
  for (let index = replay.transactions.length - 1; index >= Number(replay.cursor); index--) {
    const transaction = replay.transactions[index]!;
    const inverse = projectCommandTransaction(document, [transaction.inverse], surfaceCommandDefinitions, "replay");
    if (!inverse.ok) throw new TypeError("Retained Surface undo failed replay verification.");
    document = inverse.state;
  }
  if (!sameIdentity(document.identity, entry.expected))
    throw new TypeError("Retained Surface replay does not match the saved current revision.");
  return retained;
}
