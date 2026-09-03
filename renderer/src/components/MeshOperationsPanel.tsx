import React, { useEffect, useRef, useState } from "react";
import {
  MESH_OPERATION_CAPABILITIES,
  type MeshOperationCapability,
  type MeshOperationId,
  type MeshOperationRequest,
  type MeshOperationResult,
  type MeshOperationStatus,
  type MeshBooleanSummary,
  type MeshRepairValidationSummary,
  type MeshRepairSummary,
  type MeshRemeshSummary,
  type MeshValidationSummary,
  type ResolvedMeshOperationEngine,
} from "../services/meshOperations";
import {
  MeshBooleanReviewCard,
  type MeshBooleanReviewEntityControls,
} from "./MeshBooleanReviewCard";

export type MeshBooleanOperation = "union" | "difference" | "intersection" | "split" | "imprint";
export type MeshBooleanStrategy = "auto" | "fast" | "robust";

export type MeshOperationUiId = MeshOperationId | "boolean-split";
export type MeshOperationVisibleRowId = MeshOperationUiId;
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
  diagnostics?: string[];
  validation?: MeshValidationSummary;
  repair?: MeshRepairSummary;
  remesh?: MeshRemeshSummary;
  boolean?: MeshBooleanSummary;
  booleanReview?: {
    operandA: string;
    operandB: string;
    result: string;
  };
  validationContext?: "active-mesh" | "boolean-result";
  repairValidation?: MeshRepairValidationSummary;
  warnings: string[];
  errors: string[];
  timestamp: number;
};

export type MeshOperationHistoryEntry = {
  id: string;
  at: number;
  result: MeshOperationResultSummary;
  request?: MeshOperationRequest;
  /** Earlier operation results this entry consumes; absent only for an imported/root mesh. */
  parentEntryIds?: string[];
  outputLabel?: string;
  topologyHistoryEntryId?: string | null;
  undoneAt?: number | null;
};

export type MeshOperationSavedPresetSummary = {
  id: string;
  name: string;
  createdAt: number;
  operation?: MeshOperationUiId | null;
  request?: MeshOperationRequest | null;
  lastResult?: MeshOperationResultSummary | null;
};

export const MESH_OPERATION_LABELS: Record<MeshOperationUiId, string> = {
  "cgal-validate": "Validate mesh",
  "cgal-repair": "Repair mesh",
  "cgal-repair-validate": "Repair + Validate",
  "cgal-remesh": "Remesh",
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

const MESH_OPERATION_ROW_LABELS: Record<MeshOperationVisibleRowId, string> = {
  ...MESH_OPERATION_LABELS,
  "cgal-remesh": "Remesh",
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
    diagnostics: result.warnings.filter((warning) => warning.severity === "info").map((warning) => warning.message),
    validation: result.validation,
    repair: result.repair,
    remesh: result.remesh,
    boolean: result.boolean,
    repairValidation: result.repairValidation,
    warnings: result.warnings.filter((warning) => warning.severity !== "info").map((warning) => warning.message),
    errors: result.errors.map((error) => error.message),
    timestamp: Date.now(),
  };
}

export type MeshOperationsPanelProps = {
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
  lastValidation?: { meshLabel: string; status: MeshOperationStatus; validation: MeshValidationSummary; timestamp: number } | null;
  focusedOperation?: MeshOperationUiId | null;
  focusedOperationToken?: number;
  operationHistory?: MeshOperationHistoryEntry[];
  savedPresets?: MeshOperationSavedPresetSummary[];
  onRestoreOperationHistoryEntry?: (entryId: string) => void;
  onUndoLastOperation?: () => void;
  canUndoLastOperation?: boolean;
  onApplySavedOperationPreset?: (presetId: string) => void | Promise<void>;
  onSaveOperationPreset?: () => void;
  canSaveOperationPreset?: boolean;
  cleanComputeNormals: boolean;
  onChangeCleanComputeNormals: (value: boolean) => void;
  onValidate: () => void | Promise<void>;
  onValidateResult?: () => void | Promise<void>;
  repairOrientFaces: boolean;
  onChangeRepairOrientFaces: (value: boolean) => void;
  repairRemoveDegenerateFaces: boolean;
  onChangeRepairRemoveDegenerateFaces: (value: boolean) => void;
  repairRemoveDuplicateFaces: boolean;
  onChangeRepairRemoveDuplicateFaces: (value: boolean) => void;
  repairCompactVertices: boolean;
  onChangeRepairCompactVertices: (value: boolean) => void;
  repairFillSmallHoles: boolean;
  onChangeRepairFillSmallHoles: (value: boolean) => void;
  repairMaxHoleEdges: number;
  onChangeRepairMaxHoleEdges: (value: number) => void;
  onRepair: () => void | Promise<void>;
  onRepairValidate: () => void | Promise<void>;
  remeshTargetEdgeLength: number;
  onChangeRemeshTargetEdgeLength: (value: number) => void;
  remeshIterations: number;
  onChangeRemeshIterations: (value: number) => void;
  remeshPreserveSharpEdges: boolean;
  onChangeRemeshPreserveSharpEdges: (value: boolean) => void;
  onRemesh: () => void | Promise<void>;
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
  booleanStrategy: MeshBooleanStrategy;
  onChangeBooleanStrategy: (strategy: MeshBooleanStrategy) => void;
  booleanOperandObjectId: string | null;
  onChangeBooleanOperandObjectId: (id: string | null) => void;
  booleanOperandOptions: Array<{ id: string; name: string }>;
  booleanCurveRadius: number;
  onChangeBooleanCurveRadius: (value: number) => void;
  booleanStatus: string | null;
  onRunBoolean: () => void | Promise<void>;
  onPrepareBooleanDemo: () => void;
  onOpenBooleanDemoPair?: () => void;
  onSwapBooleanOperands?: () => void;
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
  onShowResultDetails?: () => void;
  canSendToGeometry: boolean;
  onSendToGeometry: () => void;
  onOpenResultInGeometry?: () => void;
  onRepairResult?: () => void | Promise<void>;
  onUseResultAsBooleanA?: () => void | Promise<void>;
  onUseResultAsBooleanB?: () => void | Promise<void>;
  onShowBooleanResultProblems?: () => void;
  onOpenFullBooleanValidation?: () => void;
  booleanReviewEntityControls?: MeshBooleanReviewEntityControls;
  onApplyOperationPreset?: (presetId: MeshOperationPresetId) => void | Promise<void>;
};

const BOOLEAN_OPERATION_BY_MESH_OPERATION: Partial<Record<MeshOperationVisibleRowId, MeshBooleanOperation>> = {
  "boolean-union": "union",
  "boolean-difference": "difference",
  "boolean-intersection": "intersection",
  "boolean-imprint": "imprint",
};

const formatMeshOperationDuration = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "n/a" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;

const getMeshOperationRunLabel = (operation: MeshOperationUiId | null) =>
  operation ? `Run ${MESH_OPERATION_LABELS[operation] ?? operation}` : "Run operation";

const getMeshOperationRowRunLabel = (operation: MeshOperationVisibleRowId | null) => {
  if (!operation) return "Run operation";
  return getMeshOperationRunLabel(operation);
};

const getSavedPresetOperationLabel = (preset: MeshOperationSavedPresetSummary) => {
  const operation = (preset.request?.operation ?? preset.operation ?? preset.lastResult?.operation ?? null) as MeshOperationUiId | null;
  return operation ? MESH_OPERATION_LABELS[operation] ?? operation : "Operation preset";
};

const getMeshBooleanFormulaText = (operation: MeshBooleanOperation) => {
  if (operation === "union") return "Result = Active Mesh ∪ Operand B";
  if (operation === "difference") return "Result = Active Mesh - Operand B";
  if (operation === "intersection") return "Result = Active Mesh ∩ Operand B";
  return "Result = imprint curves from Active Mesh and Operand B";
};

const getMeshValidationBlockers = (validation: MeshValidationSummary): string[] => {
  const blockers: string[] = [];
  if (!validation.watertight) blockers.push("not watertight");
  if (!validation.manifold || validation.nonManifoldEdgeCount > 0) {
    blockers.push(
      validation.nonManifoldEdgeCount > 0
        ? `${validation.nonManifoldEdgeCount.toLocaleString()} non-manifold edges`
        : "non-manifold edges"
    );
  }
  if (validation.boundaryEdgeCount > 0) blockers.push(`${validation.boundaryEdgeCount.toLocaleString()} boundary edges`);
  if (validation.invalidFaceCount > 0) blockers.push(`${validation.invalidFaceCount.toLocaleString()} invalid faces`);
  if (validation.degenerateFaceCount > 0) blockers.push(`${validation.degenerateFaceCount.toLocaleString()} degenerate faces`);
  if (validation.duplicateFaceCount > 0) blockers.push(`${validation.duplicateFaceCount.toLocaleString()} duplicate faces`);
  if (validation.selfIntersection.suspectedPairs > 0) {
    blockers.push(`${validation.selfIntersection.suspectedPairs.toLocaleString()} self-intersections suspected`);
  }
  if (!validation.selfIntersection.checked) blockers.push("self-intersections not checked");
  return blockers;
};

