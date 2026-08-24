import React, { useState } from "react";
import {
  MESH_OPERATION_CAPABILITIES,
  type MeshOperationId,
  type MeshOperationResult,
  type MeshOperationStatus,
  type ResolvedMeshOperationEngine,
} from "../services/meshOperations";

export type MeshBooleanOperation = "union" | "difference" | "intersection" | "split" | "imprint";

export type MeshOperationUiId = MeshOperationId | "boolean-split";
export type MeshOperationResultSummary = {
  operation: MeshOperationUiId;
  label: string;
  status: MeshOperationStatus;
  engine: ResolvedMeshOperationEngine;
  sourceIds: string[];
  beforeVertices: number;
  beforeFaces: number;
  afterVertices: number | null;
  afterFaces: number | null;
  durationMs: number;
  outputMode: "new-object" | "replace" | "preview";
  warnings: string[];
  errors: string[];
  timestamp: number;
};

export const MESH_OPERATION_LABELS: Record<MeshOperationUiId, string> = {
  "clean-normals": "Clean normals",
  decimate: "Decimate",
  smooth: "Smooth",
  "implicit-preview": "Implicit preview",
  "implicit-mesh": "Implicit mesh",
  "boolean-union": "Boolean union",
  "boolean-difference": "Boolean difference",
  "boolean-intersection": "Boolean intersection",
  "boolean-imprint": "Boolean imprint",
  "boolean-split": "Boolean split",
};

export function summarizeMeshOperationResult(
  result: MeshOperationResult,
  outputMode: MeshOperationResultSummary["outputMode"]
): MeshOperationResultSummary {
  return {
    operation: result.operation,
    label: MESH_OPERATION_LABELS[result.operation] ?? result.operation,
    status: result.status,
    engine: result.engine,
    sourceIds: result.sourceIds,
    beforeVertices: result.before.vertexCount,
    beforeFaces: result.before.faceCount,
    afterVertices: result.after?.vertexCount ?? null,
    afterFaces: result.after?.faceCount ?? null,
    durationMs: result.durationMs,
    outputMode,
    warnings: result.warnings.map((warning) => warning.message),
    errors: result.errors.map((error) => error.message),
    timestamp: Date.now(),
  };
}

export type MeshOperationsCompactCardProps = {
  testId: string;
  meshReady: boolean;
  activeMeshLabel?: string | null;
  workerReady: boolean;
  workerStatusText: string;
  cgalReady: boolean;
  cgalStatusText: string;
  busy: boolean;
  cgalBusy: boolean;
  lastResult: MeshOperationResultSummary | null;
  cleanComputeNormals: boolean;
  onChangeCleanComputeNormals: (value: boolean) => void;
  onClean: () => void;
  decimateReduction: number;
  onChangeDecimateReduction: (value: number) => void;
  decimateTargetFaces: number;
  onChangeDecimateTargetFaces: (value: number) => void;
  decimateUseTargetFaces: boolean;
  onChangeDecimateUseTargetFaces: (value: boolean) => void;
  onDecimate: () => void;
  smoothIterations: number;
  onChangeSmoothIterations: (value: number) => void;
  smoothPassband: number;
  onChangeSmoothPassband: (value: number) => void;
  onSmooth: () => void;
  booleanOperation: MeshBooleanOperation;
  onChangeBooleanOperation: (operation: MeshBooleanOperation) => void;
  booleanOperandObjectId: string | null;
  onChangeBooleanOperandObjectId: (id: string | null) => void;
  booleanOperandOptions: Array<{ id: string; name: string }>;
  booleanCurveRadius: number;
  onChangeBooleanCurveRadius: (value: number) => void;
  booleanStatus: string | null;
  onRunBoolean: () => void | Promise<void>;
  onPrepareBooleanDemo: () => void;
  onOpenBooleanDemoPair?: () => void;
  booleanOperandsVisible?: boolean;
  onShowBooleanOperands?: () => void;
  onHideBooleanOperands?: () => void;
  outputMode: "replace" | "derived";
  onChangeOutputMode: (mode: "replace" | "derived") => void;
  implicitAvailable: boolean;
  implicitExpr: string;
  onOpenImplicitSpherePreset: () => void;
  implicitResolution: number;
  previewBusy: boolean;
  previewError: string | null;
  previewTargetFaces: number;
  previewUseDecimate: boolean;
  onChangePreviewTargetFaces: (value: number) => void;
  onChangePreviewUseDecimate: (value: boolean) => void;
  onRunPreview: () => void | Promise<void>;
  cgalTargetEdge: number;
  onChangeCgalTargetEdge: (value: number) => void;
  cgalAutoTargetEdge: boolean;
  onChangeCgalAutoTargetEdge: (value: boolean) => void;
  cgalTriBudgetEnabled: boolean;
  onChangeCgalTriBudgetEnabled: (value: boolean) => void;
  cgalTriBudget: number;
  onChangeCgalTriBudget: (value: number) => void;
  cgalEffectiveEdge: number;
  cgalEstimatedTris: number;
  cgalError: string | null;
  onRunCgalMesh: () => void | Promise<void>;
  onOpenResult: () => void;
  canSendToGeometry: boolean;
  onSendToGeometry: () => void;
  onOpenResultInGeometry?: () => void;
};

