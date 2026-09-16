import {
  CURVE_COMMAND_TYPES, canonicalJsonStringify, createCommandEnvelope, createCurveCommandState,
  createCurveDocument, curveCommandDefinitions, parseCurveDocument, serializeCurveDocument,
  type CanonicalJsonValue, type CommandEnvelope, type CurveDocument, type CurveDocumentSource,
  type ScientificSourceGeneration,
} from "@math3d/core";
import { createInMemoryDocumentKernel } from "@math3d/kernel";
import type { CanonicalCurveDefinition } from "./contracts";

const canonical = <T>(value: T): T => {
  const omitUndefined = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(omitUndefined)
    : entry && typeof entry === "object"
      ? Object.fromEntries(Object.entries(entry).filter(([, child]) => child !== undefined).map(([key, child]) => [key, omitUndefined(child)]))
      : entry;
  return JSON.parse(canonicalJsonStringify(omitUndefined(value))) as T;
};

export const curveSourceFromLegacyDefinition = (definition: CanonicalCurveDefinition): CurveDocumentSource => ({
  representation: definition.representation,
  dimension: definition.dimension,
  domain: canonical(definition.domain),
  units: canonical(definition.units),
  orientation: canonical(definition.orientation) as CanonicalJsonValue,
  derivatives: canonical(definition.derivatives) as CanonicalJsonValue,
  definition: canonical(definition.source),
  dependencies: canonical(definition.dependencies) as CanonicalJsonValue,
});

export const curveDocumentFromLegacyDefinition = (definition: CanonicalCurveDefinition): CurveDocument => createCurveDocument({
  stableKey: { legacyCurveId: definition.identity.curveId },
  source: curveSourceFromLegacyDefinition(definition),
  metadata: {
    title: definition.identity.label,
    legacyCurveId: definition.identity.curveId,
    analysisSettings: canonical(definition.sampling) as CanonicalJsonValue,
  },
});

export type CurveReplayBundle = Readonly<{
  checkpoint: CurveDocument;
  transactions: readonly { forward: CommandEnvelope; inverse: CommandEnvelope }[];
  cursor: number;
}>;

export class CurveDocumentAdapter {
  #checkpoint: CurveDocument;
  #kernel;
  #transactions: { forward: CommandEnvelope; inverse: CommandEnvelope }[] = [];
  #cursor = 0;
  #sequence = 0;

  constructor(document: CurveDocument) {
    this.#checkpoint = createCurveCommandState(document);
    this.#kernel = createInMemoryDocumentKernel({ initialState: this.#checkpoint, commandDefinitions: curveCommandDefinitions, historyLimit: 100 });
  }

  document(): CurveDocument { return this.#kernel.query((state) => state) as CurveDocument; }
  sourceGeneration(): ScientificSourceGeneration {
    const { id, revision, structuralHash } = this.document().identity;
    return { documentId: id, revision, structuralHash, generation: revision };
  }
  history() { return this.#kernel.historyStatus(); }
  previewSource(source: CurveDocumentSource): CurveDocumentSource { return canonical(source); }
  serialize(): string { return serializeCurveDocument(this.document()); }
  static parse(text: string): CurveDocumentAdapter { return new CurveDocumentAdapter(parseCurveDocument(text)); }

  commitSource(source: CurveDocumentSource): CurveDocument {
    return this.#commit(CURVE_COMMAND_TYPES.replaceSource, source as CanonicalJsonValue, this.document().source as CanonicalJsonValue);
  }
  commitControlPoints(points: readonly (readonly number[])[]): CurveDocument {
    const source = this.document().source;
    if (!source.definition.controlPoints) throw new TypeError("The active Curve has no editable control points.");
    return this.commitSource({ ...source, definition: { ...source.definition, controlPoints: points.map((point) => [...point]), controlPointCount: points.length } });
  }
  setAnalysisSettings(settings: CanonicalJsonValue): CurveDocument {
    return this.#commit(CURVE_COMMAND_TYPES.setAnalysisSettings, settings, this.document().metadata.analysisSettings);
  }
  commitSelection(controlIds: readonly string[]): CurveDocument {
    return this.#commit(CURVE_COMMAND_TYPES.commitSelection, [...controlIds], [...this.document().selection.controlIds]);
  }
  syncLegacyDefinition(definition: CanonicalCurveDefinition): CurveDocument {
    this.commitSource(curveSourceFromLegacyDefinition(definition));
    return this.setAnalysisSettings(canonical(definition.sampling) as CanonicalJsonValue);
  }
  undo(): CurveDocument {
    if (this.#cursor === 0) return this.document();
    const result = this.#kernel.undo();
    if (!result.ok) throw new TypeError("Cannot undo Curve edit.");
    this.#cursor -= 1;
    return this.document();
  }
  redo(): CurveDocument {
    if (this.#cursor === this.#transactions.length) return this.document();
    const result = this.#kernel.redo();
    if (!result.ok) throw new TypeError("Cannot redo Curve edit.");
    this.#cursor += 1;
    return this.document();
  }
  replayBundle(): CurveReplayBundle { return { checkpoint: this.#checkpoint, transactions: [...this.#transactions], cursor: this.#cursor }; }
  static fromReplayBundle(bundle: CurveReplayBundle): CurveDocumentAdapter {
    const adapter = new CurveDocumentAdapter(bundle.checkpoint);
    for (const transaction of bundle.transactions) adapter.#execute(transaction.forward, transaction.inverse);
    while (adapter.#cursor > bundle.cursor) adapter.undo();
    return adapter;
  }

  #commit(type: string, next: CanonicalJsonValue, previous: CanonicalJsonValue): CurveDocument {
    if (canonicalJsonStringify(next) === canonicalJsonStringify(previous)) return this.document();
    this.#sequence += 1;
    const forward = createCommandEnvelope({ commandId: `curve/edit/${this.#sequence}/forward`, origin: { kind: "interactive", sourceId: "curve-workspace" }, command: { type, payload: next } });
    const inverse = createCommandEnvelope({ commandId: `curve/edit/${this.#sequence}/inverse`, origin: { kind: "system", sourceId: "curve-undo" }, command: { type, payload: previous } });
    this.#transactions.splice(this.#cursor);
    this.#execute(forward, inverse);
    return this.document();
  }
  #execute(forward: CommandEnvelope, inverse: CommandEnvelope): void {
    const result = this.#kernel.transact({ transactionId: `curve/transaction/${this.#transactions.length + 1}`, commands: [forward], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.map((entry) => entry.message).join(" "));
    this.#transactions.push({ forward, inverse });
    this.#cursor += 1;
    this.#sequence = Math.max(this.#sequence, this.#transactions.length);
  }
}
