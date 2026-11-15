import type { SceneOperation } from "../scene/sceneOperations";

export function SceneHistoryPanel({ operations, canUndo, canRedo, onUndo, onRedo, onOpenSource, onOpenResult }: {
  operations: readonly SceneOperation[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSource: (operation: SceneOperation) => void;
  onOpenResult: (operation: SceneOperation) => void;
}) {
  return <section data-testid="scene-history" style={{ display: "grid", gap: 5, padding: 7, border: "1px solid #dbeafe", borderRadius: 7 }}>
    <strong>Scene history</strong>
    <div style={{ display: "flex", gap: 5 }}>
      <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
      <button type="button" onClick={onRedo} disabled={!canRedo}>Redo</button>
    </div>
    {operations.length ? operations.slice(0, 8).map((operation) => <div key={operation.id} data-testid="scene-history-operation" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 4 }}>
      <div><strong>{operation.workspace}</strong> · {operation.action} · {operation.objectLabel}</div>
      <div>{operation.componentLabel ?? "Object"} · {operation.parameters ?? "No parameters"} · {operation.outputRepresentation}</div>
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" onClick={() => onOpenSource(operation)}>Source</button>
        <button type="button" onClick={() => onOpenResult(operation)}>Result</button>
      </div>
    </div>) : <span>No scene operations yet.</span>}
  </section>;
}
