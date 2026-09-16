import {
  SURFACE_COMMAND_TYPES, canonicalJsonStringify, createCommandEnvelope, createSurfaceCommandState,
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
  replayBundle(): SurfaceReplayBundle { return { checkpoint: this.#checkpoint, transactions: [...this.#transactions], cursor: this.#cursor }; }
  static fromReplayBundle(bundle: SurfaceReplayBundle): SurfaceDocumentAdapter {
    const adapter = new SurfaceDocumentAdapter(bundle.checkpoint);
    for (const transaction of bundle.transactions) adapter.#execute(transaction.forward, transaction.inverse);
    while (adapter.#cursor > bundle.cursor) adapter.undo();
    return adapter;
  }

  #commit(type: string, next: CanonicalJsonValue, previous: CanonicalJsonValue): SurfaceDocument {
    if (canonicalJsonStringify(next) === canonicalJsonStringify(previous)) return this.document();
    this.#sequence += 1;
    const origin = { kind: "interactive" as const, sourceId: "surface-workspace" };
    const forward = createCommandEnvelope({ commandId: `surface/edit/${this.#sequence}/forward`, origin, command: { type, payload: next } });
    const inverse = createCommandEnvelope({ commandId: `surface/edit/${this.#sequence}/inverse`, origin: { kind: "system", sourceId: "surface-undo" }, command: { type, payload: previous } });
    this.#transactions.splice(this.#cursor);
    this.#execute(forward, inverse);
    return this.document();
  }
  #execute(forward: CommandEnvelope, inverse: CommandEnvelope): void {
    const transactionId = `surface/transaction/${this.#transactions.length + 1}`;
    const result = this.#kernel.transact({ transactionId, commands: [forward], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.map((entry) => entry.message).join(" "));
    this.#transactions.push({ forward, inverse });
    this.#cursor += 1;
    this.#sequence = Math.max(this.#sequence, this.#transactions.length);
  }
}
