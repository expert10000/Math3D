import {
  COMPLEX_COMMAND_TYPES,
  createCommandEnvelope,
  createComplexCommandState,
  type CanonicalJsonValue,
  type CommandOrigin,
  type ComplexAnalysisDocument,
  type ComplexAnalysisStructuralSource,
  type ComplexCommandState,
  type ComplexCommittedSelection,
  type ComplexExpressionVariable,
  type ComplexReplayBundle,
  type ComplexReplayTransaction,
  type ComplexValueSurfaceRequest,
  createComplexReplayBundle,
  replayComplexCommandLog,
  complexCommandDefinitions,
  parseComplexExpressionAst,
} from "@math3d/core";
import { createInMemoryDocumentKernel, type InMemoryDocumentKernel } from "@math3d/kernel";
import { compileComplexExpressionAstPreview, type ComplexPreviewCompileResult } from "./complexExpr";

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;
const fieldCommands = [
  ["function", COMPLEX_COMMAND_TYPES.setFunction], ["parameters", COMPLEX_COMMAND_TYPES.setParameters],
  ["domain", COMPLEX_COMMAND_TYPES.setDomain], ["sampling", COMPLEX_COMMAND_TYPES.setSampling],
  ["contours", COMPLEX_COMMAND_TYPES.setContours], ["branchPolicy", COMPLEX_COMMAND_TYPES.setBranchPolicy],
  ["covering", COMPLEX_COMMAND_TYPES.setCovering], ["mobius", COMPLEX_COMMAND_TYPES.setMobius],
] as const;

export class ComplexAnalysisCommandAdapter {
  #kernel: InMemoryDocumentKernel<ComplexCommandState>;
  #replayCheckpoint: ComplexCommandState;
  #replayTransactions: ComplexReplayTransaction[] = [];
  #replayCursor = 0;
  #sequence = 0;

  constructor(document: ComplexAnalysisDocument) {
    this.#replayCheckpoint = createComplexCommandState(document);
    this.#kernel = createInMemoryDocumentKernel({ initialState: this.#replayCheckpoint, commandDefinitions: complexCommandDefinitions, historyLimit: 100 });
  }

