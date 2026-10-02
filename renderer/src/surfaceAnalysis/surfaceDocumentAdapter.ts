import {
  SURFACE_COMMAND_TYPES, projectCommandTransaction, canonicalJsonStringify, createDocumentIdentity, createCommandEnvelope, createSurfaceCommandState,
  createSurfaceDocument, parseSurfaceDocument, serializeSurfaceDocument, surfaceCommandDefinitions,
  type CanonicalJsonValue, type CommandEnvelope, type SurfaceDocument, type SurfaceDocumentSource,
} from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import type { CanonicalSurfaceDefinition } from "./contracts";

const legacyJson = <T>(value: T): T => {
  const omitUndefined = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(omitUndefined);
    if (entry && typeof entry === "object") return Object.fromEntries(Object.entries(entry).filter(([, child]) => child !== undefined).map(([key, child]) => [key, omitUndefined(child)]));
    return entry;
  };
  return JSON.parse(canonicalJsonStringify(omitUndefined(value))) as T;
};

export const surfaceSourceFromLegacyDefinition = (definition: CanonicalSurfaceDefinition): SurfaceDocumentSource => ({
  representation: definition.representation,
  domain: legacyJson(definition.domain) as CanonicalJsonValue,
  units: legacyJson(definition.units) as CanonicalJsonValue,
  orientation: legacyJson(definition.orientation) as CanonicalJsonValue,
  definition: legacyJson(definition.source) as SurfaceDocumentSource["definition"],
  parameters: legacyJson(definition.source.settings ?? {}) as SurfaceDocumentSource["parameters"],
  branchPolicy: null,
});

export const surfaceDocumentFromLegacyDefinition = (definition: CanonicalSurfaceDefinition): SurfaceDocument => createSurfaceDocument({
  stableKey: { legacySurfaceId: definition.identity.surfaceId },
  source: surfaceSourceFromLegacyDefinition(definition),
  metadata: { title: definition.identity.label, legacySurfaceId: definition.identity.surfaceId, analysisSettings: legacyJson(definition.sampling) as CanonicalJsonValue },
});

export type SurfaceReplayBundle = Readonly<{
  checkpoint: SurfaceDocument;
  transactions: readonly { forward: CommandEnvelope; inverse: CommandEnvelope }[];
  cursor: number;
}>;

export class SurfaceDocumentAdapter {
  #checkpoint: SurfaceDocument;
  #kernel;
  #transactions: { forward: CommandEnvelope; inverse: CommandEnvelope }[] = [];
  #cursor = 0;
  #sequence = 0;

  constructor(document: SurfaceDocument) {
    this.#checkpoint = createSurfaceCommandState(document);
    this.#kernel = createInMemoryDocumentKernel({ initialState: this.#checkpoint, commandDefinitions: surfaceCommandDefinitions, historyLimit: 100 });
  }