export type MeshOperationPresetId =
  | "clean-normals"
  | "cgal-validate"
  | "cgal-repair-memory"
  | "cgal-repair-validate"
  | "validate-bunny"
  | "repair-bunny"
  | "validate-armadillo"
  | "armadillo-robust-boolean"
  | "benchy-cutter-boolean"
  | "sphere-minus-box"
  | "bunny-smooth-validate"
  | "decimate-3dbenchy"
  | "load-dragon-medium"
  | "smooth-bunny"
  | "boolean-demo-pair"
  | "implicit-sphere-mesh";

const MESH_OPERATION_PRESETS: Array<{
  id: MeshOperationPresetId;
  label: string;
  description: string;
  operation: MeshOperationUiId;
}> = [
  {
    id: "cgal-validate",
    label: "Validate",
    description: "Check watertightness, manifoldness, components, and sampled self-intersections.",
    operation: "cgal-validate",
  },
  {
    id: "cgal-repair-memory",
    label: "Repair preview",
    description: "Run conservative repair as a new in-memory mesh result; save only after review.",
    operation: "cgal-repair",
  },
  {
    id: "cgal-repair-validate",
    label: "Repair + Validate",
    description: "Validate, repair as a new in-memory mesh, then validate the repaired result.",
    operation: "cgal-repair-validate",
  },
  {
    id: "clean-normals",
    label: "Clean",
    description: "Clean normals into a new mesh object.",
    operation: "clean-normals",
  },
  {
    id: "validate-bunny",
    label: "Validate Bunny",
    description: "Load Stanford Bunny and prepare robust validation for its open boundary edges.",
    operation: "cgal-validate",
  },
  {
    id: "repair-bunny",
    label: "Repair Bunny",
    description: "Load Stanford Bunny, repair as a new in-memory mesh, then validate the repaired result.",
    operation: "cgal-repair-validate",
  },
  {
    id: "validate-armadillo",
    label: "Validate Armadillo",
    description: "Load Armadillo and run robust validation as a non-destructive readiness check.",
    operation: "cgal-validate",
  },
  {
    id: "armadillo-robust-boolean",
    label: "Armadillo Robust Boolean",
    description: "Load Armadillo, add a cutter box as operand B, and prepare a robust Boolean difference.",
    operation: "boolean-difference",
  },
  {
    id: "benchy-cutter-boolean",
    label: "3DBenchy Cutter",
    description: "Load 3DBenchy, add a cutter box as operand B, and prepare Boolean difference.",
    operation: "boolean-difference",
  },
  {
    id: "sphere-minus-box",
    label: "Sphere minus box",
    description: "Create a closed sphere and cutter box, then prepare Robust Boolean difference.",
    operation: "boolean-difference",
  },
  {
    id: "bunny-smooth-validate",
    label: "Smooth + Validate Bunny",
    description: "Load Stanford Bunny, smooth into a new in-memory mesh, then validate the smoothed result.",
    operation: "smooth",
  },
  {
    id: "decimate-3dbenchy",
    label: "Decimate 3DBenchy",
    description: "Load 3DBenchy and prepare a target-face decimation.",
    operation: "decimate",
  },
  {
    id: "load-dragon-medium",
    label: "Dragon Medium",
    description: "Load Dragon Medium and open non-destructive validation.",
    operation: "cgal-validate",
  },
  {
    id: "smooth-bunny",
    label: "Smooth Bunny",
    description: "Load Stanford Bunny and prepare a smoothing operation.",
    operation: "smooth",
  },
  {
    id: "boolean-demo-pair",
    label: "Boolean demo pair",
    description: "Open two overlapping mesh operands for union/difference.",
    operation: "boolean-union",
  },
  {
    id: "implicit-sphere-mesh",
    label: "Implicit mesh",
    description: "Open the implicit sphere and prepare robust meshing.",
    operation: "implicit-mesh",
  },
];

type MeshOperationVisibleCapability = Omit<MeshOperationCapability, "operation"> & {
  operation: MeshOperationVisibleRowId;
  implemented: boolean;
  disabledReason?: string;
};

const MESH_OPERATION_ROWS: MeshOperationVisibleCapability[] = [
  ...MESH_OPERATION_CAPABILITIES.map((capability) => ({ ...capability, implemented: true })),
];

const MESH_OPERATION_ROW_BY_ID = new Map(MESH_OPERATION_ROWS.map((row) => [row.operation, row]));

const MESH_OPERATION_GROUP_DEFINITIONS: Array<{
  id: MeshOperationCapability["group"];
  label: string;
}> = [
  { id: "repair", label: "Repair" },
  { id: "simplify", label: "Simplify" },
  { id: "smooth", label: "Smooth" },
  { id: "boolean", label: "Boolean" },
  { id: "implicit", label: "Implicit meshing" },
];

const MESH_OPERATION_GROUPS: Array<{
  id: MeshOperationCapability["group"];
  label: string;
  operations: MeshOperationVisibleRowId[];
}> = MESH_OPERATION_GROUP_DEFINITIONS.map((group) => ({
  ...group,
  operations: MESH_OPERATION_ROWS.filter((row) => row.group === group.id).map((row) => row.operation),
}));

const validationBadgeStyle = (state: "pass" | "warn" | "fail"): React.CSSProperties => ({
  border: `1px solid ${state === "pass" ? "#86efac" : state === "warn" ? "#fcd34d" : "#fca5a5"}`,
  background: state === "pass" ? "#f0fdf4" : state === "warn" ? "#fffbeb" : "#fef2f2",
  color: state === "pass" ? "#166534" : state === "warn" ? "#92400e" : "#b42318",
  borderRadius: 6,
  padding: "3px 5px",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "baseline",
});

const yesNo = (value: boolean) => (value ? "yes" : "no");

const countChanged = (before: number, after: number) => before !== after;

const getValidationVerdict = (validation: MeshValidationSummary): { label: string; state: "pass" | "warn" | "fail" } => {
  const blockers =
    validation.boundaryEdgeCount +
    validation.nonManifoldEdgeCount +
    validation.invalidFaceCount +
    validation.degenerateFaceCount +
    validation.selfIntersection.suspectedPairs;
  if (!validation.watertight || !validation.manifold || blockers > 0) return { label: "Needs repair", state: "fail" };
  if (!validation.oriented || validation.duplicateFaceCount > 0 || validation.selfIntersection.truncated || validation.warnings.length > 0) {
    return { label: "Needs review", state: "warn" };
  }
  return { label: "Ready for robust operations", state: "pass" };
};

const getRepairVerdict = (repair: MeshRepairSummary): { label: string; state: "pass" | "warn" | "fail" } => {
  if (repair.warnings.length > 0) return { label: "Still needs review", state: "warn" };
  const changes =
    repair.removedInvalidFaces +
    repair.removedDegenerateFaces +
    repair.removedDuplicateFaces +
    repair.removedUnusedVertices +
    repair.filledHoles +
    (countChanged(repair.inputFaces, repair.outputFaces) ? 1 : 0) +
    (countChanged(repair.inputVertices, repair.outputVertices) ? 1 : 0);
  return changes > 0 ? { label: "Improved", state: "pass" } : { label: "No change", state: "warn" };
};

const formatBooleanMethod = (result: MeshOperationResultSummary): string => {
  if (!result.boolean) return "Method: Auto";
  if (result.engine === "cgal" || result.boolean.kernel === "native-cgal") return "Method: Robust";
  return "Method: Fast";
};

const formatMeshOperationBackend = (result: MeshOperationResultSummary): string => {
  if (result.boolean) {
    return formatBooleanMethod(result);
  }
  return result.engine.toUpperCase();
};

