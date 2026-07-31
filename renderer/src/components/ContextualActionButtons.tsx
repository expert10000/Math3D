import type { ButtonHTMLAttributes, CSSProperties, MouseEventHandler, ReactNode } from "react";

export type ContextualButtonAction = {
  readonly label: ReactNode;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly testId?: string;
  readonly pulse?: boolean;
};

type ContextualActionButtonVariant = "strip" | "card";

type ContextualRenderedActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style" | "title"> &
  ContextualButtonAction & {
  readonly variant?: ContextualActionButtonVariant;
};

const contextualActionButtonStyle = (
  variant: ContextualActionButtonVariant,
  disabled?: boolean,
  pulse?: boolean
): CSSProperties => ({
  padding: "3px 8px",
  fontSize: variant === "card" ? 10 : 11,
  fontWeight: variant === "card" ? 800 : 700,
  borderColor: disabled ? "#cbd5e1" : "#bfdbfe",
  background: disabled ? "#f1f5f9" : pulse ? "#dcfce7" : "#ffffff",
  color: disabled ? "#94a3b8" : pulse ? "#166534" : "#1e3a8a",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.88 : 1,
  boxShadow: pulse
    ? `0 0 0 3px rgba(34, 197, 94, ${variant === "card" ? "0.18" : "0.22"})`
    : undefined,
  transition: variant === "strip" ? "background 180ms ease, color 180ms ease, box-shadow 180ms ease" : undefined,
});

export function ContextualRenderedActionButton({
  label,
  testId,
  onClick,
  disabled,
  disabledReason,
  pulse,
  variant = "strip",
  ...buttonProps
}: ContextualRenderedActionButtonProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      style={contextualActionButtonStyle(variant, disabled, pulse)}
    >
      {label}
    </button>
  );
}

export function ContextualRenderedActionStripButtons({
  actions,
}: {
  readonly actions: readonly ContextualButtonAction[];
}) {
  return (
    <>
      {actions.map((action) => (
        <ContextualRenderedActionButton key={`${action.testId ?? action.label}`} {...action} variant="strip" />
      ))}
    </>
  );
}
