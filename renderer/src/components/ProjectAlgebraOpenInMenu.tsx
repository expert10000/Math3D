import type { ProjectSavedAlgebraOpenInAction } from "@math3d/core";

type Props = {
  objectId: string;
  actions: readonly ProjectSavedAlgebraOpenInAction[];
  canOpen: (action: ProjectSavedAlgebraOpenInAction) => boolean;
  unavailableReason: string | null;
  onChoose: (action: ProjectSavedAlgebraOpenInAction) => void;
};

export function ProjectAlgebraOpenInMenu({ objectId, actions, canOpen,
  unavailableReason, onChoose }: Props) {
  return <div data-testid={`project-algebra-open-in-${objectId}`}>
    <details><summary>Open in…</summary>
      <div role="group" aria-label="Algebra locus destinations" style={{ display: "grid", gap: 6, padding: 8 }}>
        {actions.map((action, index) => <div key={`${action.id}:${action.documentId ?? index}`}>
          <button type="button" data-testid={`project-algebra-open-in-action-${objectId}-${index}`}
            disabled={!canOpen(action)}
            title={action.disabledReason ?? unavailableReason ?? (canOpen(action) ? action.preview :
              "Saved Geometry is unavailable in the active workspace.")}
            onClick={() => onChoose(action)}>{action.label}</button>
          <small style={{ display: "block" }}>{action.disabledReason ?? unavailableReason ??
            (canOpen(action) ? action.preview : "Saved Geometry is unavailable in the active workspace.")}</small>
        </div>)}
      </div>
    </details>
  </div>;
}
