import {
  GEOMETRY_COMMAND_TYPES,
  canonicalJsonStringify,
  createCommandEnvelope,
  createGeometryCommandState,
  geometryCommandDefinitions,
  projectCommandTransaction, structuralHash,
  type CanonicalJsonValue,
  type CommandEnvelope,
  type CommandOrigin,
  type GeometryCommandState,
  type GeometryDocument,
  type GeometryDocumentDisplay,
  type GeometryDocumentSource,
  type StructuralHash,
} from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "@math3d/kernel";

export type GeometryReplayTransaction = Readonly<{
  transactionId: string;
  commands: readonly CommandEnvelope[];
  inverseCommands: readonly CommandEnvelope[];
  stateHash: StructuralHash;
}>;

export type GeometryReplayBundle = Readonly<{
  checkpoint: GeometryCommandState;
  transactions: readonly GeometryReplayTransaction[];
  cursor: number;
}>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
const payload = (value: unknown): CanonicalJsonValue => value as CanonicalJsonValue;
export type GeometryAdapterCommand = Readonly<{
  type: typeof GEOMETRY_COMMAND_TYPES[keyof typeof GEOMETRY_COMMAND_TYPES];
  payload: CanonicalJsonValue;
}>;

export class GeometryDocumentAdapter {
  #kernel: InMemoryDocumentKernel<GeometryCommandState>;
  #checkpoint: GeometryCommandState;
  #transactions: GeometryReplayTransaction[] = [];
  #cursor = 0;
  #sequence = 0;

  constructor(document: GeometryDocument) {
    this.#checkpoint = createGeometryCommandState(document);
    this.#kernel = this.#createKernel(this.#checkpoint);
  }

