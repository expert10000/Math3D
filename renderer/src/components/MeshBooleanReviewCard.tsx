import React from "react";
import type { MeshBooleanSummary } from "../services/meshOperations";

export type MeshBooleanReviewOperation = MeshBooleanSummary["operation"] | "split" | "imprint";
export type MeshBooleanReviewMethod = "auto" | "fast" | "robust";
export type MeshBooleanReviewEntity = "a" | "b" | "result";

export type MeshBooleanReviewEntityControls = {
  visible: Record<MeshBooleanReviewEntity, boolean>;
  selected?: MeshBooleanReviewEntity;
  onSelect: (entity: MeshBooleanReviewEntity) => void;
  onToggleVisibility: (entity: MeshBooleanReviewEntity) => void;
  onIsolate: (entity: MeshBooleanReviewEntity) => void;
};

export type MeshBooleanReviewCardProps = {
  actions?: React.ReactNode;
  advancedDetails?: React.ReactNode;
  booleanSummary?: MeshBooleanSummary | null;
  durationMs?: number | null;
  entityControls?: MeshBooleanReviewEntityControls;
  inputAFaces?: number | null;
  inputBFaces?: number | null;
  method: MeshBooleanReviewMethod;
  operation: MeshBooleanReviewOperation;
  operandA: string;
  operandB: string;
  result: string;
  resultFaces?: number | null;
  reviewTestId?: string;
  status?: "ready" | "success" | "warning" | "error";
  testId?: string;
  title?: string;
  validationSlot?: React.ReactNode;
};

const validationBadgeStyle = (state: "pass" | "warn" | "fail"): React.CSSProperties => ({
  border: `1px solid ${state === "pass" ? "#86efac" : state === "warn" ? "#fcd34d" : "#fca5a5"}`,
  background: state === "pass" ? "#f0fdf4" : state === "warn" ? "#fffbeb" : "#fef2f2",
  color: state === "pass" ? "#166534" : state === "warn" ? "#92400e" : "#b42318",
  borderRadius: 6,
  padding: "3px 5px",
  display: "flex",
  justifyContent: "space-between",
  gap: 6,
  whiteSpace: "nowrap",
});

const stageStyle = (state: "done" | "active" | "next" = "done"): React.CSSProperties => ({
  border: `1px solid ${state === "done" ? "#bbf7d0" : state === "active" ? "#93c5fd" : "#e2e8f0"}`,
  borderRadius: 7,
  background: state === "done" ? "#f0fdf4" : state === "active" ? "#eff6ff" : "#f8fafc",
  padding: "6px 7px",
  display: "grid",
  gap: 4,
});

const stageHeader = (step: number, label: string, state: "done" | "active" | "next" = "done") => (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        display: "inline-grid",
        placeItems: "center",
        background: state === "next" ? "#e2e8f0" : "#2563eb",
        color: state === "next" ? "#475569" : "#fff",
        fontSize: 10,
        fontWeight: 900,
        flexShrink: 0,
      }}
    >
      {step}
    </span>
    <strong>{label}</strong>
  </div>
);

const operationLabel = (operation: MeshBooleanReviewOperation): string => {
  if (operation === "union") return "Union";
  if (operation === "difference") return "Difference";
  if (operation === "intersection") return "Intersection";
  if (operation === "split") return "Split";
  if (operation === "imprint") return "Imprint";
  return operation;
};

const methodLabel = (method: MeshBooleanReviewMethod): string =>
  method === "robust" ? "Robust" : method === "fast" ? "Fast" : "Auto";

const formulaText = (operation: MeshBooleanReviewOperation): string => {
  if (operation === "union") return "Result = Active Mesh union Operand B";
  if (operation === "difference") return "Result = Active Mesh - Operand B";
  if (operation === "intersection") return "Result = Active Mesh intersection Operand B";
  if (operation === "split") return "Result = split preview from Active Mesh and Operand B";
  return "Result = imprint curves from Active Mesh and Operand B";
};

const formatCount = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "n/a";