  document(): ComplexAnalysisDocument { return this.#kernel.query((state) => state.document) as ComplexAnalysisDocument; }
  state(): ComplexCommandState { return this.#kernel.query((state) => state) as ComplexCommandState; }
  history() { return this.#kernel.historyStatus(); }
  exportReplay(): ComplexReplayBundle { return createComplexReplayBundle(this.#replayCheckpoint, this.#replayTransactions, this.#replayCursor); }

  static restore(replay: ComplexReplayBundle): ComplexAnalysisCommandAdapter {
    const replayed = replayComplexCommandLog(replay);
    if (!replayed.ok) throw new TypeError(replayed.errors.join(" "));
    const adapter = new ComplexAnalysisCommandAdapter(replay.checkpoint.document);
    adapter.#kernel = createInMemoryDocumentKernel({ initialState: replay.checkpoint, commandDefinitions: complexCommandDefinitions, historyLimit: 100 });
    adapter.#replayCheckpoint = replay.checkpoint;
    adapter.#replayTransactions = [];
    adapter.#replayCursor = 0;
    for (const transaction of replay.transactions) {
      const result = adapter.#kernel.transact({ transactionId: transaction.transactionId, commands: transaction.commands, mode: "replay", history: { kind: "reversible", inverseCommands: transaction.inverseCommands } });
      if (!result.ok || result.event.stateHash !== transaction.stateHash) throw new TypeError(`Could not restore Complex transaction '${transaction.transactionId}'.`);
      adapter.#replayTransactions.push(transaction);
      adapter.#replayCursor += 1;
    }
    while (adapter.#replayCursor > replay.cursor) { adapter.#kernel.undo(); adapter.#replayCursor -= 1; }
    return adapter;
  }

  /** Typing remains a bounded local preview and does not mutate document history. */
  previewFunction(sourceText: string, allowedVariables: readonly ComplexExpressionVariable[] = ["z"]): ComplexPreviewCompileResult {
    const parsed = parseComplexExpressionAst(sourceText, allowedVariables);
    if (!parsed.ast || parsed.error) return { error: parsed.error };
    return compileComplexExpressionAstPreview(parsed.ast, allowedVariables);
  }

  commitFunction(sourceText: string, allowedVariables: readonly ComplexExpressionVariable[] = ["z"], origin: CommandOrigin = { kind: "interactive", sourceId: "complex-function-explorer" }): ComplexAnalysisDocument {
    const parsed = parseComplexExpressionAst(sourceText, allowedVariables);
    if (!parsed.ast || parsed.error) throw new TypeError(parsed.error?.message ?? "Expression could not be parsed.");
    return this.commit(COMPLEX_COMMAND_TYPES.setFunction, { sourceText, astVersion: 1, normalizedAst: parsed.ast, allowedVariables: [...allowedVariables] }, origin);
  }

  commit(type: typeof fieldCommands[number][1], value: CanonicalJsonValue, origin: CommandOrigin = { kind: "interactive", sourceId: "complex-lab" }): ComplexAnalysisDocument {
    const current = this.document();
    const field = fieldCommands.find((entry) => entry[1] === type)![0];
    const transactionId = this.#nextId("edit");
    const forward = this.#command(`${transactionId}/forward`, type, { value }, origin);
    const inverse = this.#command(`${transactionId}/inverse`, type, { value: clone(current[field]) as CanonicalJsonValue }, { kind: "system", sourceId: "complex-undo" });
    const result = this.#kernel.transact({ transactionId, commands: [forward], history: { kind: "reversible", inverseCommands: [inverse] } });
    if (!result.ok) throw new TypeError(result.errors.flatMap((error) => error.transactionErrors?.flatMap((entry) => entry.messages) ?? [error.message]).join(" "));
    this.#replayTransactions.splice(this.#replayCursor);
    this.#replayTransactions.push({ transactionId, commands: [forward], inverseCommands: [inverse], stateHash: result.event.stateHash });
    this.#replayCursor += 1;
    return this.document();
  }

  /** Compatibility bridge: commits semantic differences in the documented migration order. */
  commitCandidate(candidate: ComplexAnalysisStructuralSource, origin: CommandOrigin = { kind: "interactive", sourceId: "complex-react-parity-adapter" }): ComplexAnalysisDocument {
    for (const [field, type] of fieldCommands) {
      if (JSON.stringify(this.document()[field]) !== JSON.stringify(candidate[field])) this.commit(type, clone(candidate[field]) as CanonicalJsonValue, origin);
    }
    return this.document();
  }

  commitSelection(selection: ComplexCommittedSelection, origin: CommandOrigin = { kind: "interactive", sourceId: "complex-selection" }): ComplexCommandState {
    this.execute(COMPLEX_COMMAND_TYPES.commitSelection, selection as unknown as CanonicalJsonValue, origin);
    return this.state();
  }

  requestAnalysis(requestId: string, requestType: string, origin: CommandOrigin = { kind: "interactive", sourceId: "complex-analysis" }): ComplexCommandState {
    this.execute(COMPLEX_COMMAND_TYPES.requestAnalysis, { requestId, requestType }, origin);
    return this.state();
  }

  requestValueSurface(requestId: string, quantity: ComplexValueSurfaceRequest["quantity"], quality: ComplexValueSurfaceRequest["quality"], origin: CommandOrigin = { kind: "interactive", sourceId: "complex-value-surface" }): ComplexCommandState {
    this.execute(COMPLEX_COMMAND_TYPES.requestValueSurface, { requestId, quantity, quality }, origin);
    return this.state();
  }

  undo(): ComplexAnalysisDocument | null {
    const result = this.#kernel.undo();
    if (result.ok) this.#replayCursor = Math.max(0, this.#replayCursor - 1);
    return result.ok ? this.document() : null;
  }
  redo(): ComplexAnalysisDocument | null {
    const result = this.#kernel.redo();
    if (result.ok) this.#replayCursor = Math.min(this.#replayTransactions.length, this.#replayCursor + 1);
    return result.ok ? this.document() : null;
  }

  private execute(type: string, payload: CanonicalJsonValue, origin: CommandOrigin): void {
    const transactionId = this.#nextId("intent");
    const result = this.#kernel.transact({ transactionId, commands: [this.#command(`${transactionId}/forward`, type, payload, origin)], history: { kind: "irreversible" } });
    if (!result.ok) throw new TypeError(result.errors.map((error) => error.message).join(" "));
  }

  #nextId(kind: string) { this.#sequence += 1; return `complex/${kind}/${this.#sequence}`; }
  #command(commandId: string, type: string, payload: CanonicalJsonValue, origin: CommandOrigin) { return createCommandEnvelope({ commandId, origin, command: { type, payload } }); }
}
