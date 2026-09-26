import { createEmptyGraph2DDocument, GRAPH2D_WORKSPACE_CONTRACT } from "@math3d/core";
import type { WorkspaceDockLayout } from "../workspaceDocks";

const emptyDocument = createEmptyGraph2DDocument("desktop-web-shell");

type Props = { dockLayout: WorkspaceDockLayout };

/** Desktop/web projection of the shared Graph2D workspace contract. */
export function GraphsWorkspace({ dockLayout }: Props) {
  const showLeft = !dockLayout.viewerMaximized && !dockLayout.leftCollapsed;
  const showRight = !dockLayout.viewerMaximized && !dockLayout.rightCollapsed;
  return (
    <section data-testid="graphs-workspace" aria-label="Graphs workspace" style={{ display: "flex", flex: 1, minHeight: 0, gap: 8 }}>
      {showLeft && (
        <aside aria-label="Graph functions" style={{ width: dockLayout.left, minWidth: 0, padding: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-strong)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Functions</h2>
          <p style={{ margin: 0, fontSize: 13 }}>No functions in this graph.</p>
        </aside>
      )}
      <div data-testid="main-viewer" aria-label="Empty graph scene" style={{ flex: 1, minWidth: 0, minHeight: 320, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-strong)" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 380 }}>
          <h2 style={{ margin: "0 0 8px" }}>Graphs</h2>
          <p style={{ margin: "0 0 8px" }}>An empty Cartesian graph scene is ready.</p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
            {emptyDocument.source.objects.length} functions · {GRAPH2D_WORKSPACE_CONTRACT.initialObjectKind} source
          </p>
        </div>
      </div>
      {showRight && (
        <aside aria-label="Graph inspector" style={{ width: dockLayout.right, minWidth: 0, padding: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-strong)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Inspector</h2>
          <p style={{ margin: 0, fontSize: 13 }}>Select a function to inspect it.</p>
        </aside>
      )}
    </section>
  );
}
