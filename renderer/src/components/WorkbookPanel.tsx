import React, { useEffect, useMemo, useRef, useState } from "react";
import { uiStyles as styles } from "../uiStyles";
import type {
  Workbook,
  WorkbookStageId,
  WorkbookBlock,
  WorkbookBlockType,
  WorkbookViewSnapshot,
  WorkbookParamDef,
  WorkbookParamValue,
  WorkbookInteractionKind,
} from "../workbook/workbookModel";
import { WORKBOOK_STAGE_ORDER } from "../workbook/workbookModel";

type WorkbookPanelProps = {
  workbooks: Workbook[];
  activeWorkbookId: string | null;
  activeStageId: WorkbookStageId;
  computeStatusById: Record<string, "ok" | "stale" | "failed">;
  workbookStatus: "ok" | "stale" | "failed";
  paramCatalog: WorkbookParamDef[];
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
  onRunComputeBlock: (stageId: WorkbookStageId, blockId: string, operatorId?: string) => void;
  onRunComputeStage: (stageId: WorkbookStageId) => void;
  onRunAllStale: () => void;
  onRunFromBlock: (stageId: WorkbookStageId, blockId: string) => void;
  onClearWorkbookSelection: () => void;
  onAddBlockParam: (stageId: WorkbookStageId, blockId: string, defId: string) => void;
  onRemoveBlockParam: (stageId: WorkbookStageId, blockId: string, paramId: string) => void;
  onUpdateBlockParam: (
    stageId: WorkbookStageId,
    blockId: string,
    paramId: string,
    value: WorkbookParamValue,
    scrub: boolean
  ) => void;
  onToggleParamScrub: (stageId: WorkbookStageId, blockId: string, scrub: boolean) => void;
  onApplyParams: (stageId: WorkbookStageId, blockId: string) => void;
  onAddKeyframe: (stageId: WorkbookStageId, blockId: string) => void;
  onRemoveKeyframe: (stageId: WorkbookStageId, blockId: string, keyframeId: string) => void;
  onUpdateInteraction: (
    stageId: WorkbookStageId,
    blockId: string,
    patch: Partial<NonNullable<WorkbookBlock["interaction"]>>
  ) => void;
  onUpdateInteractionDirection: (stageId: WorkbookStageId, blockId: string, angle: number) => void;
  onArmInteraction: (stageId: WorkbookStageId, blockId: string) => void;
  onFinishInteraction: (stageId: WorkbookStageId, blockId: string) => void;
  onClearInteraction: (stageId: WorkbookStageId, blockId: string) => void;
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
  interaction: "Interact",
  assert: "Assert",
};

const BLOCK_ACCENT: Record<WorkbookBlockType, string> = {
  text: "#7c7c7c",
  formula: "#6b4b1f",
  visualize: "#1f3556",
  compute: "#0f766e",
  interaction: "#7c3aed",
  assert: "#9a3412",
};
const STATUS_COLORS: Record<string, string> = {
  ok: "#14532d",
  stale: "#92400e",
  fail: "#b91c1c",
  failed: "#b91c1c",
  pending: "#1f2937",
};

