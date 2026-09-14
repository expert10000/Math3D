import {
  immutableCanonicalJsonClone,
  projectCommandTransaction,
  structuralHash,
  type CommandDefinition,
  type CommandEnvelope,
  type DeepReadonly,
} from "@math3d/core";
import {
  KERNEL_EVENT_SCHEMA_VERSION,
  type KernelCompletedEvent,
  type KernelCompletedEventType,
  type KernelHistoryRecord,
  type KernelHistoryStatus,
  type KernelListener,
  type KernelListenerError,
  type KernelOperationError,
  type KernelOperationResult,
  type KernelQuery,
  type KernelTransactionRequest,
  type KernelUnsubscribe,
} from "./contracts";

export type InMemoryDocumentKernelOptions<State> = Readonly<{
  initialState: State;
  commandDefinitions: readonly CommandDefinition<State>[];
  historyLimit?: number;
}>;

const isTransactionId = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;

const errorResult = (
  code: KernelOperationError["code"],
  message: string,
  transactionErrors?: KernelOperationError["transactionErrors"]
): KernelOperationResult => ({
  ok: false,
  errors: [{ code, message, ...(transactionErrors ? { transactionErrors } : {}) }],
});

const describeError = (error: unknown): string => String((error as Error)?.message ?? error);

export class InMemoryDocumentKernel<State> {
  readonly #commandDefinitions: readonly CommandDefinition<State>[];
  readonly #historyLimit: number;
  readonly #listeners = new Map<number, KernelListener>();
  readonly #undoStack: KernelHistoryRecord[] = [];
  readonly #redoStack: KernelHistoryRecord[] = [];
  #state: DeepReadonly<State>;
  #sequence = 0;
  #nextSubscriberId = 1;
  #emitting = false;
  #queryDepth = 0;

