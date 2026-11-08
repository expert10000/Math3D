import type { ProjectAlgebraLocusReturn } from "@math3d/core";

type Props = { action: ProjectAlgebraLocusReturn;
  canReturn: boolean; unavailableReason: string | null;
  onReturn: (action: ProjectAlgebraLocusReturn) => void };

export function ProjectAlgebraReturnButton({ action, canReturn,
  unavailableReason, onReturn }: Props) {
  const reason = !action.enabled ? action.reason : unavailableReason ?? action.reason;
  return <div data-testid={`project-algebra-return-${action.documentId}`}>
    <button type="button" disabled={!action.enabled || !canReturn}
      title={reason ?? "Open the exact pinned algebra source in CAS."}
      onClick={() => onReturn(action)}>{action.label}</button>
    {reason && <small style={{ display: "block" }}>{reason}</small>}
  </div>;
}