const chip = (label: string, value: string, tone: "a" | "b" | "result") => {
  const palette =
    tone === "a"
      ? { border: "#93c5fd", background: "#eff6ff", color: "#1d4ed8" }
      : tone === "b"
        ? { border: "#fdba74", background: "#fff7ed", color: "#9a3412" }
        : { border: "#86efac", background: "#f0fdf4", color: "#166534" };
  return (
    <span
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: 999,
        padding: "2px 7px",
        fontSize: 10,
        fontWeight: 800,
      }}
    >
      {label}: <strong>{value}</strong>
    </span>
  );
};

const entityStripCell = (
  label: string,
  name: string,
  triangleCount: number | null | undefined,
  tone: "a" | "b" | "result",
  entityControls?: MeshBooleanReviewEntityControls
) => {
  const palette =
    tone === "a"
      ? { border: "#93c5fd", background: "#eff6ff", color: "#1d4ed8" }
      : tone === "b"
        ? { border: "#fdba74", background: "#fff7ed", color: "#9a3412" }
        : { border: "#86efac", background: "#f0fdf4", color: "#166534" };
  const entity = tone;
  const interactive = !!entityControls;
  const visible = entityControls?.visible[entity] ?? true;
  const selected = entityControls?.selected === entity;
  return (
    <div
      key={label}
      onDoubleClick={() => entityControls?.onIsolate(entity)}
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? palette.color : palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: 6,
        padding: "6px",
        display: "grid",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, alignItems: "center" }}>
        <strong style={{ fontSize: 10 }}>{label}</strong>
        {interactive && (
          <button
            type="button"
            data-testid={`mesh-boolean-review-${entity}-visibility`}
            onClick={(event) => {
              event.stopPropagation();
              entityControls.onToggleVisibility(entity);
            }}
            title={`${visible ? "Hide" : "Show"} ${label}`}
            aria-label={`${visible ? "Hide" : "Show"} ${label}`}
            style={{ fontSize: 9, padding: "1px 4px" }}
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      <button
        type="button"
        data-testid={interactive ? `mesh-boolean-review-${entity}-select` : undefined}
        onClick={() => entityControls?.onSelect(entity)}
        title={interactive ? `Select ${label}; double-click to isolate` : name}
        style={{
          appearance: "none",
          border: 0,
          padding: 0,
          background: "transparent",
          color: "inherit",
          cursor: interactive ? "pointer" : "default",
          textAlign: "left",
          minWidth: 0,
        }}
      >
        <span style={{ display: "block", fontSize: 11, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </button>
      <span style={{ fontSize: 10 }}>{visible ? "Visible" : "Hidden"} · {formatCount(triangleCount)} triangles</span>
      {interactive && <span style={{ fontSize: 9, color: palette.color }}>Double-click to isolate</span>}
    </div>
  );
};

const booleanKernelDetail = (
  summary: MeshBooleanSummary | null | undefined
): { state: "pass" | "warn"; backend: string; detail: string } => {
  if (summary?.kernel === "native-cgal") {
    return {
      state: "pass",
      backend: "CGAL corefine",
      detail: "Native CGAL backend: CGAL corefine completed this robust boolean.",
    };
  }
  if (summary?.kernel === "vtk-validated") {
    return {
      state: "warn",
      backend: "VTK fallback",
      detail: "VTK fallback after robust validation; native CGAL kernel was unavailable for this run.",
    };
  }
  return {
    state: summary ? "warn" : "pass",
    backend: summary ? "VTK boolean" : "Operation router",
    detail: summary ? "Fast boolean path used VTK." : "Backend details are available after Apply.",
  };
};

export const MeshBooleanReviewCard: React.FC<MeshBooleanReviewCardProps> = ({
  actions,
  advancedDetails,
  booleanSummary,
  durationMs,
  entityControls,
  inputAFaces,
  inputBFaces,
  method,
  operation,
  operandA,
  operandB,
  result,
  resultFaces,
  reviewTestId,
  status = "ready",
  testId = "mesh-operation-boolean-card",
  title = "Boolean",
  validationSlot,
}) => {
  const kernel = booleanKernelDetail(booleanSummary);
  const resolvedInputAFaces = booleanSummary?.inputAFaces ?? inputAFaces;
  const resolvedInputBFaces = booleanSummary?.inputBFaces ?? inputBFaces;
  const resolvedResultFaces = booleanSummary?.outputFaces ?? resultFaces;
  const resolvedStatus: "pass" | "warn" | "fail" =
    status === "error" || (typeof resolvedResultFaces === "number" && resolvedResultFaces <= 0)
      ? "fail"
      : status === "warning"
        ? "warn"
        : "pass";
  const resolvedMethod = booleanSummary?.kernel === "native-cgal" ? "robust" : method;

  return (
    <div
      data-testid={testId}
      style={{
        border: "1px solid #bae6fd",
        borderRadius: 7,
        background: "#f0f9ff",
        padding: "7px",
        display: "grid",
        gap: 6,
        marginTop: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>{title}</strong>
        <span style={validationBadgeStyle(resolvedStatus)}>
          <strong>{resolvedStatus === "fail" ? "Needs review" : "Review ready"}</strong>
        </span>
      </div>
      <div
        data-testid={`${testId}-entities`}
        style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 5 }}
      >
        {entityStripCell("A", operandA, resolvedInputAFaces, "a", entityControls)}
        {entityStripCell("B", operandB, resolvedInputBFaces, "b", entityControls)}
        {entityStripCell("RESULT", result, resolvedResultFaces, "result", entityControls)}
      </div>
      <div data-testid={reviewTestId} style={stageStyle("active")}>
        {stageHeader(1, "Operation")}
        <div style={{ color: "#0f3557", fontSize: 10 }}>
          {operationLabel(operation)} · {methodLabel(resolvedMethod)} method · {formulaText(operation)}
          {typeof durationMs === "number" ? ` · ${durationMs.toLocaleString()} ms` : ""}
        </div>
      </div>
      <div style={stageStyle()}>
        {stageHeader(2, "Inputs A / B")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {chip("A", operandA, "a")}
          {chip("B", operandB, "b")}
        </div>
      </div>
      <div style={stageStyle()}>
        {stageHeader(3, "Preview")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, color: "#475569", fontSize: 10 }}>
          <span>A solid</span>
          <span>B transparent cutter</span>
          <span>Result selected</span>
        </div>
      </div>
      <div style={stageStyle()}>
        {stageHeader(4, `Run ${methodLabel(resolvedMethod)} Boolean`)}
        <div style={{ color: "#475569", fontSize: 10 }}>Completed and kept as a non-destructive review result.</div>
      </div>
      <div style={stageStyle()}>
        {stageHeader(5, "Result")}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{chip("Result", result, "result")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, fontSize: 10 }}>
          <div style={validationBadgeStyle("pass")}>
            <span>A triangles</span>
            <strong>{formatCount(resolvedInputAFaces)}</strong>
          </div>
          <div style={validationBadgeStyle("pass")}>
            <span>B triangles</span>
            <strong>{formatCount(resolvedInputBFaces)}</strong>
          </div>
          <div style={validationBadgeStyle(resolvedStatus)}>
            <span>Result triangles</span>
            <strong>{formatCount(resolvedResultFaces)}</strong>
          </div>
        </div>
        {actions}
      </div>
      <div style={stageStyle("next")}>
        {stageHeader(6, "Validate Result", "next")}
        <div style={{ color: "#475569", fontSize: 10 }}>Validate the output before chaining another robust operation.</div>
        {validationSlot}
      </div>
      <div style={stageStyle("next")}>
        {stageHeader(7, "Keep Result", "next")}
        <div style={{ color: "#475569", fontSize: 10 }}>Keep the result after review, or send it to Geometry.</div>
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: 10 }}>Advanced engine details</summary>
        <div style={{ display: "grid", gap: 4, marginTop: 4, fontSize: 10 }}>
          <div style={validationBadgeStyle(kernel.state)}>
            <span>Backend used</span>
            <strong>{kernel.backend}</strong>
          </div>
          <div style={{ color: kernel.state === "pass" ? "#166534" : "#92400e" }}>{kernel.detail}</div>
          {advancedDetails}
        </div>
      </details>
      {!!booleanSummary?.warnings.length && <div style={{ color: "#b45309", fontSize: 10 }}>{booleanSummary.warnings.join("; ")}</div>}
      {!!booleanSummary?.diagnostics.length && <div style={{ color: "#64748b", fontSize: 10 }}>{booleanSummary.diagnostics.join("; ")}</div>}
    </div>
  );
};
