import {
  createCommandEnvelope, graph2dCommandDefinitions, GRAPH2D_COMMAND_TYPES,
  normalizeGraph2DDocument, type Graph2DCommandState, type Graph2DDocument, type Graph2DViewport,
  type Graph2DSceneOperation,
} from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "@math3d/kernel";

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

  commitViewport(viewport: Graph2DViewport): Graph2DDocument {
    const before = this.document();
    if (JSON.stringify(before.display.viewport) === JSON.stringify(viewport)) return before;
    const transactionId = `graph2d/viewport/${++this.#sequence}`;
    const command = (id: string, value: Graph2DViewport) => createCommandEnvelope({ commandId: id,
      origin: { kind: "interactive", sourceId: "graph2d-workspace" },
      command: { type: GRAPH2D_COMMAND_TYPES.setViewport, payload: { viewport: value } } });
    const result = this.#kernel.transact({ transactionId, commands: [command(`${transactionId}/forward`, viewport)],
      history: { kind: "reversible", inverseCommands: [command(`${transactionId}/inverse`, before.display.viewport)] } });
    if (!result.ok) throw new TypeError(result.errors.map((error) => error.message).join(" "));
    return this.document();
  }

  commitScene(candidate: Pick<Graph2DDocument, "source" | "display" | "selection">, operation: Graph2DSceneOperation): Graph2DDocument {
    const before = this.document();
    const transactionId = `graph2d/scene/${++this.#sequence}`;
    const command = (id: string, scene: Pick<Graph2DDocument, "source" | "display" | "selection">, action: Graph2DSceneOperation) =>
      createCommandEnvelope({ commandId: id, origin: { kind: "interactive", sourceId: "graph2d-workspace" },
        command: { type: GRAPH2D_COMMAND_TYPES.replaceScene, payload: { ...scene, operation: action } } });
    const result = this.#kernel.transact({ transactionId,
      commands: [command(`${transactionId}/forward`, candidate, operation)],
      history: { kind: "reversible", inverseCommands: [command(`${transactionId}/inverse`,
        { source: before.source, display: before.display, selection: before.selection }, "restore")] } });
    if (!result.ok) throw new TypeError(result.errors.map((error) => error.message).join(" "));
    return this.document();
  }

  undo(): Graph2DDocument | null { return this.#kernel.undo().ok ? this.document() : null; }
  redo(): Graph2DDocument | null { return this.#kernel.redo().ok ? this.document() : null; }
}
