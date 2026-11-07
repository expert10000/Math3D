import React from "react";
import type { ProjectOpenInAction, ProjectOpenInReturn } from "@math3d/core";

type Props = {
  documentId: string;
  actions: readonly ProjectOpenInAction[];
  canDerive: boolean;
  unavailableReason: string | null;
  onChoose: (action: ProjectOpenInAction) => void;
  returnLink: ProjectOpenInReturn | null;
  canReturn: boolean;
  onReturn: (sourceDocumentId: string) => void;
};

export const ProjectOpenInMenu: React.FC<Props> = ({ documentId, actions, canDerive,
  unavailableReason, onChoose, returnLink, canReturn, onReturn }) => <div data-testid={`project-open-in-${documentId}`}>
  <details>
    <summary>Open in…</summary>
    <div role="group" aria-label="Open in destinations" style={{ display: "grid", gap: 6, padding: 8 }}>
      {actions.map((action, index) => <div key={`${action.id}:${action.sourceObjectId ?? index}`}>
        <button type="button" data-testid={`project-open-in-action-${documentId}-${index}`}
          disabled={!canDerive || !action.enabled} title={unavailableReason ?? action.disabledReason ?? action.preview}
          onClick={() => onChoose(action)}>{action.label}</button>
        <small style={{ display: "block" }}>{action.enabled && canDerive ? action.preview :
          action.disabledReason ?? unavailableReason ?? "Open this Project to use the destination."}</small>
      </div>)}
      {!actions.length && <small>No cross-module destination is registered for this document.</small>}
    </div>
  </details>
  {returnLink && <div data-testid={`project-open-in-return-${documentId}`}>
    <button type="button" disabled={!returnLink.exact || !canReturn}
      title={returnLink.reason ?? "Return to the exact source Graph generation"}
      onClick={() => onReturn(returnLink.sourceDocumentId)}>Return to source Graph</button>
    {returnLink.reason && <small style={{ display: "block" }}>{returnLink.reason}</small>}
  </div>}
</div>;
