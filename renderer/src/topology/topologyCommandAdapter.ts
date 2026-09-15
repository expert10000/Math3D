import {
  TOPOLOGY_COMMAND_TYPES,
  createCommandEnvelope,
  createDocumentIdentity,
  createStableDocumentId,
  createTopologyCommandState,
  createTopologyDocument,
  topologyCommandDefinitions,
  type CanonicalJsonValue,
  type CommandOrigin,
  type TopologyDocument,
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
  #sequence = 0;
  #completedTransactions = 0;

  constructor(diagram: FundamentalDiagram) {
    this.#kernel = this.#createKernel(diagram);
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

  /** Pointer/hover previews are deliberately detached from command history. */
  preview(next: FundamentalDiagram): FundamentalDiagram {
    return cloneFundamentalDiagram(next);
  }

  commit(next: FundamentalDiagram, origin: CommandOrigin = { kind: "interactive", sourceId: "topology-diagram-editor" }): FundamentalDiagram {
    const previous = this.current();
    if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
    const transactionId = this.#nextId("edit");
    const result = this.#kernel.transact({
      transactionId,
      commands: [this.#replaceCommand(`${transactionId}/forward`, next, origin)],
      history: {
        kind: "reversible",
        inverseCommands: [this.#replaceCommand(`${transactionId}/inverse`, previous, { kind: "system", sourceId: "topology-undo" })],
      },
    });
    if (!result.ok) throw new Error(result.errors.map((entry) => entry.message).join(" "));
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
    return this.current();
  }

  undo(): FundamentalDiagram | null {
    const result = this.#kernel.undo();
    return result.ok ? this.current() : null;
  }

  redo(): FundamentalDiagram | null {
    const result = this.#kernel.redo();
    return result.ok ? this.current() : null;
  }

  /** Preset/template changes establish a new editor session rather than an edit. */
  reset(next: FundamentalDiagram): FundamentalDiagram {
    this.#kernel = this.#createKernel(next);
    return this.current();
  }

  #createKernel(diagram: FundamentalDiagram) {
    const kernel = createInMemoryDocumentKernel({
      initialState: initialStateFor(diagram),
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