  document(): GeometryDocument { return this.#kernel.query((state) => state.document) as GeometryDocument; }
  state(): GeometryCommandState { return this.#kernel.query((state) => state) as GeometryCommandState; }
  committedSelectionIds(): readonly string[] { return this.state().committedSelection.entityIds; }
  history() { return this.#kernel.historyStatus(); }
  previewSource(source: GeometryDocumentSource): GeometryDocumentSource { return clone(source); }

  commitSource(source: GeometryDocumentSource, origin: CommandOrigin = { kind: "interactive", sourceId: "geometry-workspace" }): GeometryDocument {
    return this.#commit(GEOMETRY_COMMAND_TYPES.replaceSource, source, this.document().source, origin);
  }

  commitDisplay(display: GeometryDocumentDisplay, origin: CommandOrigin = { kind: "interactive", sourceId: "geometry-view" }): GeometryDocument {
    return this.#commit(GEOMETRY_COMMAND_TYPES.replaceDisplay, display, this.document().display, origin);
  }

  dispatch(
    commands: readonly GeometryAdapterCommand[],
    origin: CommandOrigin = { kind: "interactive", sourceId: "geometry-gui" }
  ): GeometryCommandState {
    if (!commands.length) return this.state();
    const before = this.state();
    this.#sequence += 1;
    const transactionId = `geometry/batch/${this.#sequence}`;
    const envelopes = commands.map((entry, index) => createCommandEnvelope({
      commandId: `${transactionId}/forward/${index + 1}`,
      origin,
      command: { type: entry.type, payload: entry.payload },
    }));
    const inverseCommands = [
      createCommandEnvelope({ commandId: `${transactionId}/inverse/source`, origin: { kind: "system", sourceId: "geometry-undo" }, command: { type: GEOMETRY_COMMAND_TYPES.replaceSource, payload: payload(before.document.source) } }),
      createCommandEnvelope({ commandId: `${transactionId}/inverse/display`, origin: { kind: "system", sourceId: "geometry-undo" }, command: { type: GEOMETRY_COMMAND_TYPES.replaceDisplay, payload: payload(before.document.display) } }),
      createCommandEnvelope({ commandId: `${transactionId}/inverse/selection`, origin: { kind: "system", sourceId: "geometry-undo" }, command: { type: GEOMETRY_COMMAND_TYPES.commitSelection, payload: payload(before.committedSelection) } }),
    ];
    const result = this.#kernel.transact({ transactionId, commands: envelopes, history: { kind: "reversible", inverseCommands } });
    if (!result.ok) throw new TypeError(result.errors.flatMap((error) => error.transactionErrors?.flatMap((entry) => entry.messages) ?? [error.message]).join(" "));
    this.#transactions.splice(this.#cursor);
    this.#transactions.push({ transactionId, commands: envelopes, inverseCommands, stateHash: result.event.stateHash });
    this.#cursor += 1;
    this.#trimHistory();
    return this.state();
  }

  undo(): GeometryDocument | null {
    const result = this.#kernel.undo();
    if (result.ok) this.#cursor = Math.max(0, this.#cursor - 1);
    return result.ok ? this.document() : null;
  }

  redo(): GeometryDocument | null {
    const result = this.#kernel.redo();
    if (result.ok) this.#cursor = Math.min(this.#transactions.length, this.#cursor + 1);
    return result.ok ? this.document() : null;
  }

  exportReplay(): GeometryReplayBundle {
    const project = (checkpoint: GeometryCommandState, hashes: boolean) => {
      let state = checkpoint;
      for (let i = 0; i < this.#transactions.length; i++) {
        const transaction = this.#transactions[i]!;
        const result = projectCommandTransaction(state, transaction.commands, geometryCommandDefinitions, "replay");
        if (!result.ok) throw new TypeError("Cannot project Geometry history.");
        state = result.state;
        if (hashes) this.#transactions[i] = { ...transaction, stateHash: structuralHash(state) };
      }
      for (let i = this.#transactions.length - 1; i >= this.#cursor; i--) {
        const result = projectCommandTransaction(state, this.#transactions[i]!.inverseCommands, geometryCommandDefinitions, "replay");
        if (!result.ok) throw new TypeError("Cannot project Geometry undo cursor.");
        state = result.state;
      }
      return state;
    };
    const offset = this.document().identity.revision - project(this.#checkpoint, false).document.identity.revision;
    if (offset) {
      this.#checkpoint = { ...this.#checkpoint, document: { ...this.#checkpoint.document, identity: { ...this.#checkpoint.document.identity, revision: this.#checkpoint.document.identity.revision + offset } } };
      project(this.#checkpoint, true);
    }
    return clone({ checkpoint: this.#checkpoint, transactions: this.#transactions, cursor: this.#cursor });
  }

  static restore(bundle: GeometryReplayBundle): GeometryDocumentAdapter {
    if (!Number.isSafeInteger(bundle.cursor) || bundle.cursor < 0 || bundle.cursor > bundle.transactions.length) {
      throw new TypeError("Geometry replay cursor is invalid.");
    }
    const adapter = new GeometryDocumentAdapter(bundle.checkpoint.document);
    adapter.#checkpoint = clone(bundle.checkpoint);
    adapter.#kernel = adapter.#createKernel(adapter.#checkpoint);
    for (const transaction of bundle.transactions) {
      const result = adapter.#kernel.transact({
        transactionId: transaction.transactionId,
        commands: transaction.commands,
        mode: "replay",
        history: { kind: "reversible", inverseCommands: transaction.inverseCommands },
      });
      if (!result.ok || result.event.stateHash !== transaction.stateHash) throw new TypeError(`Could not restore Geometry transaction '${transaction.transactionId}'.`);
      adapter.#transactions.push(clone(transaction));
      adapter.#cursor += 1;
    }
    while (adapter.#cursor > bundle.cursor) {
      const undone = adapter.#kernel.undo();
      if (!undone.ok) throw new TypeError("Could not restore Geometry replay cursor.");
      adapter.#cursor -= 1;
    }
    adapter.#sequence = Math.max(0, ...bundle.transactions.map((transaction) => Number(transaction.transactionId.match(/\/(\d+)$/)?.[1] ?? 0)));
    return adapter;
  }

  #createKernel(initialState: GeometryCommandState) {
    return createInMemoryDocumentKernel({ initialState, commandDefinitions: geometryCommandDefinitions, historyLimit: 100 });
  }

  #commit(
    type: typeof GEOMETRY_COMMAND_TYPES[keyof typeof GEOMETRY_COMMAND_TYPES],
    next: GeometryDocumentSource | GeometryDocumentDisplay,
    previous: GeometryDocumentSource | GeometryDocumentDisplay,
    origin: CommandOrigin
  ): GeometryDocument {
    if (canonicalJsonStringify(next) === canonicalJsonStringify(previous)) return this.document();
    this.#sequence += 1;
    const transactionId = `geometry/edit/${this.#sequence}`;
    const command = createCommandEnvelope({ commandId: `${transactionId}/forward`, origin, command: { type, payload: payload(next) } });
    const inverse = createCommandEnvelope({ commandId: `${transactionId}/inverse`, origin: { kind: "system", sourceId: "geometry-undo" }, command: { type, payload: payload(previous) } });
    const result = this.#kernel.transact({ transactionId, commands: [command], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.flatMap((error) => error.transactionErrors?.flatMap((entry) => entry.messages) ?? [error.message]).join(" "));
    this.#transactions.splice(this.#cursor);
    this.#transactions.push({ transactionId, commands: [command], inverseCommands: [inverse], stateHash: result.event.stateHash });
    this.#cursor += 1;
    this.#trimHistory();
    return this.document();
  }

  #trimHistory(): void {
    while (this.#transactions.length > 100) {
      const projected = projectCommandTransaction(this.#checkpoint, this.#transactions[0]!.commands, geometryCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Cannot advance Geometry history checkpoint.");
      this.#checkpoint = projected.state; this.#transactions.shift(); this.#cursor -= 1;
    }
  }
}