const MeshValidationCard: React.FC<{
  validation: MeshValidationSummary;
  compact?: boolean;
  title?: string;
}> = ({ validation, compact = false, title = "Validation" }) => {
  const verdict = getValidationVerdict(validation);
  const row = (label: string, value: string | number, state: "pass" | "warn" | "fail") => (
    <div key={label} style={validationBadgeStyle(state)}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </div>
  );
  const selfState =
    !validation.selfIntersection.checked || validation.selfIntersection.truncated
      ? "warn"
      : validation.selfIntersection.suspectedPairs > 0
        ? "fail"
        : "pass";
  const rows = [
    row("Watertight", yesNo(validation.watertight), validation.watertight ? "pass" : "fail"),
    row("Manifold", yesNo(validation.manifold), validation.manifold ? "pass" : "fail"),
    row("Components", validation.componentCount, validation.componentCount === 1 ? "pass" : "warn"),
    row("Boundary edges", validation.boundaryEdgeCount, validation.boundaryEdgeCount === 0 ? "pass" : "fail"),
    row("Non-manifold edges", validation.nonManifoldEdgeCount, validation.nonManifoldEdgeCount === 0 ? "pass" : "fail"),
    row("Degenerate faces", validation.degenerateFaceCount, validation.degenerateFaceCount === 0 ? "pass" : "warn"),
    row("Duplicate faces", validation.duplicateFaceCount, validation.duplicateFaceCount === 0 ? "pass" : "warn"),
    row(
      "Self intersections",
      validation.selfIntersection.checked
        ? `${validation.selfIntersection.suspectedPairs.toLocaleString()} pairs`
        : "not checked",
      selfState
    ),
  ];

  return (
    <div
      data-testid="mesh-operation-validation-card"
      style={{
        border: "1px solid #bfdbfe",
        borderRadius: 7,
        background: "#f8fbff",
        padding: compact ? "5px 6px" : "7px 8px",
        display: "grid",
        gap: 5,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>{title}</strong>
        <span style={validationBadgeStyle(verdict.state)}>
          <strong>{verdict.label}</strong>
        </span>
      </div>
      {!compact && (
        <div style={{ color: "#475569", fontSize: 10 }}>
          Topology was checked without changing the mesh. Use this verdict to decide whether robust booleans can run.
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: 4,
          fontSize: 10,
        }}
      >
        {rows}
      </div>
      <div style={{ color: "#64748b", fontSize: 10 }}>
        {validation.vertexCount.toLocaleString()} vertices · {validation.faceCount.toLocaleString()} triangles ·{" "}
        {validation.edgeCount.toLocaleString()} edges
        {validation.selfIntersection.truncated ? " · sampled self-intersection check" : ""}
      </div>
    </div>
  );
};

const MeshBooleanValidationCard: React.FC<{
  validation: MeshValidationSummary;
  onRepairResult?: () => void | Promise<void>;
  onUseResultAsBooleanA?: () => void | Promise<void>;
  onUseResultAsBooleanB?: () => void | Promise<void>;
  onShowBooleanResultProblems?: () => void;
  onOpenFullBooleanValidation?: () => void;
}> = ({
  validation,
  onRepairResult,
  onUseResultAsBooleanA,
  onUseResultAsBooleanB,
  onShowBooleanResultProblems,
  onOpenFullBooleanValidation,
}) => {
  const verdict = getValidationVerdict(validation);
  const blockers = getMeshValidationBlockers(validation);
  const blockerText = blockers.length ? blockers.slice(0, 5).join(", ") : "ready for robust boolean review";
  const actionText =
    blockers.length > 0
      ? "Repair the result, adjust operands, or inspect the cutter before keeping this result."
      : "Result passes the robust-readiness checks. It can be kept, sent to Geometry, or used as the next operand.";
  const countRow = (label: string, value: number, state: "pass" | "warn" | "fail") => (
    <div key={label} style={validationBadgeStyle(state)}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
  return (
    <div
      data-testid="mesh-operation-boolean-validation-card"
      style={{
        border: `1px solid ${verdict.state === "pass" ? "#86efac" : verdict.state === "warn" ? "#fcd34d" : "#fca5a5"}`,
        borderRadius: 7,
        background: verdict.state === "pass" ? "#f0fdf4" : verdict.state === "warn" ? "#fffbeb" : "#fef2f2",
        padding: "7px 8px",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>Boolean result validation</strong>
        <span style={validationBadgeStyle(verdict.state)}>
          <strong>{verdict.label}</strong>
        </span>
      </div>
      <div style={{ color: verdict.state === "pass" ? "#166534" : verdict.state === "warn" ? "#92400e" : "#b42318", fontSize: 10 }}>
        {blockerText}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, fontSize: 10 }}>
        {countRow("Boundary edges", validation.boundaryEdgeCount, validation.boundaryEdgeCount === 0 ? "pass" : "fail")}
        {countRow("Non-manifold edges", validation.nonManifoldEdgeCount, validation.nonManifoldEdgeCount === 0 ? "pass" : "fail")}
        {countRow("Degenerate faces", validation.degenerateFaceCount, validation.degenerateFaceCount === 0 ? "pass" : "warn")}
        {countRow("Duplicate faces", validation.duplicateFaceCount, validation.duplicateFaceCount === 0 ? "pass" : "warn")}
      </div>
      <div style={{ color: "#475569", fontSize: 10 }}>{actionText}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        <button
          data-testid="mesh-operation-boolean-validation-show-problems"
          type="button"
          onClick={onShowBooleanResultProblems}
          disabled={!onShowBooleanResultProblems}
        >
          Show Problems
        </button>
        <button
          data-testid="mesh-operation-boolean-validation-open-full"
          type="button"
          onClick={onOpenFullBooleanValidation}
          disabled={!onOpenFullBooleanValidation}
        >
          Open Full Validation
        </button>
        <button
          data-testid="mesh-operation-boolean-validation-repair-result"
          type="button"
          onClick={() => void onRepairResult?.()}
          disabled={!onRepairResult}
        >
          Repair result
        </button>
        <button
          data-testid="mesh-operation-boolean-validation-use-as-a"
          type="button"
          onClick={() => void onUseResultAsBooleanA?.()}
          disabled={!onUseResultAsBooleanA}
        >
          Use as A
        </button>
        <button
          data-testid="mesh-operation-boolean-validation-use-as-b"
          type="button"
          onClick={() => void onUseResultAsBooleanB?.()}
          disabled={!onUseResultAsBooleanB}
        >
          Use as B
        </button>
      </div>
    </div>
  );
};

const MeshRepairCard: React.FC<{ repair: MeshRepairSummary }> = ({ repair }) => {
  const verdict = getRepairVerdict(repair);
  const row = (label: string, value: number) => (
    <div key={label} style={validationBadgeStyle(value === 0 ? "pass" : "warn")}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
  return (
    <div
      data-testid="mesh-operation-repair-card"
      style={{
        border: "1px solid #bae6fd",
        borderRadius: 7,
        background: "#f0f9ff",
        padding: "6px",
        display: "grid",
        gap: 5,
        marginTop: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>Repair</strong>
        <span style={validationBadgeStyle(verdict.state)}>
          <strong>{verdict.label}</strong>
        </span>
      </div>
      <div style={{ color: "#475569", fontSize: 10 }}>New in-memory mesh result. Review it, then save/export only if it is the version you want.</div>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={validationBadgeStyle(countChanged(repair.inputVertices, repair.outputVertices) ? "warn" : "pass")}>
          <span>Vertices</span>
          <strong>
            {repair.inputVertices.toLocaleString()} {"->"} {repair.outputVertices.toLocaleString()}
          </strong>
        </div>
        <div style={validationBadgeStyle(countChanged(repair.inputFaces, repair.outputFaces) ? "warn" : "pass")}>
          <span>Triangles</span>
          <strong>
            {repair.inputFaces.toLocaleString()} {"->"} {repair.outputFaces.toLocaleString()}
          </strong>
        </div>
        {row("Degenerate faces removed", repair.removedDegenerateFaces)}
        {row("Duplicate faces removed", repair.removedDuplicateFaces)}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Repair details</summary>
        <div style={{ display: "grid", gap: 4, marginTop: 5 }}>
          {row("Invalid faces removed", repair.removedInvalidFaces)}
          {row("Unused vertices removed", repair.removedUnusedVertices)}
          {row("Small holes filled", repair.filledHoles)}
          <div style={{ color: "#64748b", fontSize: 10 }}>Oriented components: {repair.orientedComponents.toLocaleString()}</div>
        </div>
      </details>
      {!!repair.warnings.length && (
        <div style={{ color: "#b45309", fontSize: 10 }}>Warnings: {repair.warnings.join("; ")}</div>
      )}
      {!!repair.diagnostics.length && (
        <div style={{ color: "#64748b", fontSize: 10 }}>Details: {repair.diagnostics.join("; ")}</div>
      )}
    </div>
  );
};

const MeshRemeshCard: React.FC<{ remesh: MeshRemeshSummary }> = ({ remesh }) => {
  const row = (label: string, value: string | number, state: "pass" | "warn" | "fail" = "pass") => (
    <div key={label} style={validationBadgeStyle(state)}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </div>
  );
  return (
    <div
      data-testid="mesh-operation-remesh-card"
      style={{
        border: "1px solid #bae6fd",
        borderRadius: 7,
        background: "#f0f9ff",
        padding: "6px",
        display: "grid",
        gap: 5,
        marginTop: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>Remesh</strong>
        <span style={{ color: "#64748b" }}>
          {remesh.inputFaces.toLocaleString()} {"->"} {remesh.outputFaces.toLocaleString()} triangles
        </span>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {row("Target edge", remesh.targetEdgeLength.toPrecision(4))}
        {row("Iterations", remesh.iterations)}
        {row("Split edges", remesh.splitEdges, remesh.splitEdges > 0 ? "pass" : "warn")}
        {row("Smoothed vertices", remesh.smoothedVertices)}
        {row("Preserved vertices", remesh.preservedVertices, remesh.preservedVertices > 0 ? "warn" : "pass")}
      </div>
    </div>
  );
};

const MeshBooleanCard: React.FC<{
  booleanSummary: MeshBooleanSummary;
  sourceIds: string[];
  resultLabel: string;
  review?: MeshOperationResultSummary["booleanReview"];
  entityControls?: MeshBooleanReviewEntityControls;
}> = ({ booleanSummary, sourceIds, resultLabel, review, entityControls }) => {
  const sourceA = review?.operandA || sourceIds[0]?.trim() || "Active Mesh";
  const sourceB = review?.operandB || sourceIds[1]?.trim() || "Operand B";
  const resultName = review?.result || resultLabel;
  return (
    <MeshBooleanReviewCard
      booleanSummary={booleanSummary}
      inputAFaces={booleanSummary.inputAFaces}
      inputBFaces={booleanSummary.inputBFaces}
      method={booleanSummary.kernel === "native-cgal" ? "robust" : "fast"}
      operation={booleanSummary.operation as MeshBooleanOperation}
      operandA={sourceA}
      operandB={sourceB}
      result={resultName}
      resultFaces={booleanSummary.outputFaces}
      reviewTestId="mesh-operation-boolean-review"
      testId="mesh-operation-boolean-card"
      title="Boolean"
      entityControls={entityControls}
    />
  );
};

const MeshRepairValidationComparisonCard: React.FC<{ comparison: MeshRepairValidationSummary }> = ({ comparison }) => {
  const verdictText =
    comparison.verdict === "improved"
      ? "Improved"
      : comparison.verdict === "needs-review"
        ? "Still needs review"
        : "No change";
  const verdictState: "pass" | "warn" | "fail" =
    comparison.verdict === "improved" ? "pass" : comparison.verdict === "no-change" ? "warn" : "fail";
  const remainingBlockers = getMeshValidationBlockers(comparison.after);
  const explanation =
    remainingBlockers.length > 0
      ? `Still needs review: ${remainingBlockers.slice(0, 4).join(", ")}${
          remainingBlockers.length > 4 ? `, +${remainingBlockers.length - 4} more` : ""
        }. Repair kept the result in memory; save only after reviewing the remaining topology.`
      : "Repair result is closed/manifold enough for robust operations.";
  const deltaRow = (label: string, before: number, after: number, strictZero = true) => {
    const improved = after < before;
    const worse = after > before;
    const state: "pass" | "warn" | "fail" = strictZero && after > 0 ? (improved ? "warn" : "fail") : improved ? "pass" : worse ? "fail" : "warn";
    return (
      <div key={label} style={validationBadgeStyle(state)}>
        <span>{label}</span>
        <strong>
          {before.toLocaleString()} {"->"} {after.toLocaleString()}
        </strong>
      </div>
    );
  };
  return (
    <div
      data-testid="mesh-operation-repair-validation-card"
      style={{
        border: "1px solid #a7f3d0",
        borderRadius: 7,
        background: "#f0fdf4",
        padding: "6px",
        display: "grid",
        gap: 6,
        marginTop: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong>Repair + Validate</strong>
        <span style={validationBadgeStyle(verdictState)}>
          <strong>{verdictText}</strong>
          <span>
            {comparison.scoreBefore.toLocaleString()} {"->"} {comparison.scoreAfter.toLocaleString()}
          </span>
        </span>
      </div>
      <div
        data-testid="mesh-operation-repair-validation-explanation"
        style={{
          ...validationBadgeStyle(remainingBlockers.length > 0 ? "warn" : "pass"),
          alignItems: "start",
          whiteSpace: "normal",
        }}
      >
        <span>Verdict</span>
        <strong>{explanation}</strong>
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {deltaRow("Boundary edges", comparison.before.boundaryEdgeCount, comparison.after.boundaryEdgeCount)}
        {deltaRow("Non-manifold edges", comparison.before.nonManifoldEdgeCount, comparison.after.nonManifoldEdgeCount)}
        {deltaRow("Degenerate faces", comparison.before.degenerateFaceCount, comparison.after.degenerateFaceCount)}
        {deltaRow("Duplicate faces", comparison.before.duplicateFaceCount, comparison.after.duplicateFaceCount)}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Full before/after validation</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 5, marginTop: 5 }}>
          <MeshValidationCard validation={comparison.before} compact title="Before" />
          <MeshValidationCard validation={comparison.after} compact title="After" />
        </div>
      </details>
    </div>
  );
};

export const MeshOperationsPanel: React.FC<MeshOperationsPanelProps> = ({
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
  lastValidation,
  focusedOperation,
  focusedOperationToken,
  operationHistory = [],
  savedPresets = [],
  onRestoreOperationHistoryEntry,
  onUndoLastOperation,
  canUndoLastOperation = false,
  onApplySavedOperationPreset,
  onSaveOperationPreset,
  canSaveOperationPreset = false,
  cleanComputeNormals,
  onChangeCleanComputeNormals,
  onValidate,
  onValidateResult,
  repairOrientFaces,
  onChangeRepairOrientFaces,
  repairRemoveDegenerateFaces,
  onChangeRepairRemoveDegenerateFaces,
  repairRemoveDuplicateFaces,
  onChangeRepairRemoveDuplicateFaces,
  repairCompactVertices,
  onChangeRepairCompactVertices,
  repairFillSmallHoles,
  onChangeRepairFillSmallHoles,
  repairMaxHoleEdges,
  onChangeRepairMaxHoleEdges,
  onRepair,
  onRepairValidate,
  remeshTargetEdgeLength,
  onChangeRemeshTargetEdgeLength,
  remeshIterations,
  onChangeRemeshIterations,
  remeshPreserveSharpEdges,
  onChangeRemeshPreserveSharpEdges,
  onRemesh,
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
  booleanStrategy,
  onChangeBooleanStrategy,
  booleanOperandObjectId,
  onChangeBooleanOperandObjectId,
  booleanOperandOptions,
  booleanCurveRadius,
  onChangeBooleanCurveRadius,
  booleanStatus,
  onRunBoolean,
  onPrepareBooleanDemo,
  onOpenBooleanDemoPair,
  onSwapBooleanOperands,
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
  onShowResultDetails,
  canSendToGeometry,
  onSendToGeometry,
  onOpenResultInGeometry,
  onRepairResult,
  onUseResultAsBooleanA,
  onUseResultAsBooleanB,
  onShowBooleanResultProblems,
  onOpenFullBooleanValidation,
  booleanReviewEntityControls,
  onApplyOperationPreset,
}) => {
  const [expandedOperation, setExpandedOperation] = useState<MeshOperationVisibleRowId | null>(null);
  const appliedFocusRef = useRef<string | null>(null);
  const resultDetailsRef = useRef<HTMLDivElement | null>(null);
  const resultDetailsPulseTimeoutRef = useRef<number | null>(null);
  const [resultDetailsFocused, setResultDetailsFocused] = useState(false);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const [recentPresetId, setRecentPresetId] = useState("");
  const operationBusy = busy || cgalBusy || previewBusy;
  const resultStatusColor =
    lastResult?.status === "error"
      ? "#b42318"
      : lastResult?.status === "warning"
        ? "#b45309"
        : lastResult
          ? "#166534"
          : "#64748b";
  const selectOperation = (operation: MeshOperationVisibleRowId) => {
    const booleanOperationForRow = BOOLEAN_OPERATION_BY_MESH_OPERATION[operation];
    if (booleanOperationForRow) onChangeBooleanOperation(booleanOperationForRow);
    setExpandedOperation((current) => (current === operation ? null : operation));
  };
  useEffect(() => {
    if (!focusedOperation) return;
    const focusKey = `${focusedOperation}:${focusedOperationToken ?? 0}`;
    if (appliedFocusRef.current === focusKey) return;
    appliedFocusRef.current = focusKey;
    const booleanOperationForRow = BOOLEAN_OPERATION_BY_MESH_OPERATION[focusedOperation];
    if (booleanOperationForRow && booleanOperationForRow !== booleanOperation) {
      onChangeBooleanOperation(booleanOperationForRow);
    }
    setExpandedOperation((current) => (current === focusedOperation ? current : focusedOperation));
  }, [booleanOperation, focusedOperation, focusedOperationToken, onChangeBooleanOperation]);
  useEffect(() => {
    if (booleanOperation === "imprint" && booleanStrategy !== "fast") {
      onChangeBooleanStrategy("fast");
    }
  }, [booleanOperation, booleanStrategy, onChangeBooleanStrategy]);
  useEffect(
    () => () => {
      if (resultDetailsPulseTimeoutRef.current != null && typeof window !== "undefined") {
        window.clearTimeout(resultDetailsPulseTimeoutRef.current);
      }
    },
    []
  );
  const showResultDetails = () => {
    onShowResultDetails?.();
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const node = resultDetailsRef.current;
      if (!node) return;
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
      node.focus({ preventScroll: true });
      setResultDetailsFocused(true);
      if (resultDetailsPulseTimeoutRef.current != null) {
        window.clearTimeout(resultDetailsPulseTimeoutRef.current);
      }
      resultDetailsPulseTimeoutRef.current = window.setTimeout(() => {
        setResultDetailsFocused(false);
        resultDetailsPulseTimeoutRef.current = null;
      }, 1800);
    });
  };
  const applyPreset = (preset: MeshOperationPresetId) => {
    void onApplyOperationPreset?.(preset);
    if (preset === "clean-normals") {
      onChangeCleanComputeNormals(true);
      onChangeOutputMode("derived");
      setExpandedOperation("clean-normals");
      return;
    }
    if (preset === "cgal-validate") {
      setExpandedOperation("cgal-validate");
      return;
    }
    if (preset === "cgal-repair-memory") {
      onChangeRepairOrientFaces(true);
      onChangeRepairRemoveDegenerateFaces(true);
      onChangeRepairRemoveDuplicateFaces(true);
      onChangeRepairCompactVertices(true);
      onChangeRepairFillSmallHoles(true);
      onChangeOutputMode("derived");
      setExpandedOperation("cgal-repair");
      return;
    }
    if (preset === "cgal-repair-validate") {
      onChangeRepairOrientFaces(true);
      onChangeRepairRemoveDegenerateFaces(true);
      onChangeRepairRemoveDuplicateFaces(true);
      onChangeRepairCompactVertices(true);
      onChangeRepairFillSmallHoles(true);
      onChangeOutputMode("derived");
      setExpandedOperation("cgal-repair-validate");
      return;
    }
    if (preset === "validate-bunny") {
      setExpandedOperation("cgal-validate");
      return;
    }
    if (preset === "repair-bunny") {
      onChangeRepairOrientFaces(true);
      onChangeRepairRemoveDegenerateFaces(true);
      onChangeRepairRemoveDuplicateFaces(true);
      onChangeRepairCompactVertices(true);
      onChangeRepairFillSmallHoles(true);
      onChangeOutputMode("derived");
      setExpandedOperation("cgal-repair-validate");
      return;
    }
    if (preset === "validate-armadillo" || preset === "load-dragon-medium") {
      setExpandedOperation("cgal-validate");
      return;
    }
    if (preset === "benchy-cutter-boolean" || preset === "armadillo-robust-boolean" || preset === "sphere-minus-box") {
      onChangeBooleanOperation("difference");
      onChangeBooleanStrategy("robust");
      onChangeOutputMode("derived");
      setExpandedOperation("boolean-difference");
      return;
    }
    if (preset === "bunny-smooth-validate") {
      onChangeSmoothIterations(Math.max(4, smoothIterations));
      onChangeSmoothPassband(Math.max(0.01, Math.min(0.15, smoothPassband)));
      onChangeOutputMode("derived");
      setExpandedOperation("smooth");
      return;
    }
    if (preset === "decimate-3dbenchy") {
      onChangeDecimateUseTargetFaces(true);
      onChangeDecimateTargetFaces(Math.max(500, Math.min(20000, decimateTargetFaces)));
      onChangeOutputMode("derived");
      setExpandedOperation("decimate");
      return;
    }
    if (preset === "smooth-bunny") {
      onChangeSmoothIterations(Math.max(3, smoothIterations));
      onChangeSmoothPassband(Math.max(0.01, Math.min(0.2, smoothPassband)));
      onChangeOutputMode("derived");
      setExpandedOperation("smooth");
      return;
    }
    if (preset === "boolean-demo-pair") {
      onChangeBooleanOperation("union");
      onChangeOutputMode("derived");
      if (!onApplyOperationPreset && booleanOperandOptions.length === 0) onPrepareBooleanDemo();
      setExpandedOperation("boolean-union");
      return;
    }
    if (preset === "implicit-sphere-mesh") {
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
    if (expandedOperation === "cgal-validate") {
      void onValidate();
      return;
    }
    if (expandedOperation === "cgal-repair") {
      void onRepair();
      return;
    }
    if (expandedOperation === "cgal-repair-validate") {
      void onRepairValidate();
      return;
    }
    if (expandedOperation === "cgal-remesh") {
      void onRemesh();
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
  const hasUsableResult = !!lastResult && lastResult.status !== "error" && (lastResult.afterFaces != null || lastResult.afterVertices != null);
  const validationForActiveMesh =
    lastValidation && activeMeshLabel && lastValidation.meshLabel === activeMeshLabel
      ? lastValidation.validation
      : lastResult?.operation === "cgal-validate"
        ? lastResult.validation ?? null
        : null;
  const activeMeshHasValidation = !!validationForActiveMesh;
  const activeMeshValidationPass =
    !!validationForActiveMesh &&
    validationForActiveMesh.watertight &&
    validationForActiveMesh.manifold &&
    validationForActiveMesh.nonManifoldEdgeCount === 0 &&
    validationForActiveMesh.invalidFaceCount === 0 &&
    validationForActiveMesh.degenerateFaceCount === 0 &&
    validationForActiveMesh.selfIntersection.suspectedPairs === 0;
  const activeMeshValidationBlockers = validationForActiveMesh ? getMeshValidationBlockers(validationForActiveMesh) : [];
  const selectedBooleanStrategyNeedsCgal = booleanStrategy === "auto" || booleanStrategy === "robust";
  const selectedBooleanStrategyReady =
    booleanStrategy === "fast"
      ? workerReady
      : booleanStrategy === "robust"
        ? cgalReady
        : cgalReady;
  const expandedCanRun =
    expandedOperation === "implicit-preview"
      ? implicitAvailable && workerReady && !operationBusy
      : expandedOperation === "implicit-mesh"
        ? implicitAvailable && cgalReady && !operationBusy
        : expandedOperation === "cgal-validate"
          ? meshReady && cgalReady && !operationBusy
          : expandedOperation === "cgal-repair" || expandedOperation === "cgal-repair-validate" || expandedOperation === "cgal-remesh"
            ? meshReady && cgalReady && !operationBusy
        : expandedIsBoolean
          ? meshReady && selectedBooleanStrategyReady && !!booleanOperandObjectId && !operationBusy
          : expandedOperation
            ? meshReady && workerReady && !operationBusy
            : false;
  const previewResolution = Math.max(8, Math.min(220, Math.round(implicitResolution)));
  const booleanStageStyle = (state: "done" | "active" | "next" = "active"): React.CSSProperties => ({
    border: `1px solid ${state === "done" ? "#bbf7d0" : state === "active" ? "#93c5fd" : "#e2e8f0"}`,
    background: state === "done" ? "#f0fdf4" : state === "active" ? "#eff6ff" : "#f8fafc",
    borderRadius: 7,
    padding: "6px 7px",
    display: "grid",
    gap: 5,
  });
  const booleanStageHeader = (step: number, label: string, state: "done" | "active" | "next" = "active") => (
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
      <div data-testid={`${testId}-presets`} style={{ display: "grid", gap: 5, borderBottom: "1px solid #bbf7d0", paddingBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <strong style={{ fontSize: 10 }}>Presets</strong>
          <div style={{ display: "flex", gap: 5 }}>
            <button data-testid={`${testId}-save-current-preset`} type="button" onClick={onSaveOperationPreset} disabled={!canSaveOperationPreset || !onSaveOperationPreset}>Save</button>
            <button data-testid={`${testId}-manage-presets`} type="button" onClick={() => setPresetManagerOpen((open) => !open)} aria-expanded={presetManagerOpen}>Manage</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 10 }}>Recent</strong>
          <select
            data-testid={`${testId}-recent-preset`}
            value={recentPresetId}
            onChange={(event) => {
              const presetId = event.target.value;
              setRecentPresetId(presetId);
              if (presetId) void onApplySavedOperationPreset?.(presetId);
            }}
            disabled={!savedPresets.length || !onApplySavedOperationPreset}
            style={{ minWidth: 132, fontSize: 10 }}
          >
            <option value="">Choose recent...</option>
            {savedPresets.slice(0, 12).map((preset) => <option key={`${testId}-recent-preset-${preset.id}`} value={preset.id}>{preset.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 10 }}>Examples</strong>
          <button data-testid={`${testId}-preset-bunny-smooth-validate`} type="button" onClick={() => applyPreset("bunny-smooth-validate")}>Bunny</button>
          <button data-testid={`${testId}-preset-validate-armadillo`} type="button" onClick={() => applyPreset("validate-armadillo")}>Armadillo</button>
          <button data-testid={`${testId}-preset-load-dragon-medium`} type="button" onClick={() => applyPreset("load-dragon-medium")}>Dragon</button>
          <button data-testid={`${testId}-preset-decimate-3dbenchy`} type="button" onClick={() => applyPreset("decimate-3dbenchy")}>3DBenchy</button>
          <button data-testid={`${testId}-preset-sphere-minus-box`} type="button" onClick={() => applyPreset("sphere-minus-box")}>Sphere cut</button>
          <button data-testid={`${testId}-preset-benchy-cutter-boolean`} type="button" onClick={() => applyPreset("benchy-cutter-boolean")}>Boolean</button>
          <button data-testid={`${testId}-preset-implicit-sphere-mesh`} type="button" onClick={() => applyPreset("implicit-sphere-mesh")}>Implicit</button>
        </div>
        {presetManagerOpen && (
          <div data-testid={`${testId}-saved-presets`} style={{ display: "grid", gap: 4, borderTop: "1px solid #d1fae5", paddingTop: 5 }}>
            <strong style={{ fontSize: 10 }}>More workflows</strong>
            {MESH_OPERATION_PRESETS.filter((preset) => !["bunny-smooth-validate", "validate-armadillo", "load-dragon-medium", "decimate-3dbenchy", "sphere-minus-box", "benchy-cutter-boolean", "implicit-sphere-mesh"].includes(preset.id)).map((preset) => (
              <button
                key={`${testId}-preset-${preset.id}`}
                data-testid={`${testId}-preset-${preset.id}`}
                type="button"
                onClick={() => applyPreset(preset.id)}
                title={preset.description}
                style={{ justifySelf: "start", fontSize: 10 }}
              >
                {preset.label}
              </button>
            ))}
            {savedPresets.length > 0 && <strong style={{ fontSize: 10, marginTop: 2 }}>Saved</strong>}
            {savedPresets.map((preset) => (
              <div key={`${testId}-saved-preset-${preset.id}`} data-testid={`${testId}-saved-preset`} style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                <span title={preset.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preset.name}</span>
                <button data-testid={`${testId}-apply-saved-preset-${preset.id}`} type="button" onClick={() => void onApplySavedOperationPreset?.(preset.id)} disabled={!onApplySavedOperationPreset}>Use</button>
              </div>
            ))}
            {!savedPresets.length && <div style={{ color: "#64748b" }}>No saved operation presets yet.</div>}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gap: 6, fontSize: 10 }}>
        {MESH_OPERATION_GROUPS.map((group) => (
          <div
            key={`${testId}-group-${group.id}`}
            data-testid={`${testId}-group-${group.id}`}
            style={{
              border: "1px solid rgba(134, 239, 172, 0.65)",
              borderRadius: 7,
              background: "rgba(248, 255, 251, 0.68)",
              padding: "5px 5px 6px",
              display: "grid",
              gap: 3,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 6,
                alignItems: "baseline",
                padding: "0 2px 2px",
                color: "#0f3557",
                fontWeight: 900,
              }}
            >
              <span>{group.label}</span>
              <span style={{ color: "#64748b", fontSize: 9 }}>{group.operations.length}</span>
            </div>
            {group.operations.map((operation) => {
              const capability = MESH_OPERATION_ROW_BY_ID.get(operation);
              if (!capability) return null;
              const operationReady = capability.engines.some((engine) => (engine === "cgal" ? cgalReady : workerReady));
              const needsImplicit = operation === "implicit-preview" || operation === "implicit-mesh";
              const operationUsable = capability.implemented && operationReady && (!needsImplicit || implicitAvailable);
              const expanded = expandedOperation === operation;
              return (
                <div key={`${testId}-${operation}`} style={{ display: "grid", gap: 4 }}>
              <button
                data-testid={`${testId}-row-${operation}`}
                type="button"
                onClick={() => selectOperation(operation)}
                aria-expanded={expanded}
                title={
                  capability.disabledReason ??
                  (needsImplicit && !implicitAvailable ? "Open an implicit surface first" : undefined)
                }
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
                <span style={{ fontWeight: expanded ? 800 : 600 }}>{MESH_OPERATION_ROW_LABELS[operation] ?? operation}</span>
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
                  {capability.strategies.map((strategy) => {
                    const engine = strategy.engine === "auto" ? capability.defaultEngine : strategy.engine;
                    const engineReady = engine === "cgal" ? cgalReady : workerReady;
                    const enabled = strategy.implemented && engineReady;
                    return (
                      <span
                        key={`${testId}-${operation}-${strategy.id}-${engine}`}
                        title={strategy.description}
                        style={{
                          border: `1px solid ${enabled ? "#86efac" : "#e2e8f0"}`,
                          background: enabled ? "#f0fdf4" : "#f8fafc",
                          color: enabled ? "#166534" : "#64748b",
                          borderRadius: 999,
                          padding: "1px 6px",
                          fontSize: 9,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {strategy.label}
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
                  {capability.strategies.length > 1 && (
                    <div
                      data-testid={`${testId}-${operation}-strategies`}
                      style={{
                        border: "1px solid #dbeafe",
                        background: "#eff6ff",
                        borderRadius: 6,
                        padding: "5px 6px",
                        display: "grid",
                        gap: 5,
                      }}
                    >
                      <strong>Execution strategy</strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {expandedIsBoolean
                          ? ([
                              { id: "auto" as const, label: "Auto", engine: "auto" as const, implemented: booleanOperation !== "imprint", description: "Choose Robust method when validation passes; otherwise show a blocker." },
                              ...capability.strategies,
                            ]).map((strategy) => {
                              const engine = strategy.engine === "auto" ? "auto" : strategy.engine;
                              const engineReady = engine === "cgal" ? cgalReady : engine === "vtk" ? workerReady : cgalReady;
                              const enabled = strategy.implemented && engineReady;
                              const active = booleanStrategy === strategy.id;
                              return (
                                <button
                                  key={`${testId}-${operation}-strategy-${strategy.id}`}
                                  data-testid={`${testId}-boolean-strategy-${strategy.id}`}
                                  type="button"
                                  aria-pressed={active}
                                  disabled={!enabled}
                                  onClick={() => onChangeBooleanStrategy(strategy.id as MeshBooleanStrategy)}
                                  title={strategy.description}
                                  style={{
                                    border: `1px solid ${active ? "#2563eb" : enabled ? "#93c5fd" : "#e2e8f0"}`,
                                    background: active ? "#dbeafe" : enabled ? "#fff" : "#f8fafc",
                                    color: enabled ? "#0f3557" : "#64748b",
                                    borderRadius: 999,
                                    padding: "2px 7px",
                                    fontSize: 10,
                                    fontWeight: 800,
                                  }}
                                >
                                  {strategy.label}
                                  {!strategy.implemented ? " planned" : ""}
                                </button>
                              );
                            })
                          : capability.strategies.map((strategy) => {
                              const engine = strategy.engine === "auto" ? capability.defaultEngine : strategy.engine;
                              const engineReady = engine === "cgal" ? cgalReady : workerReady;
                              const enabled = strategy.implemented && engineReady;
                              return (
                                <button
                                  key={`${testId}-${operation}-strategy-${strategy.id}`}
                                  type="button"
                                  disabled={!enabled || strategy.engine !== capability.defaultEngine}
                                  title={strategy.description}
                                  style={{
                                    border: `1px solid ${enabled ? "#93c5fd" : "#e2e8f0"}`,
                                    background: strategy.engine === capability.defaultEngine ? "#dbeafe" : "#f8fafc",
                                    color: enabled ? "#0f3557" : "#64748b",
                                    borderRadius: 999,
                                    padding: "2px 7px",
                                    fontSize: 10,
                                    fontWeight: 800,
                                  }}
                                >
                                  {strategy.label}
                                  {!strategy.implemented ? " planned" : ""}
                                </button>
                              );
                            })}
                      </div>
                    </div>
                  )}
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
                  {operation === "cgal-validate" && (
                    <div
                      style={{
                        border: "1px solid #bae6fd",
                        background: "#f0f9ff",
                        color: "#0f3557",
                        borderRadius: 6,
                        padding: "5px 6px",
                        display: "grid",
                        gap: 3,
                      }}
                    >
                      <strong>Non-destructive validation</strong>
                      <span>Checks watertightness, manifold edges, connected components, winding consistency, and sampled self-intersections.</span>
                      <span>Result is recorded in Last operation; the active mesh is not changed.</span>
                    </div>
                  )}
                  {(operation === "cgal-repair" || operation === "cgal-repair-validate") && (
                    <>
                      <div
                        style={{
                          border: "1px solid #bae6fd",
                          background: "#f0f9ff",
                          color: "#0f3557",
                          borderRadius: 6,
                          padding: "5px 6px",
                          display: "grid",
                          gap: 3,
                        }}
                      >
                        <strong>{operation === "cgal-repair-validate" ? "Repair, then validate" : "Conservative repair"}</strong>
                        <span>
                          {operation === "cgal-repair-validate"
                            ? "Runs validation before and after repair, then returns a new in-memory mesh result."
                            : "Repairs topology-safe issues in the worker and returns a new in-memory mesh result."}
                        </span>
                        <span>
                          {operation === "cgal-repair-validate"
                            ? "Use the comparison card to decide whether to save or continue repairing."
                            : "Review it first; use Save edited only when you want to persist the repaired mesh."}
                        </span>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-repair-orient-faces`}
                          type="checkbox"
                          checked={repairOrientFaces}
                          onChange={(event) => onChangeRepairOrientFaces(event.target.checked)}
                        />
                        orient faces
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-repair-remove-degenerate`}
                          type="checkbox"
                          checked={repairRemoveDegenerateFaces}
                          onChange={(event) => onChangeRepairRemoveDegenerateFaces(event.target.checked)}
                        />
                        remove degenerate faces
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-repair-remove-duplicates`}
                          type="checkbox"
                          checked={repairRemoveDuplicateFaces}
                          onChange={(event) => onChangeRepairRemoveDuplicateFaces(event.target.checked)}
                        />
                        remove duplicate faces
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-repair-compact-vertices`}
                          type="checkbox"
                          checked={repairCompactVertices}
                          onChange={(event) => onChangeRepairCompactVertices(event.target.checked)}
                        />
                        compact unused vertices
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-repair-fill-holes`}
                          type="checkbox"
                          checked={repairFillSmallHoles}
                          onChange={(event) => onChangeRepairFillSmallHoles(event.target.checked)}
                        />
                        fill tiny holes
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        max hole edges
                        <input
                          data-testid={`${testId}-repair-max-hole-edges`}
                          type="number"
                          min={3}
                          max={12}
                          step={1}
                          value={repairMaxHoleEdges}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) onChangeRepairMaxHoleEdges(Math.max(3, Math.min(12, Math.round(value))));
                          }}
                          disabled={!repairFillSmallHoles}
                          style={{ width: 65 }}
                        />
                      </label>
                      <div style={{ display: "grid", gap: 3 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            data-testid={`${testId}-${operation}-output-derived`}
                            type="radio"
                            name={`${testId}-${operation}-output-mode`}
                            checked={outputMode === "derived"}
                            onChange={() => onChangeOutputMode("derived")}
                          />
                          New object
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            data-testid={`${testId}-${operation}-output-replace`}
                            type="radio"
                            name={`${testId}-${operation}-output-mode`}
                            checked={outputMode === "replace"}
                            onChange={() => onChangeOutputMode("replace")}
                          />
                          Replace
                        </label>
                      </div>
                    </>
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
                          data-testid={`${testId}-${operation}-output-derived`}
                          type="radio"
                          name={`${testId}-${operation}-output-mode`}
                          checked={outputMode === "derived"}
                          onChange={() => onChangeOutputMode("derived")}
                        />
                        New object
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-${operation}-output-replace`}
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
                        style={booleanStageStyle("active")}
                      >
                        {booleanStageHeader(1, "Operation")}
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
                        <div style={{ color: "#475569", fontSize: 10, fontWeight: 700 }}>
                          {selectedBooleanStrategyNeedsCgal
                            ? "Auto/Robust needs a recent passing Validate result before the operation runs."
                            : "Fast method expects closed watertight operands; Validate first if the result fails."}
                        </div>
                        {selectedBooleanStrategyNeedsCgal && !activeMeshHasValidation ? (
                          <div
                            data-testid={`${testId}-boolean-validation-warning`}
                            style={{
                              border: "1px solid #fcd34d",
                              background: "#fffbeb",
                              color: "#92400e",
                              borderRadius: 6,
                              padding: "4px 6px",
                              fontWeight: 700,
                            }}
                          >
                            Run Validate first to check whether A is closed, watertight, and manifold.
                          </div>
                        ) : selectedBooleanStrategyNeedsCgal && activeMeshValidationPass ? (
                          <div
                            data-testid={`${testId}-boolean-validation-warning`}
                            style={{
                              border: "1px solid #86efac",
                              background: "#f0fdf4",
                              color: "#166534",
                              borderRadius: 6,
                              padding: "4px 6px",
                              fontWeight: 700,
                            }}
                          >
                            Active mesh validation passed.
                          </div>
                        ) : selectedBooleanStrategyNeedsCgal ? (
                          <div
                            data-testid={`${testId}-boolean-validation-warning`}
                            style={{
                              border: "1px solid #fca5a5",
                              background: "#fef2f2",
                              color: "#b42318",
                              borderRadius: 6,
                              padding: "4px 6px",
                              display: "grid",
                              gap: 3,
                            }}
                          >
                            <strong>Active mesh needs repair before robust booleans.</strong>
                            <span>{activeMeshValidationBlockers.join(", ") || "validation failed"}</span>
                            <button
                              data-testid={`${testId}-boolean-repair-validate-active`}
                              type="button"
                              onClick={() => {
                                onChangeRepairOrientFaces(true);
                                onChangeRepairRemoveDegenerateFaces(true);
                                onChangeRepairRemoveDuplicateFaces(true);
                                onChangeRepairCompactVertices(true);
                                onChangeRepairFillSmallHoles(true);
                                onChangeRepairMaxHoleEdges(12);
                                onChangeOutputMode("derived");
                                setExpandedOperation("cgal-repair-validate");
                              }}
                              disabled={operationBusy}
                              style={{ justifySelf: "start", fontWeight: 800 }}
                            >
                              Repair + Validate A
                            </button>
                          </div>
                        ) : (
                          <div
                            data-testid={`${testId}-boolean-validation-warning`}
                            style={{
                              border: "1px solid #bfdbfe",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              borderRadius: 6,
                              padding: "4px 6px",
                              fontWeight: 700,
                            }}
                          >
                            Fast method selected. Robust validation gate is bypassed for this run.
                          </div>
                        )}
                      </div>
                      <div style={booleanStageStyle("active")}>
                        {booleanStageHeader(2, "Inputs A / B")}
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
                            <button
                              data-testid={`${testId}-swap-boolean-operands`}
                              type="button"
                              onClick={onSwapBooleanOperands}
                              disabled={!onSwapBooleanOperands || !booleanOperandObjectId || operationBusy}
                              style={{ justifySelf: "start", fontWeight: 800 }}
                            >
                              Swap A/B
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
                      </div>
                      <div style={booleanStageStyle("next")}>
                        {booleanStageHeader(3, "Preview", "next")}
                      {booleanOperandOptions.length > 0 && (onShowBooleanOperands || onHideBooleanOperands) && (
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button
                            data-testid={`${testId}-toggle-boolean-operands`}
                            type="button"
                            onClick={booleanOperandsVisible ? onHideBooleanOperands : onShowBooleanOperands}
                            style={{ justifySelf: "start", fontWeight: 800 }}
                          >
                            {booleanOperandsVisible ? "Hide cutter B" : "Show cutter B"}
                          </button>
                        </div>
                      )}
                        <div style={{ color: "#475569", fontSize: 10 }}>
                          Check A/B overlap before running. After the operation, A/B/result stay visible in Boolean Review.
                        </div>
                      </div>
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
                      <div style={booleanStageStyle("next")}>
                        {booleanStageHeader(4, `Run ${booleanStrategy === "fast" ? "Fast" : booleanStrategy === "robust" ? "Robust" : "Auto"} Boolean`, "next")}
                      <div style={{ display: "grid", gap: 3 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            data-testid={`${testId}-${operation}-output-derived`}
                            type="radio"
                            name={`${testId}-output-mode`}
                            checked={outputMode === "derived"}
                            onChange={() => onChangeOutputMode("derived")}
                          />
                          New object
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            data-testid={`${testId}-${operation}-output-replace`}
                            type="radio"
                            name={`${testId}-output-mode`}
                            checked={outputMode === "replace"}
                            onChange={() => onChangeOutputMode("replace")}
                          />
                          Replace
                        </label>
                      </div>
                      {booleanStatus && <div style={{ color: "#0a66c2" }}>{booleanStatus}</div>}
                      </div>
                      <div style={booleanStageStyle("next")}>
                        {booleanStageHeader(5, "Result", "next")}
                        <div style={{ color: "#475569", fontSize: 10 }}>Result appears below in Last operation, with Show result details and Send to Geometry.</div>
                      </div>
                      <div style={booleanStageStyle("next")}>
                        {booleanStageHeader(6, "Validate Result", "next")}
                        <div style={{ color: "#475569", fontSize: 10 }}>Validate the boolean output before chaining another robust operation.</div>
                      </div>
                      <div style={booleanStageStyle("next")}>
                        {booleanStageHeader(7, "Keep Result", "next")}
                        <div style={{ color: "#475569", fontSize: 10 }}>Use the Boolean Review toolbar to keep or exit the review.</div>
                      </div>
                    </>
                  )}
                  {operation === "cgal-remesh" && (
                    <>
                      <div
                        style={{
                          border: "1px solid #bae6fd",
                          background: "#f0f9ff",
                          color: "#0f3557",
                          borderRadius: 6,
                          padding: "5px 6px",
                          display: "grid",
                          gap: 3,
                        }}
                      >
                        <strong>Worker remesh</strong>
                        <span>Splits long edges toward the target length, smooths interior vertices, and keeps the result in operation history.</span>
                        <span>Use New object first; replace only after checking the result.</span>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        target edge
                        <input
                          data-testid={`${testId}-remesh-target-edge`}
                          type="number"
                          min={0.0001}
                          max={1000}
                          step={0.01}
                          value={remeshTargetEdgeLength}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) onChangeRemeshTargetEdgeLength(Math.max(0.0001, value));
                          }}
                          style={{ width: 90 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        iterations
                        <input
                          data-testid={`${testId}-remesh-iterations`}
                          type="number"
                          min={0}
                          max={6}
                          step={1}
                          value={remeshIterations}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) onChangeRemeshIterations(Math.max(0, Math.min(6, Math.round(value))));
                          }}
                          style={{ width: 70 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          data-testid={`${testId}-remesh-preserve-sharp`}
                          type="checkbox"
                          checked={remeshPreserveSharpEdges}
                          onChange={(event) => onChangeRemeshPreserveSharpEdges(event.target.checked)}
                        />
                        preserve sharp/boundary edges
                      </label>
                      <div style={{ display: "grid", gap: 3 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            data-testid={`${testId}-remesh-output-derived`}
                            type="radio"
                            name={`${testId}-remesh-output-mode`}
                            checked={outputMode === "derived"}
                            onChange={() => onChangeOutputMode("derived")}
                          />
                          New object
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            data-testid={`${testId}-remesh-output-replace`}
                            type="radio"
                            name={`${testId}-remesh-output-mode`}
                            checked={outputMode === "replace"}
                            onChange={() => onChangeOutputMode("replace")}
                          />
                          Replace
                        </label>
                      </div>
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
                      <div>Robust backend: {cgalStatusText}</div>
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
                    {operationBusy ? "Working..." : getMeshOperationRowRunLabel(expandedOperation)}
                  </button>
                </div>
              )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div
        ref={resultDetailsRef}
        data-testid={`${testId}-last-result`}
        tabIndex={-1}
        aria-label="Mesh operation result details"
        style={{
          borderTop: "1px solid #bbf7d0",
          outline: resultDetailsFocused ? "2px solid #2563eb" : "none",
          outlineOffset: 2,
          borderRadius: resultDetailsFocused ? 7 : 0,
          paddingTop: 5,
          display: "grid",
          gap: 3,
          fontSize: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong>Last operation</strong>
          <strong style={{ color: resultStatusColor }}>{lastResult ? lastResult.status : "none"}</strong>
        </div>
        {lastResult ? (
          <>
            <div>
              {lastResult.label} · {formatMeshOperationBackend(lastResult)} · {formatMeshOperationDuration(lastResult.durationMs)}
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
            {lastResult.validation &&
              (lastResult.validationContext === "boolean-result" ? (
                <MeshBooleanValidationCard
                  validation={lastResult.validation}
                  onRepairResult={onRepairResult}
                  onUseResultAsBooleanA={onUseResultAsBooleanA}
                  onUseResultAsBooleanB={onUseResultAsBooleanB}
                  onShowBooleanResultProblems={onShowBooleanResultProblems}
                  onOpenFullBooleanValidation={onOpenFullBooleanValidation}
                />
              ) : (
                <MeshValidationCard validation={lastResult.validation} />
              ))}
            {lastResult.repair && <MeshRepairCard repair={lastResult.repair} />}
            {lastResult.repairValidation && <MeshRepairValidationComparisonCard comparison={lastResult.repairValidation} />}
            {lastResult.remesh && <MeshRemeshCard remesh={lastResult.remesh} />}
            {lastResult.boolean && (
              <MeshBooleanCard
                booleanSummary={lastResult.boolean}
                sourceIds={lastResult.sourceIds}
                resultLabel={lastResult.afterFaces == null ? lastResult.label : `${lastResult.label} (${lastResult.afterFaces.toLocaleString()} triangles)`}
                review={lastResult.booleanReview}
                entityControls={booleanReviewEntityControls}
              />
            )}
            {!!lastResult.diagnostics?.length && <div>Details: {lastResult.diagnostics.join("; ")}</div>}
            {lastResult.warnings.length > 0 && <div style={{ color: "#b45309" }}>Warnings: {lastResult.warnings.join("; ")}</div>}
            {lastResult.errors.length > 0 && <div style={{ color: "#b42318" }}>Errors: {lastResult.errors.join("; ")}</div>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              <button data-testid={`${testId}-show-result-details`} type="button" onClick={showResultDetails} disabled={!hasUsableResult}>
                Show result details
              </button>
              <button
                data-testid={`${testId}-send-to-geometry`}
                type="button"
                onClick={onSendToGeometry}
                disabled={!hasUsableResult || !canSendToGeometry}
              >
                Send to Geometry
              </button>
              <button
                data-testid={`${testId}-open-result-in-geometry`}
                type="button"
                onClick={onOpenResultInGeometry ?? onSendToGeometry}
                disabled={!hasUsableResult || !canSendToGeometry}
              >
                Open result in Geometry
              </button>
              {lastResult.boolean && (
                <button
                  data-testid={`${testId}-validate-result`}
                  type="button"
                  onClick={() => {
                    void (onValidateResult ?? onValidate)();
                  }}
                  disabled={!hasUsableResult || operationBusy || !cgalReady}
                >
                  Validate result
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: "#64748b" }}>Click any row to set parameters, then Run.</div>
        )}
      </div>
      <div data-testid={`${testId}-history`} style={{ borderTop: "1px solid #bbf7d0", paddingTop: 5, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", fontSize: 10 }}>
        <button data-testid={`${testId}-undo-last-operation`} type="button" onClick={onUndoLastOperation} disabled={!canUndoLastOperation} title="Undo the latest operation-backed mesh result.">Undo</button>
        <span style={{ color: "#64748b" }}>Detailed operation history is in Inspector → History.</span>
      </div>
    </div>
  );
};
