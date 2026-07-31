import { contextualActionTestId, type ContextualActionDescriptor } from "./contextualActions";

export type ContextualRenderedAction = {
  readonly label: string;
  readonly testId: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly disabledReason: string;
  readonly pulse?: boolean;
};

export type ContextualActionRenderConfig = {
  readonly descriptor: ContextualActionDescriptor;
  readonly testIdPrefix: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly activePulseId?: string | null;
};

export type ContextualActionBinding = Omit<ContextualActionRenderConfig, "testIdPrefix">;

export function buildContextualRenderedAction({
  descriptor,
  testIdPrefix,
  onClick,
  disabled,
  disabledReason,
  activePulseId,
}: ContextualActionRenderConfig): ContextualRenderedAction {
  return {
    label: descriptor.label,
    testId: contextualActionTestId(testIdPrefix, descriptor),
    onClick,
    disabled,
    disabledReason: disabledReason ?? descriptor.disabledReason,
    pulse: activePulseId === descriptor.pulseId,
  };
}

export function buildContextualRenderedActions(
  configs: readonly ContextualActionRenderConfig[]
): readonly ContextualRenderedAction[] {
  return configs.map(buildContextualRenderedAction);
}

export function buildContextualRenderedActionsForPrefix(
  bindings: readonly ContextualActionBinding[] | undefined,
  testIdPrefix: string
): readonly ContextualRenderedAction[] {
  return (bindings ?? []).map((binding) => buildContextualRenderedAction({ ...binding, testIdPrefix }));
}
