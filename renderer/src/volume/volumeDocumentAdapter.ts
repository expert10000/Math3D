import {
  VOLUME_COMMAND_TYPES, canonicalJsonStringify, createCommandEnvelope, createVolumeCommandState,
  createVolumeDocument, parseVolumeDocument, serializeVolumeDocument, volumeCommandDefinitions,
  type CanonicalJsonValue, type CommandEnvelope, type ScientificSourceGeneration,
  type VolumeDocument, type VolumeDocumentSource,
} from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import type { VolumeObject } from "./contracts";

const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;

export const volumeSourceFromLegacyObject = (volume: VolumeObject): VolumeDocumentSource => ({
  representation: volume.representation,
  recipe: clone(volume.source) as VolumeDocumentSource["recipe"],
  spatial: {
    dimensions: [...volume.spatial.dimensions], origin: [...volume.spatial.origin], spacing: [...volume.spatial.spacing],
    direction: [...volume.spatial.direction], centering: volume.spatial.centering,
    coordinateSystem: volume.spatial.coordinateSystem, positionUnits: volume.spatial.positionUnits, valueUnits: volume.spatial.valueUnits,
  },
  dependencies: volume.provenance.dependencies.map((entry) => ({ ...entry })),
  payload: { handle: volume.storage.handle, byteLength: volume.storage.byteLength, scalarType: volume.storage.scalarType, components: volume.storage.components },
});

export const volumeDocumentFromLegacyObject = (volume: VolumeObject): VolumeDocument => createVolumeDocument({
  stableKey: { legacyVolumeId: volume.identity.volumeId }, source: volumeSourceFromLegacyObject(volume),
  metadata: { title: volume.identity.label, legacyVolumeId: volume.identity.volumeId, analysisSettings: {} },
});

export type VolumeReplayBundle = Readonly<{
  checkpoint: VolumeDocument;
  transactions: readonly { forward: CommandEnvelope; inverse: CommandEnvelope }[];
  cursor: number;
}>;

export class VolumeDocumentAdapter {
  #checkpoint: VolumeDocument;
  #kernel;
  #transactions: { forward: CommandEnvelope; inverse: CommandEnvelope }[] = [];
  #cursor = 0;
  #sequence = 0;

  constructor(document: VolumeDocument) {
    this.#checkpoint = createVolumeCommandState(document);
    this.#kernel = createInMemoryDocumentKernel({ initialState: this.#checkpoint, commandDefinitions: volumeCommandDefinitions, historyLimit: 100 });
  }
  document(): VolumeDocument { return this.#kernel.query((state) => state) as VolumeDocument; }
  sourceGeneration(): ScientificSourceGeneration {
    const { id, revision, structuralHash } = this.document().identity;
    return { documentId: id, revision, structuralHash, generation: revision };
  }
  history() { return this.#kernel.historyStatus(); }
  previewSource(source: VolumeDocumentSource): VolumeDocumentSource { return clone(source); }
  serialize(): string { return serializeVolumeDocument(this.document()); }
  static parse(text: string): VolumeDocumentAdapter { return new VolumeDocumentAdapter(parseVolumeDocument(text)); }
  commitSource(source: VolumeDocumentSource): VolumeDocument {
    return this.#commit(VOLUME_COMMAND_TYPES.replaceSource, source as CanonicalJsonValue, this.document().source as CanonicalJsonValue);
  }
  setAnalysisSettings(settings: CanonicalJsonValue): VolumeDocument {
    return this.#commit(VOLUME_COMMAND_TYPES.setAnalysisSettings, settings, this.document().metadata.analysisSettings);
  }
  setVisible(visible: boolean): VolumeDocument {
    return this.#commit(VOLUME_COMMAND_TYPES.setVisible, visible, this.document().display.visible);
  }
  syncLegacyObject(volume: VolumeObject): VolumeDocument { return this.commitSource(volumeSourceFromLegacyObject(volume)); }
  undo(): VolumeDocument {
    if (this.#cursor === 0) return this.document();
    const result = this.#kernel.undo();
    if (!result.ok) throw new TypeError("Cannot undo Volume edit.");
    this.#cursor -= 1;
    return this.document();
  }
  redo(): VolumeDocument {
    if (this.#cursor === this.#transactions.length) return this.document();
    const result = this.#kernel.redo();
    if (!result.ok) throw new TypeError("Cannot redo Volume edit.");
    this.#cursor += 1;
    return this.document();
  }
  replayBundle(): VolumeReplayBundle { return { checkpoint: this.#checkpoint, transactions: [...this.#transactions], cursor: this.#cursor }; }
  static fromReplayBundle(bundle: VolumeReplayBundle): VolumeDocumentAdapter {
    const adapter = new VolumeDocumentAdapter(bundle.checkpoint);
    for (const transaction of bundle.transactions) adapter.#execute(transaction.forward, transaction.inverse);
    while (adapter.#cursor > bundle.cursor) adapter.undo();
    return adapter;
  }
  #commit(type: string, next: CanonicalJsonValue, previous: CanonicalJsonValue): VolumeDocument {
    if (canonicalJsonStringify(next) === canonicalJsonStringify(previous)) return this.document();
    this.#sequence += 1;
    const forward = createCommandEnvelope({ commandId: `volume/edit/${this.#sequence}/forward`, origin: { kind: "interactive", sourceId: "volume-workspace" }, command: { type, payload: next } });
    const inverse = createCommandEnvelope({ commandId: `volume/edit/${this.#sequence}/inverse`, origin: { kind: "system", sourceId: "volume-undo" }, command: { type, payload: previous } });
    this.#transactions.splice(this.#cursor);
    this.#execute(forward, inverse);
    return this.document();
  }
  #execute(forward: CommandEnvelope, inverse: CommandEnvelope): void {
    const result = this.#kernel.transact({ transactionId: `volume/transaction/${this.#transactions.length + 1}`, commands: [forward], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.map((entry) => entry.message).join(" "));
    this.#transactions.push({ forward, inverse });
    this.#cursor += 1;
    this.#sequence = Math.max(this.#sequence, this.#transactions.length);
  }
}