const BOOLEAN_OPERATION_BY_MESH_OPERATION: Partial<Record<MeshOperationUiId, MeshBooleanOperation>> = {
  "boolean-union": "union",
  "boolean-difference": "difference",
  "boolean-intersection": "intersection",
  "boolean-imprint": "imprint",
};

const formatMeshOperationDuration = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "n/a" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;

const getMeshOperationRunLabel = (operation: MeshOperationUiId | null) =>
  operation ? `Run ${MESH_OPERATION_LABELS[operation] ?? operation}` : "Run operation";

const getMeshBooleanFormulaText = (operation: MeshBooleanOperation) => {
  if (operation === "union") return "Result = Active Mesh ∪ Operand B";
  if (operation === "difference") return "Result = Active Mesh - Operand B";
  if (operation === "intersection") return "Result = Active Mesh ∩ Operand B";
  return "Result = imprint curves from Active Mesh and Operand B";
};

type MeshOperationPresetId = "vtk-polish" | "vtk-simplify" | "vtk-smooth" | "vtk-boolean" | "cgal-implicit";

const MESH_OPERATION_PRESETS: Array<{
  id: MeshOperationPresetId;
  label: string;
  description: string;
  operation: MeshOperationUiId;
}> = [
  {
    id: "vtk-polish",
    label: "Clean",
    description: "Clean normals into a new mesh object.",
    operation: "clean-normals",
  },
  {
    id: "vtk-simplify",
    label: "Simplify",
    description: "Decimate to a smaller editable mesh.",
    operation: "decimate",
  },
  {
    id: "vtk-smooth",
    label: "Smooth",
    description: "Smooth mesh surface while preserving topology.",
    operation: "smooth",
  },
  {
    id: "vtk-boolean",
    label: "Boolean",
    description: "Prepare a two-mesh union/difference workflow.",
    operation: "boolean-union",
  },
  {
    id: "cgal-implicit",
    label: "Implicit mesh",
    description: "Mesh an active implicit surface.",
    operation: "implicit-mesh",
  },
];