  constructor(options: InMemoryDocumentKernelOptions<State>) {
    const historyLimit = options.historyLimit ?? 100;
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) {
      throw new RangeError("Kernel historyLimit must be a positive safe integer.");
    }
    const initialized = projectCommandTransaction(
      options.initialState,
      [],
      options.commandDefinitions,
      "replay"
    );
    if (!initialized.ok) {
      throw new TypeError(`Invalid kernel configuration: ${initialized.errors.flatMap((entry) => entry.messages).join(" ")}`);
    }
    this.#state = immutableCanonicalJsonClone(initialized.state);
    this.#commandDefinitions = [...options.commandDefinitions];
    this.#historyLimit = historyLimit;
  }

  query<Result>(query: KernelQuery<State, Result>): DeepReadonly<Result> {
    this.#queryDepth += 1;
    try {
      return immutableCanonicalJsonClone(query(this.#state));
    } finally {
      this.#queryDepth -= 1;
    }
  }

  historyStatus(): KernelHistoryStatus {
    return immutableCanonicalJsonClone(this.#currentHistoryStatus());
  }

  subscribe(listener: KernelListener): KernelUnsubscribe {
    const subscriberId = this.#nextSubscriberId;
    this.#nextSubscriberId += 1;
    this.#listeners.set(subscriberId, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#listeners.delete(subscriberId);
    };
  }

  transact(request: KernelTransactionRequest): KernelOperationResult {
    if (this.#emitting || this.#queryDepth > 0) {
      return errorResult("reentrant-operation", this.#mutationBlockedMessage());
    }
    if (!isTransactionId(request.transactionId)) {
      return errorResult("invalid-request", "transactionId must be a trimmed non-empty string of at most 160 characters.");
    }
    if (!Array.isArray(request.commands) || request.commands.length === 0) {
      return errorResult("invalid-request", "A transaction must contain at least one command.");
    }
    if (!request.history || !["reversible", "irreversible"].includes(request.history.kind)) {
      return errorResult("invalid-request", "A transaction requires an explicit reversible or irreversible history policy.");
    }
    if (
      request.history.kind === "reversible" &&
      (!Array.isArray(request.history.inverseCommands) || request.history.inverseCommands.length === 0)
    ) {
      return errorResult("invalid-request", "A reversible transaction requires at least one inverse command.");
    }

    const projected = projectCommandTransaction(
      this.#state as State,
      request.commands,
      this.#commandDefinitions,
      request.mode ?? "interactive"
    );
    if (!projected.ok) {
      return errorResult("transaction-rejected", "Transaction validation or projection failed.", projected.errors);
    }

    let record: KernelHistoryRecord | null = null;
    if (request.history.kind === "reversible") {
      const inverseProbe = projectCommandTransaction(
        projected.state,
        request.history.inverseCommands,
        this.#commandDefinitions,
        "replay"
      );
      if (!inverseProbe.ok) {
        return errorResult("transaction-rejected", "Inverse transaction validation or projection failed.", inverseProbe.errors);
      }
      record = immutableCanonicalJsonClone({
        transactionId: request.transactionId,
        commands: projected.commands,
        inverseCommands: inverseProbe.commands,
      }) as KernelHistoryRecord;
    }

    this.#state = immutableCanonicalJsonClone(projected.state);
    this.#redoStack.splice(0);
    if (record) {
      this.#undoStack.push(record);
      if (this.#undoStack.length > this.#historyLimit) {
        this.#undoStack.splice(0, this.#undoStack.length - this.#historyLimit);
      }
    } else {
      this.#undoStack.splice(0);
    }

    return this.#complete(
      "document.transaction-committed",
      request.transactionId,
      projected.commands
    );
  }

  undo(): KernelOperationResult {
    if (this.#emitting || this.#queryDepth > 0) {
      return errorResult("reentrant-operation", this.#mutationBlockedMessage());
    }
    const record = this.#undoStack[this.#undoStack.length - 1];
    if (!record) return errorResult("history-empty", "There is no reversible transaction to undo.");

    const projected = projectCommandTransaction(
      this.#state as State,
      record.inverseCommands,
      this.#commandDefinitions,
      "replay"
    );
    if (!projected.ok) {
      return errorResult("transaction-rejected", "Undo projection failed.", projected.errors);
    }
    this.#state = immutableCanonicalJsonClone(projected.state);
    this.#undoStack.pop();
    this.#redoStack.push(record);
    return this.#complete("document.history-undone", record.transactionId, record.inverseCommands);
  }

  redo(): KernelOperationResult {
    if (this.#emitting || this.#queryDepth > 0) {
      return errorResult("reentrant-operation", this.#mutationBlockedMessage());
    }
    const record = this.#redoStack[this.#redoStack.length - 1];
    if (!record) return errorResult("history-empty", "There is no reversible transaction to redo.");

    const projected = projectCommandTransaction(
      this.#state as State,
      record.commands,
      this.#commandDefinitions,
      "replay"
    );
    if (!projected.ok) {
      return errorResult("transaction-rejected", "Redo projection failed.", projected.errors);
    }
    this.#state = immutableCanonicalJsonClone(projected.state);
    this.#redoStack.pop();
    this.#undoStack.push(record);
    return this.#complete("document.history-redone", record.transactionId, record.commands);
  }

  #currentHistoryStatus(): KernelHistoryStatus {
    return {
      limit: this.#historyLimit,
      undoDepth: this.#undoStack.length,
      redoDepth: this.#redoStack.length,
    };
  }

  #mutationBlockedMessage(): string {
    return this.#emitting
      ? "Kernel mutations are not allowed during completed-event delivery."
      : "Kernel mutations are not allowed during read-only query evaluation.";
  }

  #complete(
    type: KernelCompletedEventType,
    transactionId: string,
    commands: readonly CommandEnvelope[]
  ): KernelOperationResult {
    this.#sequence += 1;
    const event = immutableCanonicalJsonClone({
      schemaVersion: KERNEL_EVENT_SCHEMA_VERSION,
      sequence: this.#sequence,
      type,
      transactionId,
      commandIds: commands.map((entry) => entry.commandId),
      stateHash: structuralHash(this.#state),
      history: this.#currentHistoryStatus(),
    }) as KernelCompletedEvent;
    const listenerErrors: KernelListenerError[] = [];
    const listeners = [...this.#listeners.entries()];
    this.#emitting = true;
    try {
      for (const [subscriberId, listener] of listeners) {
        try {
          listener(event);
        } catch (error) {
          listenerErrors.push({ subscriberId, message: describeError(error) });
        }
      }
    } finally {
      this.#emitting = false;
    }
    return immutableCanonicalJsonClone({ ok: true, event, listenerErrors }) as KernelOperationResult;
  }
}

export const createInMemoryDocumentKernel = <State>(
  options: InMemoryDocumentKernelOptions<State>
): InMemoryDocumentKernel<State> => new InMemoryDocumentKernel(options);
