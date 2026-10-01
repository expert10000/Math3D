import {
  VOLUME_COMMAND_TYPES, canonicalJsonStringify, createCommandEnvelope, createVolumeCommandState,
  createVolumeDocument, parseVolumeDocument, serializeVolumeDocument, volumeCommandDefinitions,
  projectCommandTransaction, immutableCanonicalJsonClone,
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
  replayBundle(): VolumeReplayBundle {
    this.#synchronizeReplayRevision();
    // The generic deep-readonly helper widens tuples; cloning retains their shape.
    return immutableCanonicalJsonClone({ checkpoint: this.#checkpoint, transactions: this.#transactions, cursor: this.#cursor }) as VolumeReplayBundle;
  }
  static fromReplayBundle(bundle: VolumeReplayBundle): VolumeDocumentAdapter {
    // Older exports retained the entire command log despite the kernel's 100-edit
    // native window. Fold their prefix into a checkpoint while retaining that window.
    if (!Array.isArray(bundle.transactions) || bundle.transactions.length > 10_000 || !Number.isSafeInteger(bundle.cursor) || bundle.cursor < 0 || bundle.cursor > bundle.transactions.length || bundle.transactions.length - bundle.cursor > 100)
      throw new TypeError("Invalid or oversized Volume replay history.");
    const adapter = new VolumeDocumentAdapter(bundle.checkpoint);
    for (const transaction of bundle.transactions) adapter.#execute(transaction.forward, transaction.inverse);
    for (let remaining = bundle.transactions.length - bundle.cursor; remaining > 0; remaining--) adapter.undo();
    return adapter;
  }
  #commit(type: string, next: CanonicalJsonValue, previous: CanonicalJsonValue): VolumeDocument {
    if (canonicalJsonStringify(next) === canonicalJsonStringify(previous)) return this.document();
    this.#sequence += 1;
    const forward = createCommandEnvelope({ commandId: `volume/edit/${this.#sequence}/forward`, origin: { kind: "interactive", sourceId: "volume-workspace" }, command: { type, payload: next } });
    const inverse = createCommandEnvelope({ commandId: `volume/edit/${this.#sequence}/inverse`, origin: { kind: "system", sourceId: "volume-undo" }, command: { type, payload: previous } });
    this.#execute(forward, inverse);
    return this.document();
  }
  #execute(forward: CommandEnvelope, inverse: CommandEnvelope): void {
    forward = createCommandEnvelope(forward); inverse = createCommandEnvelope(inverse);
    const result = this.#kernel.transact({ transactionId: forward.commandId.replace(/\/forward$/, ""), commands: [forward], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.map((entry) => entry.message).join(" "));
    this.#transactions.splice(this.#cursor);
    this.#transactions.push({ forward, inverse });
    this.#cursor += 1;
    this.#sequence = Math.max(this.#sequence, Number(forward.commandId.match(/volume\/edit\/(\d+)\//)?.[1] ?? 0));
    while (this.#transactions.length > 100) {
      const projected = projectCommandTransaction(this.#checkpoint, [this.#transactions[0]!.forward], volumeCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Could not advance the Volume replay checkpoint.");
      this.#checkpoint = projected.state; this.#transactions.shift(); this.#cursor -= 1;
    }
  }

  #synchronizeReplayRevision(): void {
    let state = this.#checkpoint;
    for (const entry of this.#transactions) {
      const projected = projectCommandTransaction(state, [entry.forward], volumeCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Could not project Volume replay history.");
      state = projected.state;
    }
    for (let index = this.#transactions.length - 1; index >= this.#cursor; index--) {
      const projected = projectCommandTransaction(state, [this.#transactions[index]!.inverse], volumeCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Could not project Volume replay cursor.");
      state = projected.state;
    }
    const offset = this.document().identity.revision - state.identity.revision;
    if (offset) this.#checkpoint = createVolumeDocument({ ...this.#checkpoint, identity: { ...this.#checkpoint.identity, revision: this.#checkpoint.identity.revision + offset } });
  }
}