const COMPUTE_OPERATORS = [
  { id: "chart_grid", label: "Chart grid + coords" },
  { id: "curve_overlay", label: "Curve overlay" },
  { id: "direction_overlay", label: "Direction overlay" },
  { id: "selection_overlay", label: "Selection overlay" },
  { id: "curvature_field", label: "Curvature field" },
  { id: "geodesic_heat", label: "Geodesic heat" },
  { id: "geodesic_path", label: "Geodesic path" },
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
  onRunComputeBlock,
  onRunComputeStage,
  onRunAllStale,
  onRunFromBlock,
  onClearWorkbookSelection,
  onAddBlockParam,
  onRemoveBlockParam,
  onUpdateBlockParam,
  onToggleParamScrub,
  onApplyParams,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateInteraction,
  onUpdateInteractionDirection,
  onArmInteraction,
  onFinishInteraction,
  onClearInteraction,
  onExportJson,
  onImportJson,
  currentDatasetRef,
  cameraReady,
  computeStatusById,
  workbookStatus,
  paramCatalog,
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
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const issueCursorRef = useRef(0);

  const getBlockStatus = (block: WorkbookBlock): { state: "ok" | "stale" | "fail" | "pending"; label: string } => {
    if (block.type === "compute") {
      const derived = computeStatusById[block.id];
      const status = derived ?? block.compute?.status ?? "idle";
      if (status === "failed") return { state: "fail", label: "failed" };
      if (status === "ok") return { state: "ok", label: "ok" };
      return { state: "stale", label: status === "idle" ? "stale" : status };
    }
    if (block.type === "assert") {
      const st = block.assert?.status ?? "pending";
      if (st === "fail") return { state: "fail", label: "fail" };
      if (st === "pass") return { state: "ok", label: "pass" };
      return { state: "pending", label: "pending" };
    }
    return { state: "ok", label: "ok" };
  };

  const outlineItems = useMemo(() => {
    if (!activeWorkbook) return [];
    const items: Array<{
      stageId: WorkbookStageId;
      stageTitle: string;
      block: WorkbookBlock;
      status: { state: "ok" | "stale" | "fail" | "pending"; label: string };
    }> = [];
    for (const stage of activeWorkbook.stages) {
      for (const block of stage.blocks) {
        items.push({
          stageId: stage.id,
          stageTitle: stage.title,
          block,
          status: getBlockStatus(block),
        });
      }
    }
    return items;
  }, [activeWorkbook, currentDatasetRef, computeStatusById]);

  const issueItems = useMemo(
    () =>
      outlineItems.filter((item) => item.status.state === "stale" || item.status.state === "fail"),
    [outlineItems]
  );
  const hasStale = useMemo(
    () => Object.values(computeStatusById).some((status) => status === "stale"),
    [computeStatusById]
  );
  const hasComputeBlocks = useMemo(
    () => Object.keys(computeStatusById).length > 0,
    [computeStatusById]
  );

  useEffect(() => {
    if (!pendingScrollId) return;
    const runScroll = () => {
      const el = document.getElementById(`wb-block-${pendingScrollId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(runScroll));
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollId, activeStageId, activeWorkbookId]);

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      onImportJson(text);
    } catch {
      // ignore
    }
  };

  const formatParamValue = (value: WorkbookParamValue, def: WorkbookParamDef) => {
    if (def.kind === "number") {
      if (typeof value === "number" && Number.isFinite(value)) {
        return Number.isFinite(def.step) && def.step
          ? value.toFixed(Math.max(0, Math.ceil(-Math.log10(def.step))))
          : value.toFixed(3);
      }
      return String(value ?? "");
    }
    if (def.kind === "toggle") return value ? "on" : "off";
    return String(value ?? "");
  };

  const handleTogglePlay = (stageId: WorkbookStageId, block: WorkbookBlock) => {
    const existing = playingRef.current.get(block.id);
    if (existing) {
      window.clearInterval(existing);
      playingRef.current.delete(block.id);
      return;
    }
    const keyframes = block.params?.keyframes ?? [];
    if (!keyframes.length) return;
    let idx = 0;
    const tick = () => {
      const frame = keyframes[idx % keyframes.length];
      if (!frame) return;
      Object.entries(frame.values).forEach(([paramId, value]) => {
        onUpdateBlockParam(stageId, block.id, paramId, value, true);
      });
      onApplyParams(stageId, block.id);
      idx += 1;
    };
    tick();
    const interval = window.setInterval(tick, 900);
    playingRef.current.set(block.id, interval);
  };

  const playingRef = useRef<Map<string, number>>(new Map());
  useEffect(
    () => () => {
      playingRef.current.forEach((id) => window.clearInterval(id));
      playingRef.current.clear();
    },
    []
  );

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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700 }}>
          Status:{" "}
          {workbookStatus === "ok"
            ? "✓ up to date"
            : workbookStatus === "failed"
              ? "✗ failed"
              : "⟳ stale"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onClearWorkbookSelection}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Clear workbook selection
          </button>
          <button
            type="button"
            onClick={() => onRunComputeStage(activeStageId)}
            disabled={activeStageId !== "compute" || !hasComputeBlocks}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Run stage
          </button>
          <button
            type="button"
            onClick={onRunAllStale}
            disabled={!hasStale}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Run all stale
          </button>
        </div>
      </div>
      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 11, fontWeight: 700, cursor: "pointer" }}>How to use interaction blocks</summary>
        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <div>PickPoint → Geodesic heat/path</div>
          <div>1. Add two Interact blocks set to Pick point, then capture two points.</div>
          <div>2. Add a Compute block → Geodesic heat or Geodesic path.</div>
          <div>3. Click Run operator (uses the latest two PickPoint outputs).</div>
          <div>DrawCurve → Curve overlay</div>
          <div>1. Add an Interact block set to Draw curve. Arm pick, click to add points, then Finish curve.</div>
          <div>2. Add a Compute block → Curve overlay and Run operator.</div>
          <div>SelectRegion → Selection overlay</div>
          <div>1. Add an Interact block set to Select region. Arm pick, select on the surface.</div>
          <div>2. Add a Compute block → Selection overlay and Run operator.</div>
          <div>3. Use Clear workbook selection to drop the overlay.</div>
          <div>PickDirection → Direction overlay</div>
          <div>1. Add an Interact block set to Pick direction. Arm pick, then adjust the angle slider.</div>
          <div>2. Add a Compute block → Direction overlay and Run operator.</div>
        </div>
      </details>

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

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>Outline</div>
          <button
            type="button"
            onClick={() => {
              if (!issueItems.length) return;
              const idx = issueCursorRef.current % issueItems.length;
              const next = issueItems[idx];
              issueCursorRef.current = idx + 1;
              onSelectStage(next.stageId);
              setPendingScrollId(next.block.id);
            }}
            disabled={!issueItems.length}
            style={{ padding: "2px 6px", fontSize: 11 }}
          >
            Next stale/failed
          </button>
        </div>
        {outlineItems.length ? (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {outlineItems.map((item) => (
              <button
                key={item.block.id}
                type="button"
                onClick={() => {
                  onSelectStage(item.stageId);
                  setPendingScrollId(item.block.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 6px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: item.stageId === activeStageId ? "#f8fafc" : "#fff",
                  fontSize: 11,
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 700, color: "#111827" }}>{item.stageTitle}</span>
                <span style={{ opacity: 0.7 }}>·</span>
                <span style={{ flex: 1 }}>{item.block.title || BLOCK_TYPE_LABELS[item.block.type]}</span>
                {(item.block.type === "compute" || item.block.type === "assert") && (
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: `${STATUS_COLORS[item.status.state]}22`,
                      color: STATUS_COLORS[item.status.state],
                      fontWeight: 700,
                      fontSize: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    {item.status.label}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.65 }}>No blocks yet.</div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeStage?.blocks.length ? (
          activeStage.blocks.map((block, idx) => (
            <div
              key={block.id}
              id={`wb-block-${block.id}`}
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                padding: 10,
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                borderLeft: `4px solid ${BLOCK_ACCENT[block.type]}`,
                cursor:
                  block.type === "visualize" && block.visualize?.snapshot ? "pointer" : "default",
              }}
              onClick={(e) => {
                if (block.type !== "visualize") return;
                const snap = block.visualize?.snapshot;
                if (!snap) return;
                const tag = (e.target as HTMLElement).tagName;
                if (["INPUT", "TEXTAREA", "BUTTON", "SELECT", "OPTION", "A"].includes(tag)) return;
                onApplyVisualize(snap);
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
                  {block.visualize?.snapshot?.thumbnail && (
                    <img
                      src={block.visualize.snapshot.thumbnail}
                      alt="Snapshot thumbnail"
                      style={{
                        width: "100%",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                      }}
                    />
                  )}
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
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onRunComputeBlock(activeStageId, block.id, block.compute?.operatorId)}
                      disabled={!block.compute?.operatorId}
                      style={{ padding: "4px 8px" }}
                    >
                      Run operator
                    </button>
                    <button
                      type="button"
                      onClick={() => onRunFromBlock(activeStageId, block.id)}
                      disabled={!block.compute?.operatorId}
                      style={{ padding: "4px 8px" }}
                    >
                      Run from here
                    </button>
                    {(() => {
                      const st = getBlockStatus(block);
                      return (
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: `${STATUS_COLORS[st.state]}22`,
                            color: STATUS_COLORS[st.state],
                            fontWeight: 700,
                            fontSize: 10,
                            textTransform: "uppercase",
                          }}
                        >
                          {st.label}
                        </span>
                      );
                    })()}
                    {block.compute?.datasetRef && (
                      <span style={{ fontSize: 10, opacity: 0.6 }}>
                        {block.compute.datasetRef}
                      </span>
                    )}
                  </div>
                  {block.compute?.summary && (
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{block.compute.summary}</div>
                  )}
                </div>
              )}

              {block.type === "interaction" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>
                    Interaction
                    <select
                      value={block.interaction?.kind ?? "pick_point"}
                      onChange={(e) =>
                        onUpdateInteraction(activeStageId, block.id, {
                          kind: e.target.value as WorkbookInteractionKind,
                          status: "idle",
                          summary: "",
                          point: null,
                          curve: null,
                          mask: null,
                          direction: null,
                          points: [],
                          directionAngle: 0,
                        })
                      }
                      style={{ width: "100%", marginTop: 4 }}
                    >
                      <option value="pick_point">Pick point</option>
                      <option value="draw_curve">Draw curve</option>
                      <option value="select_region">Select region</option>
                      <option value="pick_direction">Pick direction</option>
                    </select>
                  </label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => onArmInteraction(activeStageId, block.id)}
                      style={{ padding: "4px 8px" }}
                    >
                      Arm pick
                    </button>
                    {block.interaction?.kind === "draw_curve" && (
                      <button
                        type="button"
                        onClick={() => onFinishInteraction(activeStageId, block.id)}
                        style={{ padding: "4px 8px" }}
                      >
                        Finish curve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onClearInteraction(activeStageId, block.id)}
                      style={{ padding: "4px 8px" }}
                    >
                      Clear
                    </button>
                  </div>
                  {block.interaction?.kind === "pick_direction" && (
                    <label style={{ fontSize: 11, fontWeight: 700 }}>
                      Direction angle
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={block.interaction?.directionAngle ?? 0}
                        onChange={(e) =>
                          onUpdateInteractionDirection(activeStageId, block.id, Number(e.target.value))
                        }
                      />
                    </label>
                  )}
                  <div style={{ fontSize: 11, opacity: 0.75 }}>
                    Status: <strong>{block.interaction?.status ?? "idle"}</strong>
                  </div>
                  {block.interaction?.summary && (
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{block.interaction.summary}</div>
                  )}
                  {block.interaction?.point && (
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      p = ({block.interaction.point.point.x.toFixed(3)}, {block.interaction.point.point.y.toFixed(3)}, {block.interaction.point.point.z.toFixed(3)})
                    </div>
                  )}
                  {block.interaction?.curve && (
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      Curve points: <strong>{block.interaction.curve.points.length}</strong>
                    </div>
                  )}
                  {block.interaction?.mask && (
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      Selected: <strong>{block.interaction.mask.count}</strong>
                    </div>
                  )}
                  {block.interaction?.direction && (
                    <div style={{ fontSize: 11, opacity: 0.75 }}>
                      dir = ({block.interaction.direction.direction.x.toFixed(3)}, {block.interaction.direction.direction.y.toFixed(3)}, {block.interaction.direction.direction.z.toFixed(3)})
                    </div>
                  )}
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

              <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #e5e7eb" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>Parameters</div>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      onAddBlockParam(activeStageId, block.id, id);
                      e.currentTarget.value = "";
                    }}
                    style={{ fontSize: 11 }}
                  >
                    <option value="">Add param...</option>
                    {paramCatalog
                      .filter((def) => !(block.params?.defs ?? []).some((p) => p.id === def.id))
                      .map((def) => (
                        <option key={def.id} value={def.id}>
                          {def.label}
                        </option>
                      ))}
                  </select>
                </div>

                {(block.params?.defs?.length ?? 0) > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {block.params?.defs.map((def) => {
                      const value = block.params?.values?.[def.id] ?? def.defaultValue ?? (def.kind === "toggle" ? false : 0);
                      return (
                        <div key={def.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{def.label}</span>
                            <button
                              type="button"
                              onClick={() => onRemoveBlockParam(activeStageId, block.id, def.id)}
                              style={{ padding: "2px 6px", fontSize: 10 }}
                            >
                              Remove
                            </button>
                          </div>
                          {def.kind === "toggle" && (
                            <label style={{ fontSize: 11 }}>
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(e) =>
                                  onUpdateBlockParam(activeStageId, block.id, def.id, e.target.checked, !!block.params?.scrub)
                                }
                                style={{ marginRight: 6 }}
                              />
                              {formatParamValue(value, def)}
                            </label>
                          )}
                          {def.kind === "select" && (
                            <select
                              value={String(value)}
                              onChange={(e) =>
                                onUpdateBlockParam(activeStageId, block.id, def.id, e.target.value, !!block.params?.scrub)
                              }
                              style={{ fontSize: 11 }}
                            >
                              {(def.options ?? []).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {def.kind === "number" && (
                            <>
                              <input
                                type="range"
                                value={typeof value === "number" && Number.isFinite(value) ? value : Number(def.defaultValue ?? 0)}
                                min={def.min ?? 0}
                                max={def.max ?? 1}
                                step={def.step ?? 0.01}
                                onChange={(e) =>
                                  onUpdateBlockParam(activeStageId, block.id, def.id, Number(e.target.value), !!block.params?.scrub)
                                }
                              />
                              <input
                                type="number"
                                value={typeof value === "number" && Number.isFinite(value) ? value : Number(def.defaultValue ?? 0)}
                                min={def.min ?? 0}
                                max={def.max ?? 1}
                                step={def.step ?? 0.01}
                                onChange={(e) =>
                                  onUpdateBlockParam(activeStageId, block.id, def.id, Number(e.target.value), false)
                                }
                                style={{ fontSize: 11 }}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ fontSize: 11 }}>
                        <input
                          type="checkbox"
                          checked={!!block.params?.scrub}
                          onChange={(e) => onToggleParamScrub(activeStageId, block.id, e.target.checked)}
                          style={{ marginRight: 6 }}
                        />
                        Scrub mode
                      </label>
                      <button
                        type="button"
                        onClick={() => onApplyParams(activeStageId, block.id)}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        Apply params
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => onAddKeyframe(activeStageId, block.id)}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        Save keyframe
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(activeStageId, block)}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        {playingRef.current.has(block.id) ? "Stop" : "Play"}
                      </button>
                    </div>
                    {(block.params?.keyframes?.length ?? 0) > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {block.params?.keyframes?.map((kf, kIdx) => (
                          <div key={kf.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>{kf.label ?? `Keyframe ${kIdx + 1}`}</div>
                            <button
                              type="button"
                              onClick={() => {
                                Object.entries(kf.values).forEach(([paramId, value]) => {
                                  onUpdateBlockParam(activeStageId, block.id, paramId, value, false);
                                });
                                onApplyParams(activeStageId, block.id);
                              }}
                              style={{ padding: "2px 6px", fontSize: 10 }}
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveKeyframe(activeStageId, block.id, kf.id)}
                              style={{ padding: "2px 6px", fontSize: 10 }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                    No params yet. Add one to control the view or dataset.
                  </div>
                )}
              </div>
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
