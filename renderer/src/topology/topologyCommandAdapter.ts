import {
  TOPOLOGY_COMMAND_TYPES,
  createCommandEnvelope,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyCommandState,
  createTopologyDocument,
  createTopologyReplayBundle,
  replayTopologyCommandLog,
  topologyCommandDefinitions,
  type CanonicalJsonValue,
  type CommandOrigin,
  type TopologyCommandState,
  type TopologyDocument,
  type TopologyReplayBundle,
  type TopologyReplayTransaction,
  type TopologyDocumentSource,
} from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "@math3d/kernel";
import { cloneFundamentalDiagram } from "./quotientBuilder";
import type { FundamentalDiagram } from "./types";

const toModel = (diagram: FundamentalDiagram): Readonly<Record<string, CanonicalJsonValue>> =>
  JSON.parse(JSON.stringify(diagram)) as Record<string, CanonicalJsonValue>;

const sourceFor = (documentId: ReturnType<typeof createStableDocumentId>, diagram: FundamentalDiagram): TopologyDocumentSource => ({
  sourceId: `${documentId}/source`,
  kind: "fundamental-diagram",
  model: toModel(diagram),
});

const initialStateFor = (diagram: FundamentalDiagram) => {
  const documentId = createStableDocumentId("topology", { workflow: "fundamental-diagram-editor", diagramId: diagram.id });
  const source = sourceFor(documentId, diagram);
  return createTopologyCommandState(createTopologyDocument({
    identity: createDocumentIdentity(documentId, source),
    source,
    canonicalComplex: null,
    results: [],
    displayRealizations: [],
    provenance: {
      origin: "current-format-adapter",
      sourceFormat: "math3d-topology-editor",
      sourceVersion: 2,
      diagnostics: [],
    },
  }));
};

const diagramFromKernel = (kernel: InMemoryDocumentKernel<ReturnType<typeof initialStateFor>>): FundamentalDiagram =>
  cloneFundamentalDiagram(kernel.query((state) => state.document.source.model) as unknown as FundamentalDiagram);

/**
 * Compatibility bridge for the current React editor. Existing editing helpers create
 * a candidate source; only completed interactions cross this command boundary.
 */
export class TopologyDiagramCommandAdapter {
  #kernel: InMemoryDocumentKernel<ReturnType<typeof initialStateFor>>;
  #replayCheckpoint: TopologyCommandState;
  #replayTransactions: TopologyReplayTransaction[] = [];
  #replayCursor = 0;
  #sequence = 0;
  #completedTransactions = 0;

  constructor(diagram: FundamentalDiagram) {
    const initialState = initialStateFor(diagram);
    this.#replayCheckpoint = initialState;
    this.#kernel = this.#createKernel(initialState);
  }

  get completedTransactions(): number {
    return this.#completedTransactions;
  }