  document(): SurfaceDocument { return this.#kernel.query((state) => state) as SurfaceDocument; }
  history() { return this.#kernel.historyStatus(); }
  previewSource(source: SurfaceDocumentSource): SurfaceDocumentSource { return legacyJson(source); }
  serialize(): string { return serializeSurfaceDocument(this.document()); }
  static parse(serialized: string): SurfaceDocumentAdapter { return new SurfaceDocumentAdapter(parseSurfaceDocument(serialized)); }

  commitSource(source: SurfaceDocumentSource): SurfaceDocument {
    return this.#commit(SURFACE_COMMAND_TYPES.replaceSource, source as CanonicalJsonValue, this.document().source as CanonicalJsonValue);
  }
  setAnalysisSettings(settings: CanonicalJsonValue): SurfaceDocument {
    return this.#commit(SURFACE_COMMAND_TYPES.setAnalysisSettings, settings, this.document().metadata.analysisSettings);
  }
  syncLegacyDefinition(definition: CanonicalSurfaceDefinition): SurfaceDocument {
    this.commitSource(surfaceSourceFromLegacyDefinition(definition));
    return this.setAnalysisSettings(legacyJson(definition.sampling) as CanonicalJsonValue);
  }
  undo(): SurfaceDocument {
    if (this.#cursor === 0) return this.document();
    const result = this.#kernel.undo();
    if (!result.ok) throw new TypeError("Cannot undo Surface edit.");
    this.#cursor -= 1;
    return this.document();
  }
  redo(): SurfaceDocument {
    if (this.#cursor === this.#transactions.length) return this.document();
    const result = this.#kernel.redo();
    if (!result.ok) throw new TypeError("Cannot redo Surface edit.");
    this.#cursor += 1;
    return this.document();
  }
  replayBundle(): SurfaceReplayBundle {
    // Undo/redo advances scientific generations. Rebase the history's starting
    // generation so replay reproduces the current identity as well as its source.
    const edits = (entries: { forward: CommandEnvelope; inverse: CommandEnvelope }[]) => entries.filter((entry) => entry.forward.command.type === SURFACE_COMMAND_TYPES.replaceSource).length;
    const sourceEdits = edits(this.#transactions) + edits(this.#transactions.slice(this.#cursor));
    const revision = this.document().identity.revision - sourceEdits;
    const checkpoint = { ...this.#checkpoint, identity: createDocumentIdentity(this.#checkpoint.identity.id, this.#checkpoint.source, revision) };
    return legacyJson({ checkpoint, transactions: this.#transactions, cursor: this.#cursor });
  }
  static fromReplayBundle(bundle: SurfaceReplayBundle): SurfaceDocumentAdapter {
    if (!Number.isSafeInteger(bundle.cursor) || bundle.cursor < 0 || bundle.cursor > bundle.transactions.length || bundle.transactions.length > 10000) throw new TypeError("Invalid or oversized Surface replay history.");
    const end = Math.min(bundle.transactions.length, bundle.cursor + 100), start = Math.max(0, end - 100);
    let checkpoint = bundle.checkpoint;
    for (const transaction of bundle.transactions.slice(0, start)) {
      const projected = projectCommandTransaction(checkpoint, [transaction.forward], surfaceCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Cannot fold saved Surface history.");
      checkpoint = projected.state;
    }
    // Discarding distant redo states must retain their forward/undo revision contribution.
    const offset = 2 * bundle.transactions.slice(end).filter((t) => t.forward.command.type === SURFACE_COMMAND_TYPES.replaceSource).length;
    if (offset) checkpoint = { ...checkpoint, identity: createDocumentIdentity(checkpoint.identity.id, checkpoint.source, checkpoint.identity.revision + offset) };
    const adapter = new SurfaceDocumentAdapter(checkpoint);
    for (const transaction of bundle.transactions.slice(start, end)) adapter.#execute(transaction.forward, transaction.inverse);
    while (adapter.#cursor > bundle.cursor - start) adapter.undo();
    adapter.#sequence = Math.max(adapter.#sequence, ...bundle.transactions.map((t) => Number(t.forward.commandId.match(/\/(\d+)\/forward$/)?.[1] ?? 0)));
    return adapter;
  }

  #commit(type: string, next: CanonicalJsonValue, previous: CanonicalJsonValue): SurfaceDocument {
    if (canonicalJsonStringify(next) === canonicalJsonStringify(previous)) return this.document();
    this.#sequence += 1;
    const origin = { kind: "interactive" as const, sourceId: "surface-workspace" };
    const forward = createCommandEnvelope({ commandId: `surface/edit/${this.#sequence}/forward`, origin, command: { type, payload: next } });
    const inverse = createCommandEnvelope({ commandId: `surface/edit/${this.#sequence}/inverse`, origin: { kind: "system", sourceId: "surface-undo" }, command: { type, payload: previous } });
    this.#execute(forward, inverse);
    return this.document();
  }
  #execute(forward: CommandEnvelope, inverse: CommandEnvelope): void {
    const transactionId = `surface/transaction/${this.#transactions.length + 1}`;
    const result = this.#kernel.transact({ transactionId, commands: [forward], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.map((entry) => entry.message).join(" "));
    this.#transactions.splice(this.#cursor);
    this.#transactions.push({ forward, inverse });
    this.#cursor += 1;
    this.#sequence = Math.max(this.#sequence, Number(forward.commandId.match(/\/(\d+)\/forward$/)?.[1] ?? 0));
    while (this.#transactions.length > 100) {
      const projected = projectCommandTransaction(this.#checkpoint, [this.#transactions[0]!.forward], surfaceCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Cannot advance Surface history checkpoint.");
      this.#checkpoint = projected.state; this.#transactions.shift(); this.#cursor -= 1;
    }
  }
}
