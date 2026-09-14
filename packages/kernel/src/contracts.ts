import type {
  CommandEnvelope,
  CommandTransactionError,
  DeepReadonly,
  StructuralHash,
} from "@math3d/core";

export const KERNEL_EVENT_SCHEMA_VERSION = 1 as const;

export type KernelCompletedEventType =
  | "document.transaction-committed"
  | "document.history-undone"
  | "document.history-redone";

export type KernelHistoryStatus = Readonly<{
  limit: number;
  undoDepth: number;
  redoDepth: number;
}>;

export type KernelCompletedEvent = Readonly<{
  schemaVersion: typeof KERNEL_EVENT_SCHEMA_VERSION;
  sequence: number;
  type: KernelCompletedEventType;
  transactionId: string;
  commandIds: readonly string[];
  stateHash: StructuralHash;
  history: KernelHistoryStatus;
}>;

export type KernelListener = (event: KernelCompletedEvent) => void;
export type KernelUnsubscribe = () => void;

export type KernelHistoryPolicy =
  | Readonly<{
      kind: "reversible";
      inverseCommands: readonly unknown[];
    }>
  | Readonly<{
      kind: "irreversible";
    }>;

export type KernelTransactionRequest = Readonly<{
  transactionId: string;
  commands: readonly unknown[];
  mode?: "interactive" | "import" | "replay";
  history: KernelHistoryPolicy;
}>;

export type KernelListenerError = Readonly<{
  subscriberId: number;
  message: string;
}>;

export type KernelOperationErrorCode =
  | "invalid-request"
  | "transaction-rejected"
  | "history-empty"
  | "reentrant-operation";

export type KernelOperationError = Readonly<{
  code: KernelOperationErrorCode;
  message: string;
  transactionErrors?: readonly CommandTransactionError[];
}>;

export type KernelOperationResult =
  | Readonly<{
      ok: true;
      event: KernelCompletedEvent;
      listenerErrors: readonly KernelListenerError[];
    }>
  | Readonly<{
      ok: false;
      errors: readonly KernelOperationError[];
    }>;

export type KernelQuery<State, Result> = (state: DeepReadonly<State>) => Result;

export type KernelHistoryRecord = Readonly<{
  transactionId: string;
  commands: readonly CommandEnvelope[];
  inverseCommands: readonly CommandEnvelope[];
}>;