  current(): FundamentalDiagram {
    return diagramFromKernel(this.#kernel);
  }

  document(): TopologyDocument {
    return this.#kernel.query((state) => state.document) as TopologyDocument;
  }

  exportReplay(): TopologyReplayBundle {
    return createTopologyReplayBundle(this.#replayCheckpoint, this.#replayTransactions, this.#replayCursor);
  }

  static restore(replay: TopologyReplayBundle): TopologyDiagramCommandAdapter {
    const replayed = replayTopologyCommandLog(replay);
    if (!replayed.ok) throw new TypeError(replayed.errors.join(" "));
    if (replayed.value.document.source.kind !== "fundamental-diagram") {
      throw new TypeError("Topology diagram replay requires a fundamental-diagram source checkpoint.");
    }
    const checkpointDiagram = cloneFundamentalDiagram(replay.checkpoint.document.source.model as unknown as FundamentalDiagram);
    const adapter = new TopologyDiagramCommandAdapter(checkpointDiagram);
    adapter.#kernel = adapter.#createKernel(replay.checkpoint);
    adapter.#replayCheckpoint = replay.checkpoint;
    adapter.#replayTransactions = [];
    adapter.#replayCursor = 0;
    for (const transaction of replay.transactions) {
      const result = adapter.#kernel.transact({
        transactionId: transaction.transactionId,
        commands: transaction.commands,
        mode: "replay",
        history: { kind: "reversible", inverseCommands: transaction.inverseCommands },
      });
      if (!result.ok || result.event.stateHash !== transaction.stateHash) {
        throw new TypeError(`Could not restore replay transaction '${transaction.transactionId}'.`);
      }
      adapter.#replayTransactions.push(transaction);
      adapter.#replayCursor += 1;
    }
    for (let index = replay.transactions.length; index > replay.cursor; index -= 1) {
      const undone = adapter.#kernel.undo();
      if (!undone.ok) throw new TypeError("Could not restore the persisted replay cursor.");
      adapter.#replayCursor -= 1;
    }
    adapter.#sequence = Math.max(0, ...replay.transactions.flatMap((transaction) =>
      transaction.commands.map((command) => Number(command.commandId.match(/(\d+)$/)?.[1] ?? 0))
    ));
    adapter.#completedTransactions = 0;
    return adapter;
  }

  /** Pointer/hover previews are deliberately detached from command history. */
  preview(next: FundamentalDiagram): FundamentalDiagram {
    return cloneFundamentalDiagram(next);
  }

  commit(next: FundamentalDiagram, origin: CommandOrigin = { kind: "interactive", sourceId: "topology-diagram-editor" }): FundamentalDiagram {
    const previous = this.current();
    if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
    const transactionId = this.#nextId("edit");
    const forwardCommand = this.#replaceCommand(`${transactionId}/forward`, next, origin);
    const inverseCommand = this.#replaceCommand(`${transactionId}/inverse`, previous, { kind: "system", sourceId: "topology-undo" });
    const result = this.#kernel.transact({
      transactionId,
      commands: [forwardCommand],
      history: {
        kind: "reversible",
        inverseCommands: [inverseCommand],
      },
    });
    if (!result.ok) throw new Error(result.errors.map((entry) => entry.message).join(" "));
    this.#replayTransactions.splice(this.#replayCursor);
    this.#replayTransactions.push({
      transactionId,
      commands: [forwardCommand],
      inverseCommands: [inverseCommand],
      stateHash: result.event.stateHash,
    });
    this.#replayCursor += 1;
    return this.current();
  }

  /** Controlled import is a command boundary and intentionally clears edit history. */
  import(next: FundamentalDiagram): FundamentalDiagram {
    const transactionId = this.#nextId("import");
    const result = this.#kernel.transact({
      transactionId,
      mode: "import",
      commands: [this.#replaceCommand(`${transactionId}/source`, next, { kind: "import", sourceId: "topology-file" })],
      history: { kind: "irreversible" },
    });
    if (!result.ok) throw new Error(result.errors.map((entry) => entry.message).join(" "));
    this.#replayCheckpoint = this.#kernel.query((state) => state) as TopologyCommandState;
    this.#replayTransactions = [];
    this.#replayCursor = 0;
    return this.current();
  }

  undo(): FundamentalDiagram | null {
    const result = this.#kernel.undo();
    if (result.ok) this.#replayCursor = Math.max(0, this.#replayCursor - 1);
    return result.ok ? this.current() : null;
  }

  redo(): FundamentalDiagram | null {
    const result = this.#kernel.redo();
    if (result.ok) this.#replayCursor = Math.min(this.#replayTransactions.length, this.#replayCursor + 1);
    return result.ok ? this.current() : null;
  }

  /** Preset/template changes establish a new editor session rather than an edit. */
  reset(next: FundamentalDiagram): FundamentalDiagram {
    const initialState = initialStateFor(next);
    this.#kernel = this.#createKernel(initialState);
    this.#replayCheckpoint = initialState;
    this.#replayTransactions = [];
    this.#replayCursor = 0;
    return this.current();
  }

  #createKernel(state: TopologyCommandState) {
    const kernel = createInMemoryDocumentKernel({
      initialState: state,
      commandDefinitions: topologyCommandDefinitions,
      historyLimit: 100,
    });
    kernel.subscribe(() => { this.#completedTransactions += 1; });
    return kernel;
  }

  #nextId(kind: string): string {
    this.#sequence += 1;
    return `topology/${kind}/${this.#sequence}`;
  }

  #replaceCommand(commandId: string, diagram: FundamentalDiagram, origin: CommandOrigin) {
    const sourceId = this.#kernel.query((state) => state.document.source.sourceId);
    return createCommandEnvelope({
      commandId,
      origin,
      command: {
        type: TOPOLOGY_COMMAND_TYPES.replaceSource,
        payload: { sourceId, kind: "fundamental-diagram", model: toModel(diagram) },
      },
    });
  }
}
