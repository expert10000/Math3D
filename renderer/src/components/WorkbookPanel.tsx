import React, { useMemo, useRef } from "react";
import { uiStyles as styles } from "../uiStyles";
import type {
  Workbook,
  WorkbookStageId,
  WorkbookBlock,
  WorkbookBlockType,
  WorkbookViewSnapshot,
} from "../workbook/workbookModel";
import { WORKBOOK_STAGE_ORDER } from "../workbook/workbookModel";

type WorkbookPanelProps = {
  workbooks: Workbook[];
  activeWorkbookId: string | null;
  activeStageId: WorkbookStageId;
  onSelectWorkbook: (id: string) => void;
  onCreateWorkbook: () => void;
  onDuplicateWorkbook: (id: string) => void;
  onDeleteWorkbook: (id: string) => void;
  onRenameWorkbook: (id: string, title: string) => void;
  onSelectStage: (id: WorkbookStageId) => void;
  onAddBlock: (stageId: WorkbookStageId, type: WorkbookBlockType) => void;
  onUpdateBlock: (stageId: WorkbookStageId, blockId: string, patch: Partial<WorkbookBlock>) => void;
  onRemoveBlock: (stageId: WorkbookStageId, blockId: string) => void;
  onMoveBlock: (stageId: WorkbookStageId, blockId: string, dir: -1 | 1) => void;
  onCaptureVisualize: (stageId: WorkbookStageId, blockId: string) => void;
  onApplyVisualize: (snapshot: WorkbookViewSnapshot) => void;
  onToggleVisualizeLive: (stageId: WorkbookStageId, blockId: string, live: boolean) => void;
  onExportJson: () => void;
  onImportJson: (raw: string) => void;
  currentDatasetRef: string;
  cameraReady: boolean;
};

const BLOCK_TYPE_LABELS: Record<WorkbookBlockType, string> = {
  text: "Text",
  formula: "Formula",
  visualize: "Visualize",
  compute: "Compute",
  assert: "Assert",
};

const BLOCK_ACCENT: Record<WorkbookBlockType, string> = {
  text: "#7c7c7c",
  formula: "#6b4b1f",
  visualize: "#1f3556",
  compute: "#0f766e",
  assert: "#9a3412",
};

const COMPUTE_OPERATORS = [
  { id: "chart_grid", label: "Chart grid + coords" },
  { id: "curvature_field", label: "Curvature field" },
  { id: "geodesic_heat", label: "Geodesic heat" },
  { id: "principal_dirs", label: "Principal directions" },
];

