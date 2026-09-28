import { createCommandEnvelope, graph2dCommandDefinitions, GRAPH2D_COMMAND_TYPES, normalizeGraph2DDocument,
  type Graph2DCommandState, type Graph2DDocument, type Graph2DViewport, type Graph2DSelection,
  type Graph2DSceneOperation, type CanonicalJsonValue } from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "./inMemoryDocumentKernel";

/** Platform-neutral Graph2D command history shared by desktop and native mobile. */
export class Graph2DCommandAdapter {
  readonly #kernel: InMemoryDocumentKernel<Graph2DCommandState>;
  #sequence = 0;
  constructor(document: Graph2DDocument) {
    const normalized = normalizeGraph2DDocument(document);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    this.#kernel = createInMemoryDocumentKernel({ initialState: { document: normalized.value },
      commandDefinitions: graph2dCommandDefinitions, historyLimit: 100 });
  }
  document(): Graph2DDocument { return this.#kernel.query((state) => state.document) as Graph2DDocument; }
  history() { return this.#kernel.historyStatus(); }
  #commit(type: string, payload: CanonicalJsonValue, inverse: CanonicalJsonValue) {
    const transactionId = `graph2d/${++this.#sequence}`;
    const command = (id: string, value: CanonicalJsonValue) => createCommandEnvelope({ commandId: id,
      origin: { kind: "interactive", sourceId: "graph2d-workspace" }, command: { type, payload: value } });
    const result = this.#kernel.transact({ transactionId, commands: [command(`${transactionId}/forward`, payload)],
      history: { kind: "reversible", inverseCommands: [command(`${transactionId}/inverse`, inverse)] } });
    if (!result.ok) throw new TypeError(result.errors.map((error) => error.message).join(" "));
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
  undo(): Graph2DDocument | null { return this.#kernel.undo().ok ? this.document() : null; }
  redo(): Graph2DDocument | null { return this.#kernel.redo().ok ? this.document() : null; }
}
