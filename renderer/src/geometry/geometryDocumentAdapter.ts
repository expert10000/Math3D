import {
  GEOMETRY_COMMAND_TYPES,
  canonicalJsonStringify,
  createCommandEnvelope,
  createGeometryCommandState,
  geometryCommandDefinitions,
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
  command: CommandEnvelope;
  inverse: CommandEnvelope;
  stateHash: StructuralHash;
}>;

export type GeometryReplayBundle = Readonly<{
  checkpoint: GeometryCommandState;
  transactions: readonly GeometryReplayTransaction[];
  cursor: number;
}>;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
const payload = (value: unknown): CanonicalJsonValue => value as CanonicalJsonValue;

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
  history() { return this.#kernel.historyStatus(); }
  previewSource(source: GeometryDocumentSource): GeometryDocumentSource { return clone(source); }

  commitSource(source: GeometryDocumentSource, origin: CommandOrigin = { kind: "interactive", sourceId: "geometry-workspace" }): GeometryDocument {
    return this.#commit(GEOMETRY_COMMAND_TYPES.replaceSource, source, this.document().source, origin);
  }

  commitDisplay(display: GeometryDocumentDisplay, origin: CommandOrigin = { kind: "interactive", sourceId: "geometry-view" }): GeometryDocument {
    return this.#commit(GEOMETRY_COMMAND_TYPES.replaceDisplay, display, this.document().display, origin);
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
        commands: [transaction.command],
        mode: "replay",
        history: { kind: "reversible", inverseCommands: [transaction.inverse] },
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
    adapter.#sequence = bundle.transactions.length;
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
    this.#transactions.push({ transactionId, command, inverse, stateHash: result.event.stateHash });
    this.#cursor += 1;
    return this.document();
  }
}