export const WorkbookPanel: React.FC<WorkbookPanelProps> = ({
  workbooks,
  activeWorkbookId,
  activeStageId,
  onSelectWorkbook,
  onCreateWorkbook,
  onDuplicateWorkbook,
  onDeleteWorkbook,
  onRenameWorkbook,
  onSelectStage,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onCaptureVisualize,
  onApplyVisualize,
  onToggleVisualizeLive,
  onExportJson,
  onImportJson,
  currentDatasetRef,
  cameraReady,
}) => {
  const activeWorkbook = useMemo(
    () => workbooks.find((w) => w.id === activeWorkbookId) ?? null,
    [workbooks, activeWorkbookId]
  );
  const activeStage = useMemo(
    () => activeWorkbook?.stages.find((s) => s.id === activeStageId) ?? null,
    [activeWorkbook, activeStageId]
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      onImportJson(text);
    } catch {
      // ignore
    }
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={styles.h2}>Workbook</h2>
        <button type="button" onClick={onCreateWorkbook} style={{ padding: "4px 8px" }}>
          New
        </button>
      </div>

      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 10 }}>
        Current view: <strong>{currentDatasetRef}</strong>
        {cameraReady ? " · camera ready" : " · camera pending"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700 }}>
          Workbook
          <select
            value={activeWorkbook?.id ?? ""}
            onChange={(e) => onSelectWorkbook(e.target.value)}
            style={{ width: "100%", marginTop: 4 }}
          >
            {workbooks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
        {activeWorkbook && (
          <input
            type="text"
            value={activeWorkbook.title}
            onChange={(e) => onRenameWorkbook(activeWorkbook.id, e.target.value)}
            placeholder="Workbook title"
            style={{ padding: "4px 6px", fontSize: 12 }}
          />
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => activeWorkbook && onDuplicateWorkbook(activeWorkbook.id)}
            disabled={!activeWorkbook}
            style={{ padding: "4px 8px" }}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => activeWorkbook && onDeleteWorkbook(activeWorkbook.id)}
            disabled={!activeWorkbook}
            style={{ padding: "4px 8px" }}
          >
            Delete
          </button>
          <button type="button" onClick={onExportJson} style={{ padding: "4px 8px" }}>
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{ padding: "4px 8px" }}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {WORKBOOK_STAGE_ORDER.map((stage, idx) => (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelectStage(stage.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #d8d8d8",
              background: activeStageId === stage.id ? "var(--accent-soft)" : "#fff",
              color: activeStageId === stage.id ? "var(--accent-strong)" : "#334155",
              fontWeight: 700,
              fontSize: 11,
            }}
            aria-pressed={activeStageId === stage.id}
          >
            {`${idx + 1} ${stage.title}`}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeStage?.blocks.length ? (
          activeStage.blocks.map((block, idx) => (
            <div
              key={block.id}
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                padding: 10,
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                borderLeft: `4px solid ${BLOCK_ACCENT[block.type]}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#111827" }}>
                  {BLOCK_TYPE_LABELS[block.type]}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => onMoveBlock(activeStageId, block.id, -1)}
                    disabled={idx === 0}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveBlock(activeStageId, block.id, 1)}
                    disabled={idx === activeStage.blocks.length - 1}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveBlock(activeStageId, block.id)}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={block.title}
                onChange={(e) => onUpdateBlock(activeStageId, block.id, { title: e.target.value })}
                placeholder="Block title"
                style={{ width: "100%", marginBottom: 8, padding: "4px 6px", fontSize: 12 }}
              />

              {block.type === "text" && (
                <textarea
                  value={block.text ?? ""}
                  onChange={(e) => onUpdateBlock(activeStageId, block.id, { text: e.target.value })}
                  rows={4}
                  placeholder="Markdown text..."
                  style={{ width: "100%", padding: 6, fontSize: 12, fontFamily: "inherit" }}
                />
              )}

              {block.type === "formula" && (
                <textarea
                  value={block.formula ?? ""}
                  onChange={(e) => onUpdateBlock(activeStageId, block.id, { formula: e.target.value })}
                  rows={3}
                  placeholder="LaTeX or formula..."
                  style={{ width: "100%", padding: 6, fontSize: 12, fontFamily: "monospace" }}
                />
              )}

              {block.type === "visualize" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>
                    Dataset:{" "}
                    <strong>{block.visualize?.snapshot?.datasetRef ?? currentDatasetRef}</strong>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onCaptureVisualize(activeStageId, block.id)}
                      style={{ padding: "4px 8px" }}
                    >
                      Capture current view
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const snap = block.visualize?.snapshot;
                        if (snap) onApplyVisualize(snap);
                      }}
                      disabled={!block.visualize?.snapshot}
                      style={{ padding: "4px 8px" }}
                    >
                      Jump to view
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onToggleVisualizeLive(activeStageId, block.id, !(block.visualize?.live ?? true))
                      }
                      style={{ padding: "4px 8px" }}
                    >
                      {block.visualize?.live ? "Live" : "Frozen"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {block.visualize?.snapshot
                      ? `Captured ${new Date(block.visualize.snapshot.capturedAt).toLocaleString()}`
                      : "No snapshot yet."}
                  </div>
                  <textarea
                    value={block.visualize?.notes ?? ""}
                    onChange={(e) =>
                      onUpdateBlock(activeStageId, block.id, {
                        visualize: { ...(block.visualize ?? { live: true }), notes: e.target.value },
                      })
                    }
                    rows={3}
                    placeholder="Notes on this view..."
                    style={{ width: "100%", padding: 6, fontSize: 12 }}
                  />
                </div>
              )}

              {block.type === "compute" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    Operator
                    <select
                      value={block.compute?.operatorId ?? ""}
                      onChange={(e) =>
                        onUpdateBlock(activeStageId, block.id, {
                          compute: { ...(block.compute ?? { status: "idle" }), operatorId: e.target.value },
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    >
                      <option value="">Select an operator</option>
                      {COMPUTE_OPERATORS.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    Operator outputs will bind to overlays and datasets once compute blocks are wired.
                  </div>
                </div>
              )}

              {block.type === "assert" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={block.assert?.expected ?? ""}
                    onChange={(e) =>
                      onUpdateBlock(activeStageId, block.id, {
                        assert: { ...(block.assert ?? { status: "pending" }), expected: e.target.value },
                      })
                    }
                    rows={3}
                    placeholder="Expected values or checks..."
                    style={{ width: "100%", padding: 6, fontSize: 12 }}
                  />
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    Status
                    <select
                      value={block.assert?.status ?? "pending"}
                      onChange={(e) =>
                        onUpdateBlock(activeStageId, block.id, {
                          assert: { ...(block.assert ?? { expected: "" }), status: e.target.value as any },
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    >
                      <option value="pending">Pending</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            No blocks yet. Add a block below to start this stage.
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Add block</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(BLOCK_TYPE_LABELS) as WorkbookBlockType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAddBlock(activeStageId, type)}
              style={{ padding: "4px 8px" }}
            >
              {BLOCK_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