export const MeshOperationsCompactCard: React.FC<MeshOperationsCompactCardProps> = ({
  testId,
  meshReady,
  activeMeshLabel,
  workerReady,
  workerStatusText,
  cgalReady,
  cgalStatusText,
  busy,
  cgalBusy,
  lastResult,
  cleanComputeNormals,
  onChangeCleanComputeNormals,
  onClean,
  decimateReduction,
  onChangeDecimateReduction,
  decimateTargetFaces,
  onChangeDecimateTargetFaces,
  decimateUseTargetFaces,
  onChangeDecimateUseTargetFaces,
  onDecimate,
  smoothIterations,
  onChangeSmoothIterations,
  smoothPassband,
  onChangeSmoothPassband,
  onSmooth,
  booleanOperation,
  onChangeBooleanOperation,
  booleanOperandObjectId,
  onChangeBooleanOperandObjectId,
  booleanOperandOptions,
  booleanCurveRadius,
  onChangeBooleanCurveRadius,
  booleanStatus,
  onRunBoolean,
  onPrepareBooleanDemo,
  onOpenBooleanDemoPair,
  booleanOperandsVisible,
  onShowBooleanOperands,
  onHideBooleanOperands,
  outputMode,
  onChangeOutputMode,
  implicitAvailable,
  implicitExpr,
  onOpenImplicitSpherePreset,
  implicitResolution,
  previewBusy,
  previewError,
  previewTargetFaces,
  previewUseDecimate,
  onChangePreviewTargetFaces,
  onChangePreviewUseDecimate,
  cgalTargetEdge,
  onChangeCgalTargetEdge,
  cgalAutoTargetEdge,
  onChangeCgalAutoTargetEdge,
  cgalTriBudgetEnabled,
  onChangeCgalTriBudgetEnabled,
  cgalTriBudget,
  onChangeCgalTriBudget,
  cgalEffectiveEdge,
  cgalEstimatedTris,
  cgalError,
  onRunPreview,
  onRunCgalMesh,
  onOpenResult,
  canSendToGeometry,
  onSendToGeometry,
  onOpenResultInGeometry,
}) => {
  const [expandedOperation, setExpandedOperation] = useState<MeshOperationUiId | null>(null);
  const operationBusy = busy || cgalBusy || previewBusy;
  const resultStatusColor =
    lastResult?.status === "error"
      ? "#b42318"
      : lastResult?.status === "warning"
        ? "#b45309"
        : lastResult
          ? "#166534"
          : "#64748b";
  const selectOperation = (operation: MeshOperationUiId) => {
    const booleanOperationForRow = BOOLEAN_OPERATION_BY_MESH_OPERATION[operation];
    if (booleanOperationForRow) onChangeBooleanOperation(booleanOperationForRow);
    setExpandedOperation((current) => (current === operation ? null : operation));
  };
  const applyPreset = (preset: MeshOperationPresetId) => {
    if (preset === "vtk-polish") {
      onChangeCleanComputeNormals(true);
      onChangeOutputMode("derived");
      setExpandedOperation("clean-normals");
      return;
    }
    if (preset === "vtk-simplify") {
      onChangeDecimateUseTargetFaces(true);
      onChangeDecimateTargetFaces(Math.max(500, Math.min(20000, decimateTargetFaces)));
      onChangeOutputMode("derived");
      setExpandedOperation("decimate");
      return;
    }
    if (preset === "vtk-smooth") {
      onChangeSmoothIterations(Math.max(3, smoothIterations));
      onChangeSmoothPassband(Math.max(0.01, Math.min(0.2, smoothPassband)));
      onChangeOutputMode("derived");
      setExpandedOperation("smooth");
      return;
    }
    if (preset === "vtk-boolean") {
      onChangeBooleanOperation("union");
      onChangeOutputMode("derived");
      if (booleanOperandOptions.length === 0) onPrepareBooleanDemo();
      setExpandedOperation("boolean-union");
      return;
    }
    if (preset === "cgal-implicit") {
      onChangeCgalAutoTargetEdge(true);
      onChangeCgalTriBudgetEnabled(true);
      onChangeCgalTriBudget(Math.max(5000, Math.min(100000, cgalTriBudget)));
      if (!implicitAvailable) onOpenImplicitSpherePreset();
      setExpandedOperation("implicit-mesh");
    }
  };
  const runExpandedOperation = () => {
    if (!expandedOperation) return;
    if (expandedOperation === "clean-normals") {
      onClean();
      return;
    }
    if (expandedOperation === "decimate") {
      onDecimate();
      return;
    }
    if (expandedOperation === "smooth") {
      onSmooth();
      return;
    }
    if (expandedOperation === "implicit-preview") {
      void onRunPreview();
      return;
    }
    if (expandedOperation === "implicit-mesh") {
      void onRunCgalMesh();
      return;
    }
    if (BOOLEAN_OPERATION_BY_MESH_OPERATION[expandedOperation]) {
      void onRunBoolean();
    }
  };
  const prepareBooleanDemoForExpandedOperation = () => {
    onPrepareBooleanDemo();
    const operation = expandedOperation ? BOOLEAN_OPERATION_BY_MESH_OPERATION[expandedOperation] : null;
    if (operation) onChangeBooleanOperation(operation);
  };
  const expandedIsBoolean = !!(expandedOperation && BOOLEAN_OPERATION_BY_MESH_OPERATION[expandedOperation]);
  const selectedBooleanOperand = booleanOperandOptions.find((entry) => entry.id === booleanOperandObjectId) ?? null;
  const booleanActiveLabel = activeMeshLabel?.trim() || "Active Mesh";
  const booleanOperandLabel = selectedBooleanOperand?.name?.trim() || "Operand B";
  const expandedCanRun =
    expandedOperation === "implicit-preview"
      ? implicitAvailable && workerReady && !operationBusy
      : expandedOperation === "implicit-mesh"
        ? implicitAvailable && cgalReady && !operationBusy
        : expandedIsBoolean
          ? meshReady && workerReady && !!booleanOperandObjectId && !operationBusy
          : expandedOperation
            ? meshReady && workerReady && !operationBusy
            : false;
  const previewResolution = Math.max(8, Math.min(220, Math.round(implicitResolution)));

  return (
    <div
      data-testid={testId}
      style={{
        border: "1px solid #a7f3d0",
        borderRadius: 7,
        background: "#f0fdf4",
        padding: "7px 8px",
        display: "grid",
        gap: 6,
        color: "#0f3557",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>Mesh Operations</strong>
        <span style={{ color: workerReady ? "#166534" : "#b42318", fontSize: 10, fontWeight: 800 }}>
          {workerReady ? "worker ready" : workerStatusText}
        </span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#0f3557" }}>Presets</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {MESH_OPERATION_PRESETS.map((preset) => (
            <button
              key={`${testId}-preset-${preset.id}`}
              data-testid={`${testId}-preset-${preset.id}`}
              type="button"
              onClick={() => applyPreset(preset.id)}
              title={preset.description}
              style={{
                border: "1px solid #a7f3d0",
                background: expandedOperation === preset.operation ? "#bbf7d0" : "#fff",
                color: "#0f3557",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gap: 3, fontSize: 10 }}>
        {MESH_OPERATION_CAPABILITIES.map((capability) => {
          const operation = capability.operation as MeshOperationUiId;
          const operationReady = capability.engines.some((engine) => (engine === "cgal" ? cgalReady : workerReady));
          const needsImplicit = operation === "implicit-preview" || operation === "implicit-mesh";
          const operationUsable = operationReady && (!needsImplicit || implicitAvailable);
          const expanded = expandedOperation === operation;
          return (
            <div key={`${testId}-${operation}`} style={{ display: "grid", gap: 4 }}>
              <button
                data-testid={`${testId}-row-${operation}`}
                type="button"
                onClick={() => selectOperation(operation)}
                aria-expanded={expanded}
                title={needsImplicit && !implicitAvailable ? "Open an implicit surface first" : undefined}
                style={{
                  border: `1px solid ${expanded ? "#16a34a" : "transparent"}`,
                  background: expanded ? "#bbf7d0" : "transparent",
                  boxShadow: expanded ? "inset 3px 0 0 #16a34a, 0 1px 3px rgba(22, 101, 52, 0.15)" : "none",
                  padding: "3px 5px 3px 7px",
                  display: "grid",
                  gridTemplateColumns: "minmax(100px, 1fr) auto",
                  gap: 6,
                  alignItems: "center",
                  textAlign: "left",
                  opacity: operationUsable ? 1 : 0.58,
                  cursor: "pointer",
                  borderRadius: 5,
                }}
              >
                <span style={{ fontWeight: expanded ? 800 : 600 }}>{MESH_OPERATION_LABELS[operation] ?? operation}</span>
                <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {expanded && (
                    <span
                      style={{
                        border: "1px solid #16a34a",
                        background: "#dcfce7",
                        color: "#166534",
                        borderRadius: 999,
                        padding: "1px 6px",
                        fontSize: 9,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      active
                    </span>
                  )}
                  {capability.engines.map((engine) => {
                    const engineReady = engine === "cgal" ? cgalReady : workerReady;
                    return (
                      <span
                        key={`${testId}-${operation}-${engine}`}
                        style={{
                          border: `1px solid ${engineReady ? "#86efac" : "#e2e8f0"}`,
                          background: engineReady ? "#f0fdf4" : "#f8fafc",
                          color: engineReady ? "#166534" : "#64748b",
                          borderRadius: 999,
                          padding: "1px 6px",
                          fontSize: 9,
                          fontWeight: 800,
                          textTransform: "uppercase",
                        }}
                      >
                        {engine}
                      </span>
                    );
                  })}
                </span>
              </button>
              {expanded && (
                <div
                  style={{
                    border: "1px solid #bbf7d0",
                    borderRadius: 7,
                    background: "#f8fffb",
                    padding: "6px 7px",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {operation === "clean-normals" && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={cleanComputeNormals}
                        onChange={(event) => onChangeCleanComputeNormals(event.target.checked)}
                      />
                      recompute normals
                    </label>
                  )}
                  {operation === "decimate" && (
                    <>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-decimate-use-target-faces`}
                          type="checkbox"
                          checked={decimateUseTargetFaces}
                          onChange={(event) => onChangeDecimateUseTargetFaces(event.target.checked)}
                        />
                        use target faces
                      </label>
                      <label style={{ display: "grid", gap: 3 }}>
                        <span>reduction {decimateReduction.toFixed(2)}</span>
                        <input
                          data-testid={`${testId}-decimate-reduction`}
                          type="range"
                          min={0}
                          max={0.95}
                          step={0.01}
                          value={decimateReduction}
                          onChange={(event) => onChangeDecimateReduction(Number(event.target.value))}
                          disabled={decimateUseTargetFaces}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        target faces
                        <input
                          data-testid={`${testId}-decimate-target-faces`}
                          type="number"
                          min={100}
                          max={1000000}
                          step={100}
                          value={decimateTargetFaces}
                          onChange={(event) => onChangeDecimateTargetFaces(Number(event.target.value))}
                          disabled={!decimateUseTargetFaces}
                          style={{ width: 105 }}
                        />
                      </label>
                    </>
                  )}
                  {operation === "smooth" && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        iterations
                        <input
                          data-testid={`${testId}-smooth-iterations`}
                          type="number"
                          min={1}
                          max={200}
                          step={1}
                          value={smoothIterations}
                          onChange={(event) => onChangeSmoothIterations(Number(event.target.value))}
                          style={{ width: 58 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        passband
                        <input
                          data-testid={`${testId}-smooth-passband`}
                          type="number"
                          min={0.001}
                          max={1}
                          step={0.01}
                          value={smoothPassband}
                          onChange={(event) => onChangeSmoothPassband(Number(event.target.value))}
                          style={{ width: 68 }}
                        />
                      </label>
                    </div>
                  )}
                  {(operation === "clean-normals" || operation === "decimate" || operation === "smooth") && (
                    <div style={{ display: "grid", gap: 3 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name={`${testId}-${operation}-output-mode`}
                          checked={outputMode === "derived"}
                          onChange={() => onChangeOutputMode("derived")}
                        />
                        New object
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="radio"
                          name={`${testId}-${operation}-output-mode`}
                          checked={outputMode === "replace"}
                          onChange={() => onChangeOutputMode("replace")}
                        />
                        Replace
                      </label>
                    </div>
                  )}
                  {expandedIsBoolean && (
          <>
                      <div
                        data-testid={`${testId}-boolean-formula`}
                        style={{
                          border: "1px solid #bbf7d0",
                          background: "#ecfdf5",
                          borderRadius: 6,
                          padding: "5px 6px",
                          display: "grid",
                          gap: 5,
                        }}
                      >
                        <strong>{getMeshBooleanFormulaText(booleanOperation)}</strong>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          <span
                            data-testid={`${testId}-boolean-chip-a`}
                            style={{
                              border: "1px solid #93c5fd",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              borderRadius: 999,
                              padding: "2px 7px",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            A: {booleanActiveLabel}
                          </span>
                          <span
                            data-testid={`${testId}-boolean-chip-b`}
                            style={{
                              border: "1px solid #fdba74",
                              background: "#fff7ed",
                              color: "#9a3412",
                              borderRadius: 999,
                              padding: "2px 7px",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            B: {booleanOperandLabel}
                          </span>
                        </div>
                        <div style={{ color: "#92400e", fontSize: 10, fontWeight: 700 }}>
                          Needs closed watertight meshes before the boolean engine runs.
                        </div>
                      </div>
                      <label style={{ display: "grid", gap: 3 }}>
                        Operand B
                        <select
                          data-testid={`${testId}-boolean-operand`}
                          value={booleanOperandObjectId ?? ""}
                          onChange={(event) => onChangeBooleanOperandObjectId(event.target.value || null)}
                          disabled={booleanOperandOptions.length === 0 || operationBusy}
                        >
                          {booleanOperandOptions.length === 0 ? (
                            <option value="">No Geometry objects</option>
                          ) : (
                            booleanOperandOptions.map((entry) => (
                              <option key={`${testId}-operand-${entry.id}`} value={entry.id}>
                                {entry.name}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      {booleanOperandOptions.length === 0 ? (
                        <div
                          style={{
                            border: "1px solid #fed7aa",
                            background: "#fff7ed",
                            borderRadius: 6,
                            padding: "5px 6px",
                            color: "#9a3412",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <strong>Boolean needs a second mesh object.</strong>
                          <span>Create two overlapping mesh operands, with A loaded in Mesh and B selected here.</span>
                          <button
                            data-testid={`${testId}-prepare-boolean-demo`}
                            type="button"
                            onClick={prepareBooleanDemoForExpandedOperation}
                            disabled={operationBusy}
                            style={{ justifySelf: "start", fontWeight: 800 }}
                          >
                            Create Boolean demo operands
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 5 }}>
                          <span style={{ color: "#475569" }}>
                            Operand A is the active Mesh object. Operand B comes from Geometry.
                          </span>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {onOpenBooleanDemoPair && (
                              <button
                                data-testid={`${testId}-open-boolean-demo-pair`}
                                type="button"
                                onClick={onOpenBooleanDemoPair}
                                disabled={operationBusy}
                                style={{ justifySelf: "start", fontWeight: 800 }}
                              >
                                Boolean demo pair
                              </button>
                            )}
                            <button
                              data-testid={`${testId}-prepare-boolean-demo`}
                              type="button"
                              onClick={prepareBooleanDemoForExpandedOperation}
                              disabled={operationBusy}
                              style={{ justifySelf: "start", fontWeight: 800 }}
                            >
                              Send A to Mesh + use B
                            </button>
                          </div>
                        </div>
                      )}
                      {booleanOperandOptions.length === 0 && onOpenBooleanDemoPair && (
                        <button
                          data-testid={`${testId}-open-boolean-demo-pair-empty`}
                          type="button"
                          onClick={onOpenBooleanDemoPair}
                          disabled={operationBusy}
                          style={{ justifySelf: "start", fontWeight: 800 }}
                        >
                          Open Boolean demo pair in Geometry
                        </button>
                      )}
                      {booleanOperandOptions.length > 0 && (onShowBooleanOperands || onHideBooleanOperands) && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button
                            data-testid={`${testId}-toggle-boolean-operands`}
                            type="button"
                            onClick={booleanOperandsVisible ? onHideBooleanOperands : onShowBooleanOperands}
                            style={{ justifySelf: "start", fontWeight: 800 }}
                          >
                            {booleanOperandsVisible ? "Hide operands" : "Show operands"}
                          </button>
                        </div>
                      )}
                      {booleanOperation === "imprint" && (
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          curve radius
                          <input
                            data-testid={`${testId}-boolean-curve-radius`}
                            type="number"
                            min={0}
                            max={10}
                            step={0.01}
                            value={booleanCurveRadius}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (Number.isFinite(value)) onChangeBooleanCurveRadius(Math.max(0, Math.min(10, value)));
                            }}
                            style={{ width: 85 }}
                          />
                        </label>
                      )}
                      <div style={{ display: "grid", gap: 3 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="radio"
                            name={`${testId}-output-mode`}
                            checked={outputMode === "derived"}
                            onChange={() => onChangeOutputMode("derived")}
                          />
                          New object
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="radio"
                            name={`${testId}-output-mode`}
                            checked={outputMode === "replace"}
                            onChange={() => onChangeOutputMode("replace")}
                          />
                          Replace
                        </label>
                      </div>
                      {booleanStatus && <div style={{ color: "#0a66c2" }}>{booleanStatus}</div>}
                    </>
                  )}
                  {operation === "implicit-preview" && (
                    <>
                      <div>Source: {implicitAvailable ? implicitExpr : "Open an implicit surface first"}</div>
                      {!implicitAvailable && (
                        <div
                          style={{
                            border: "1px solid #fed7aa",
                            background: "#fff7ed",
                            borderRadius: 6,
                            padding: "5px 6px",
                            color: "#9a3412",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <strong>Open an implicit surface first.</strong>
                          <button
                            data-testid={`${testId}-open-implicit-sphere`}
                            type="button"
                            onClick={onOpenImplicitSpherePreset}
                            disabled={operationBusy}
                            style={{ justifySelf: "start", fontWeight: 800 }}
                          >
                            Open implicit sphere preset
                          </button>
                        </div>
                      )}
                      <div>Resolution: {previewResolution}^3</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-implicit-preview-use-decimate`}
                          type="checkbox"
                          checked={previewUseDecimate}
                          disabled={previewBusy}
                          onChange={(event) => onChangePreviewUseDecimate(event.target.checked)}
                        />
                        decimate preview
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        target faces
                        <input
                          data-testid={`${testId}-implicit-preview-target-faces`}
                          type="number"
                          min={200}
                          max={500000}
                          step={100}
                          value={Math.min(500000, Math.max(200, Math.round(previewTargetFaces)))}
                          disabled={!previewUseDecimate || previewBusy}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) onChangePreviewTargetFaces(Math.min(500000, Math.max(200, value)));
                          }}
                          style={{ width: 105 }}
                        />
                      </label>
                      {previewError && <div style={{ color: "#b42318" }}>{previewError}</div>}
                    </>
                  )}
                  {operation === "implicit-mesh" && (
                    <>
                      <div>Source: {implicitAvailable ? implicitExpr : "Open an implicit surface first"}</div>
                      {!implicitAvailable && (
                        <div
                          style={{
                            border: "1px solid #fed7aa",
                            background: "#fff7ed",
                            borderRadius: 6,
                            padding: "5px 6px",
                            color: "#9a3412",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <strong>Open an implicit surface first.</strong>
                          <button
                            data-testid={`${testId}-open-implicit-sphere`}
                            type="button"
                            onClick={onOpenImplicitSpherePreset}
                            disabled={operationBusy}
                            style={{ justifySelf: "start", fontWeight: 800 }}
                          >
                            Open implicit sphere preset
                          </button>
                        </div>
                      )}
                      <div>Worker: {cgalStatusText}</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-implicit-auto-edge`}
                          type="checkbox"
                          checked={cgalAutoTargetEdge}
                          onChange={(event) => onChangeCgalAutoTargetEdge(event.target.checked)}
                        />
                        auto edge
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        target edge
                        <input
                          data-testid={`${testId}-implicit-target-edge`}
                          type="number"
                          min={0.01}
                          max={10}
                          step={0.01}
                          value={cgalTargetEdge}
                          onChange={(event) => onChangeCgalTargetEdge(Number(event.target.value))}
                          disabled={cgalAutoTargetEdge || cgalTriBudgetEnabled}
                          style={{ width: 75 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-implicit-triangle-budget-enabled`}
                          type="checkbox"
                          checked={cgalTriBudgetEnabled}
                          onChange={(event) => onChangeCgalTriBudgetEnabled(event.target.checked)}
                        />
                        triangle budget
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        budget
                        <input
                          data-testid={`${testId}-implicit-triangle-budget`}
                          type="number"
                          min={1000}
                          max={5000000}
                          step={1000}
                          value={cgalTriBudget}
                          onChange={(event) => onChangeCgalTriBudget(Number(event.target.value))}
                          disabled={!cgalTriBudgetEnabled}
                          style={{ width: 100 }}
                        />
                      </label>
                      <div>
                        effective edge {cgalEffectiveEdge.toFixed(3)} · est {Math.round(cgalEstimatedTris).toLocaleString()} tris
                      </div>
                      {cgalError && <div style={{ color: "#b42318" }}>{cgalError}</div>}
                    </>
                  )}
                  <button
                    data-testid={`${testId}-run-${operation}`}
                    type="button"
                    onClick={runExpandedOperation}
                    disabled={!expandedCanRun}
                    style={{ justifySelf: "start", fontWeight: 800 }}
                  >
                    {operationBusy ? "Working..." : getMeshOperationRunLabel(expandedOperation)}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        data-testid={`${testId}-last-result`}
        style={{ borderTop: "1px solid #bbf7d0", paddingTop: 5, display: "grid", gap: 3, fontSize: 10 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong>Last operation</strong>
          <strong style={{ color: resultStatusColor }}>{lastResult ? lastResult.status : "none"}</strong>
        </div>
        {lastResult ? (
          <>
            <div>
              {lastResult.label} · {lastResult.engine.toUpperCase()} · {formatMeshOperationDuration(lastResult.durationMs)}
            </div>
            <div>
              Vertices: {lastResult.beforeVertices.toLocaleString()} {"->"}{" "}
              {lastResult.afterVertices == null ? "n/a" : lastResult.afterVertices.toLocaleString()}
            </div>
            <div>
              Triangles: {lastResult.beforeFaces.toLocaleString()} {"->"}{" "}
              {lastResult.afterFaces == null ? "n/a" : lastResult.afterFaces.toLocaleString()}
            </div>
            <div>Output: {lastResult.outputMode}</div>
            {lastResult.sourceIds.length > 0 && <div>Sources: {lastResult.sourceIds.join(", ")}</div>}
            {lastResult.warnings.length > 0 && <div style={{ color: "#b45309" }}>Warnings: {lastResult.warnings.join("; ")}</div>}
            {lastResult.errors.length > 0 && <div style={{ color: "#b42318" }}>Errors: {lastResult.errors.join("; ")}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              <button data-testid={`${testId}-open-result`} type="button" onClick={onOpenResult}>
                Open result
              </button>
              <button data-testid={`${testId}-send-to-geometry`} type="button" onClick={onSendToGeometry} disabled={!canSendToGeometry}>
                Send to Geometry
              </button>
              <button
                data-testid={`${testId}-open-result-in-geometry`}
                type="button"
                onClick={onOpenResultInGeometry ?? onSendToGeometry}
                disabled={!canSendToGeometry}
              >
                Open result in Geometry
              </button>
            </div>
          </>
        ) : (
          <div style={{ color: "#64748b" }}>Click any row to set parameters, then Run.</div>
        )}
      </div>
    </div>
  );
};
