import { createCommandEnvelope, graph2dCommandDefinitions, GRAPH2D_COMMAND_TYPES, normalizeGraph2DDocument,
  type Graph2DCommandState, type Graph2DDocument, type Graph2DViewport, type Graph2DSelection,
  projectCommandTransaction, structuralHash,
  type CommandEnvelope, type StructuralHash,
  type Graph2DSceneOperation, type CanonicalJsonValue } from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "./inMemoryDocumentKernel";

/** Platform-neutral Graph2D command history shared by desktop and native mobile. */
export type Graph2DReplayBundle = Readonly<{
  checkpoint: Graph2DCommandState;
  transactions: readonly Readonly<{ transactionId: string; commands: readonly CommandEnvelope[]; inverseCommands: readonly CommandEnvelope[]; stateHash: StructuralHash }>[];
  cursor: number;
}>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export class Graph2DCommandAdapter {
  readonly #kernel: InMemoryDocumentKernel<Graph2DCommandState>;
  #checkpoint: Graph2DCommandState;
  #transactions: Graph2DReplayBundle["transactions"][number][] = [];
  #cursor = 0;
  #sequence = 0;
  constructor(document: Graph2DDocument) {
    const normalized = normalizeGraph2DDocument(document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    this.#checkpoint = { document: normalized.value };
    this.#kernel = createInMemoryDocumentKernel({ initialState: this.#checkpoint,
      commandDefinitions: graph2dCommandDefinitions, historyLimit: 100 });
  }
  document(): Graph2DDocument { return this.#kernel.query((state) => state.document) as Graph2DDocument; }
  history() { return this.#kernel.historyStatus(); }
  #commit(type: string, payload: CanonicalJsonValue, inverse: CanonicalJsonValue) {
    const transactionId = `graph2d/${++this.#sequence}`;
    const command = (id: string, value: CanonicalJsonValue) => createCommandEnvelope({ commandId: id,
      origin: { kind: "interactive", sourceId: "graph2d-workspace" }, command: { type, payload: value } });
    const commands = [command(`${transactionId}/forward`, payload)], inverseCommands = [command(`${transactionId}/inverse`, inverse)];
    const result = this.#kernel.transact({ transactionId, commands,
      history: { kind: "reversible", inverseCommands } });
    if (!result.ok) throw new TypeError(result.errors.map((error) => error.message).join(" "));
    this.#transactions.splice(this.#cursor);
    this.#transactions.push({ transactionId, commands, inverseCommands, stateHash: result.event.stateHash });
    this.#cursor++;
    while (this.#transactions.length > 100) {
      const projected = projectCommandTransaction(this.#checkpoint, this.#transactions[0]!.commands, graph2dCommandDefinitions, "replay");
      if (!projected.ok) throw new TypeError("Cannot advance Graph history checkpoint.");
      this.#checkpoint = projected.state; this.#transactions.shift(); this.#cursor--;
    }
    return this.document();
  }
  commitViewport(viewport: Graph2DViewport): Graph2DDocument {
    const before = this.document();
    if (JSON.stringify(before.display.viewport) === JSON.stringify(viewport)) return before;
    return this.#commit(GRAPH2D_COMMAND_TYPES.setViewport, { viewport }, { viewport: before.display.viewport });
  }
  commitSelection(selection: Graph2DSelection): Graph2DDocument {
    const before = this.document();
    if (JSON.stringify(before.selection) === JSON.stringify(selection)) return before;
    return this.#commit(GRAPH2D_COMMAND_TYPES.setSelection,
      { selection } as CanonicalJsonValue, { selection: before.selection } as CanonicalJsonValue);
  }
  commitScene(candidate: Pick<Graph2DDocument, "source" | "display" | "selection">, operation: Graph2DSceneOperation): Graph2DDocument {
    const before = this.document();
    return this.#commit(GRAPH2D_COMMAND_TYPES.replaceScene, { ...candidate, operation } as CanonicalJsonValue,
      { source: before.source, display: before.display, selection: before.selection, operation: "restore" } as CanonicalJsonValue);
  }
  commitGridMode(mode: "cartesian" | "polar"): Graph2DDocument {
    const before = this.document();
    if ((before.display.axes.gridMode ?? "cartesian") === mode) return before;
    return this.commitScene({ source: before.source, selection: before.selection,
      display: { ...before.display, axes: { ...before.display.axes, gridMode: mode } } }, "grid-mode");
  }
  undo(): Graph2DDocument | null { if (!this.#kernel.undo().ok) return null; this.#cursor--; return this.document(); }
  redo(): Graph2DDocument | null { if (!this.#kernel.redo().ok) return null; this.#cursor++; return this.document(); }
  exportReplay(): Graph2DReplayBundle {
    const project = (checkpoint: Graph2DCommandState, updateHashes: boolean) => {
      let state = checkpoint;
      for (let i = 0; i < this.#transactions.length; i++) {
        const result = projectCommandTransaction(state, this.#transactions[i]!.commands, graph2dCommandDefinitions, "replay");
        if (!result.ok) throw new TypeError("Cannot project Graph history.");
        state = result.state;
        if (updateHashes) this.#transactions[i] = { ...this.#transactions[i]!, stateHash: structuralHash(state) };
      }
      for (let i = this.#transactions.length - 1; i >= this.#cursor; i--) {
        const result = projectCommandTransaction(state, this.#transactions[i]!.inverseCommands, graph2dCommandDefinitions, "replay");
        if (!result.ok) throw new TypeError("Cannot project Graph undo cursor.");
        state = result.state;
      }
      return state;
    };
    const offset = this.document().identity.revision - project(this.#checkpoint, false).document.identity.revision;
    if (offset) {
      this.#checkpoint = { document: { ...this.#checkpoint.document, identity: { ...this.#checkpoint.document.identity, revision: this.#checkpoint.document.identity.revision + offset } } };
      project(this.#checkpoint, true);
    }
    return clone({ checkpoint: this.#checkpoint, transactions: this.#transactions, cursor: this.#cursor });
  }
  static restore(bundle: Graph2DReplayBundle): Graph2DCommandAdapter {
    if (!bundle || !Array.isArray(bundle.transactions) || bundle.transactions.length > 100 || !Number.isSafeInteger(bundle.cursor) || bundle.cursor < 0 || bundle.cursor > bundle.transactions.length)
      throw new TypeError("Invalid Graph replay cursor or history size.");
    const adapter = new Graph2DCommandAdapter(bundle.checkpoint.document);
    const ids = new Set<string>();
    for (const transaction of bundle.transactions) {
      if (ids.has(transaction.transactionId)) throw new TypeError("Duplicate Graph replay transaction.");
      ids.add(transaction.transactionId);
      const result = adapter.#kernel.transact({ transactionId: transaction.transactionId, commands: transaction.commands,
        mode: "replay", history: { kind: "reversible", inverseCommands: transaction.inverseCommands } });
      if (!result.ok || result.event.stateHash !== transaction.stateHash) throw new TypeError("Graph replay transaction failed verification.");
      adapter.#transactions.push(clone(transaction)); adapter.#cursor++;
    }
    while (adapter.#cursor > bundle.cursor) if (!adapter.undo()) throw new TypeError("Cannot restore Graph undo cursor.");
    adapter.#sequence = Math.max(0, ...bundle.transactions.map(transaction => Number(transaction.transactionId.match(/^graph2d\/(\d+)$/)?.[1] ?? 0)));
    return adapter;
  }
}
