export type OperationWorkspace = "geometry" | "mesh";
export type OperationParameters = Readonly<Record<string, string | number | boolean>>;

export type OperationTransaction<TSnapshot> = {
  readonly id: string;
  readonly workspace: OperationWorkspace;
  readonly label: string;
  readonly selectionSummary: string;
  readonly before: TSnapshot;
  readonly preview: TSnapshot;
  readonly parameters: OperationParameters;
  readonly validated: boolean;
  readonly errors: readonly string[];
};

export type OperationHistoryReceipt = {
  readonly transactionId: string;
  readonly workspace: OperationWorkspace;
  readonly label: string;
  readonly parameters: OperationParameters;
};

export const beginOperation = <TSnapshot>(input: {
  id: string;
  workspace: OperationWorkspace;
  label: string;
  selectionSummary: string;
  snapshot: TSnapshot;
  clone: (value: TSnapshot) => TSnapshot;
  parameters?: OperationParameters;
}): OperationTransaction<TSnapshot> => ({
  id: input.id,
  workspace: input.workspace,
  label: input.label,
  selectionSummary: input.selectionSummary,
  before: input.clone(input.snapshot),
  preview: input.clone(input.snapshot),
  parameters: { ...input.parameters },
  validated: false,
  errors: [],
});

export const updateOperation = <TSnapshot>(
  transaction: OperationTransaction<TSnapshot>,
  preview: TSnapshot,
  parameters: OperationParameters,
  clone: (value: TSnapshot) => TSnapshot
): OperationTransaction<TSnapshot> => ({
  ...transaction,
  preview: clone(preview),
  parameters: { ...parameters },
  validated: false,
  errors: [],
});

export const validateOperation = <TSnapshot>(
  transaction: OperationTransaction<TSnapshot>,
  check: (preview: TSnapshot, parameters: OperationParameters) => readonly string[]
): OperationTransaction<TSnapshot> => ({
  ...transaction,
  validated: true,
  errors: [...check(transaction.preview, transaction.parameters)],
});

export const commitOperation = <TSnapshot>(
  transaction: OperationTransaction<TSnapshot>,
  clone: (value: TSnapshot) => TSnapshot
): { state: TSnapshot; history: OperationHistoryReceipt } => {
  if (!transaction.validated) throw new Error("Operation preview has not been validated.");
  if (transaction.errors.length) throw new Error(transaction.errors.join("; "));
  return {
    state: clone(transaction.preview),
    history: {
      transactionId: transaction.id,
      workspace: transaction.workspace,
      label: transaction.label,
      parameters: { ...transaction.parameters },
    },
  };
};

export const cancelOperation = <TSnapshot>(
  transaction: OperationTransaction<TSnapshot>,
  clone: (value: TSnapshot) => TSnapshot
): TSnapshot => clone(transaction.before);

export const applyAndContinueOperation = <TSnapshot>(
  transaction: OperationTransaction<TSnapshot>,
  nextId: string,
  clone: (value: TSnapshot) => TSnapshot
): { state: TSnapshot; history: OperationHistoryReceipt; next: OperationTransaction<TSnapshot> } => {
  const applied = commitOperation(transaction, clone);
  return {
    ...applied,
    next: beginOperation({
      id: nextId,
      workspace: transaction.workspace,
      label: transaction.label,
      selectionSummary: transaction.selectionSummary,
      snapshot: applied.state,
      clone,
      parameters: transaction.parameters,
    }),
  };
};
