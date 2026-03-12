import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  WorkbookSnapshotSlot,
  WorkbookTemplateSpec,
  WorkbookProblemPack,
} from "../workbook/workbookModel";
import { WORKBOOK_STAGE_ORDER } from "../workbook/workbookModel";
import { WORKBOOK_OPERATOR_CATALOG } from "../workbook/operatorRegistry";
import { bakeGraphSurface, bakeParamSurface, bakeWeierstrassSurface } from "../math/bakeSurface";
import { computeMeanEdgeLength } from "../mesh/meshOps";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

type WorkbookPanelProps = {
  workbooks: Workbook[];
  activeWorkbookId: string | null;
  activeStageId: WorkbookStageId;
  computeStatusById: Record<string, "ok" | "stale" | "failed">;
  workbookStatus: "ok" | "stale" | "failed";
  paramCatalog: WorkbookParamDef[];
  onSelectWorkbook: (id: string) => void;
  onCreateWorkbook: () => void;
  onCreateWorkbookFromTemplate: (templateId: string) => void;
  onCreateWorkbooksFromPack: (packId: string) => void;
  onDuplicateWorkbook: (id: string) => void;
  onDeleteWorkbook: (id: string) => void;
  onRenameWorkbook: (id: string, title: string) => void;
  onSelectStage: (id: WorkbookStageId) => void;
  onAddBlock: (stageId: WorkbookStageId, type: WorkbookBlockType) => void;
  onUpdateBlock: (stageId: WorkbookStageId, blockId: string, patch: Partial<WorkbookBlock>) => void;
  onRemoveBlock: (stageId: WorkbookStageId, blockId: string) => void;
  onMoveBlock: (stageId: WorkbookStageId, blockId: string, dir: -1 | 1) => void;
  onCaptureVisualize: (stageId: WorkbookStageId, blockId: string, slot: WorkbookSnapshotSlot) => void;
  onApplyVisualize: (snapshot: WorkbookViewSnapshot, blockId?: string, slot?: WorkbookSnapshotSlot) => void;
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
  onExportMarkdown: () => void;
  onExportPdf: () => void;
  onExportReplayHtml: () => void;
  onImportJson: (raw: string) => void;
  onSaveWorkbook: () => void;
  onSaveWorkbookAs: () => void;
  bundleAssetMode: "embedded" | "linked";
  onChangeBundleAssetMode: (mode: "embedded" | "linked") => void;
  workbookDirty: boolean;
  lastManualSaveAt: number | null;
  autosaveAt: number | null;
  autosaveIntervalSec: number;
  snapshotAt: number | null;
  snapshotHistory: Array<{ id: string; name: string; savedAt: number }>;
  selectedSnapshotId: string | null;
  onSelectSnapshot: (id: string) => void;
  onRestoreAutosave: () => void;
  onCreateSnapshot: (name?: string) => void;
  onRestoreSnapshot: () => void;
  onRestoreSnapshotById: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  readOnly: boolean;
  currentDatasetRef: string;
  cameraReady: boolean;
  ghostOverlaysEnabled: boolean;
  onToggleGhostOverlays: (enabled: boolean) => void;
  templates: WorkbookTemplateSpec[];
  problemPacks: WorkbookProblemPack[];
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

const WORKBOOK_OPERATOR_BY_ID = new Map(
  WORKBOOK_OPERATOR_CATALOG.map((op) => [op.id, op])
);

type SnapshotMeshStats = {
  vertexCount: number;
  faceCount: number;
  area: number;
  meanEdgeLength: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  bboxDiag: number;
};

type SnapshotStatsResult = {
  stats?: SnapshotMeshStats;
  error?: string;
};

const formatNum = (value: number | null | undefined, digits = 3) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
};

const computeMeshStats = (mesh: SurfaceMeshData): SnapshotMeshStats => {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const vertexCount = Math.floor(positions.length / 3);
  const faceCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    const x = positions[idx];
    const y = positions[idx + 1];
    const z = positions[idx + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const bboxMin: [number, number, number] = [minX, minY, minZ];
  const bboxMax: [number, number, number] = [maxX, maxY, maxZ];
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const bboxDiag = Math.sqrt(dx * dx + dy * dy + dz * dz);

  let area = 0;
  const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  for (let t = 0; t < triCount; t++) {
    const a = indices ? Number(indices[t * 3]) : t * 3;
    const b = indices ? Number(indices[t * 3 + 1]) : t * 3 + 1;
    const c = indices ? Number(indices[t * 3 + 2]) : t * 3 + 2;
    if (a < 0 || b < 0 || c < 0 || a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const cz = positions[c * 3 + 2];
    if (
      !Number.isFinite(ax) ||
      !Number.isFinite(ay) ||
      !Number.isFinite(az) ||
      !Number.isFinite(bx) ||
      !Number.isFinite(by) ||
      !Number.isFinite(bz) ||
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      !Number.isFinite(cz)
    ) {
      continue;
    }
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const triArea = 0.5 * Math.hypot(crossX, crossY, crossZ);
    if (Number.isFinite(triArea)) area += triArea;
  }

  const meanEdgeLength = computeMeanEdgeLength(mesh).meanEdgeLength ?? 0;

  return {
    vertexCount,
    faceCount,
    area,
    meanEdgeLength,
    bboxMin,
    bboxMax,
    bboxDiag,
  };
};

const buildMeshFromSnapshot = (snapshot: WorkbookViewSnapshot): { mesh?: SurfaceMeshData; error?: string } => {
  if (snapshot.viewerKind === "graph") {
    if (!snapshot.surfaceId) return { error: "Missing graph surface id." };
    const domain = snapshot.graphDomain ?? { xSpan: 2, ySpan: 2 };
    const resolution = Math.max(20, Math.round(snapshot.graphResolution ?? 80));
    const result = bakeGraphSurface({
      surfaceId: snapshot.surfaceId,
      graphExpr: snapshot.graphExpr ?? "x*x - y*y",
      domain,
      resolution,
      label: `Graph ${snapshot.surfaceId}`,
    });
    if ("error" in result) return { error: result.error };
    return { mesh: result.mesh };
  }
  if (snapshot.viewerKind === "param") {
    if (!snapshot.paramId) return { error: "Missing param surface id." };
    const domain = snapshot.paramDomain ?? { uMin: -1, uMax: 1, vMin: -1, vMax: 1 };
    const resolution = Math.max(20, Math.round(snapshot.paramResolution ?? 120));
    const result = bakeParamSurface({
      surfaceId: snapshot.paramId,
      domain,
      resolution,
      label: `Param ${snapshot.paramId}`,
      customX: snapshot.paramXExpr,
      customY: snapshot.paramYExpr,
      customZ: snapshot.paramZExpr,
    });
    if ("error" in result) return { error: result.error };
    return { mesh: result.mesh };
  }
  if (snapshot.viewerKind === "weierstrass") {
    const domain = snapshot.weierstrassDomain ?? { uMin: -1, uMax: 1, vMin: -1, vMax: 1 };
    const resolution = Math.max(20, Math.round(snapshot.weierstrassResolution ?? 180));
    const result = bakeWeierstrassSurface({
      gExpr: snapshot.weierstrassGExpr ?? "z",
      phiExpr: snapshot.weierstrassPhiExpr ?? "1",
      domain,
      resolution,
      label: "Weierstrass",
      recenterRescale: snapshot.weierstrassRecenter ?? false,
    });
    if ("error" in result) return { error: result.error };
    return { mesh: result.mesh };
  }
  return { error: "Diff stats are available for graph/param/Weierstrass snapshots only." };
};

const buildSnapshotStats = (snapshot: WorkbookViewSnapshot | null): SnapshotStatsResult => {
  if (!snapshot) return { error: "Missing snapshot." };
  const built = buildMeshFromSnapshot(snapshot);
  if (built.error || !built.mesh) return { error: built.error ?? "No mesh data." };
  return { stats: computeMeshStats(built.mesh) };
};

const DIFF_FIELDS: Array<{ key: keyof WorkbookViewSnapshot; label: string }> = [
  { key: "datasetRef", label: "Dataset" },
  { key: "viewerKind", label: "Viewer" },
  { key: "surfaceId", label: "Surface" },
  { key: "paramId", label: "Param surface" },
  { key: "graphExpr", label: "Graph expr" },
  { key: "implicitExpr", label: "Implicit expr" },
  { key: "paramXExpr", label: "Param X" },
  { key: "paramYExpr", label: "Param Y" },
  { key: "paramZExpr", label: "Param Z" },
  { key: "weierstrassGExpr", label: "Weierstrass g" },
  { key: "weierstrassPhiExpr", label: "Weierstrass φ" },
  { key: "graphDomain", label: "Graph domain" },
  { key: "implicitDomain", label: "Implicit domain" },
  { key: "paramDomain", label: "Param domain" },
  { key: "weierstrassDomain", label: "Weierstrass domain" },
  { key: "graphResolution", label: "Graph resolution" },
  { key: "implicitResolution", label: "Implicit resolution" },
  { key: "paramResolution", label: "Param resolution" },
  { key: "weierstrassResolution", label: "Weierstrass resolution" },
  { key: "colorMode", label: "Color mode" },
  { key: "colorPalette", label: "Palette" },
  { key: "showWireframe", label: "Wireframe" },
  { key: "showContours", label: "Contours" },
  { key: "showChartGrid", label: "Chart grid" },
  { key: "probeEnabled", label: "Probe" },
  { key: "showPrincipalDirections", label: "Principal dirs" },
  { key: "showPrincipalGlyphs", label: "Principal glyphs" },
  { key: "showPrincipalLines", label: "Principal lines" },
  { key: "showCurvatureLines", label: "Curvature lines" },
  { key: "showRidges", label: "Ridges" },
  { key: "showValleys", label: "Valleys" },
  { key: "showGaussMap", label: "Gauss map" },
  { key: "showBoundingBox", label: "Bounding box" },
  { key: "showPlanes", label: "Planes" },
];

const formatSnapshotValue = (key: keyof WorkbookViewSnapshot, value: unknown) => {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") return value;
  if (key === "graphDomain" || key === "implicitDomain") {
    const v = value as { xSpan: number; ySpan: number };
    return `xSpan=${formatNum(v?.xSpan)} · ySpan=${formatNum(v?.ySpan)}`;
  }
  if (key === "paramDomain" || key === "weierstrassDomain") {
    const v = value as { uMin: number; uMax: number; vMin: number; vMax: number };
    return `u=[${formatNum(v?.uMin)}, ${formatNum(v?.uMax)}], v=[${formatNum(v?.vMin)}, ${formatNum(v?.vMax)}]`;
  }
  return JSON.stringify(value);
};

const VisualizeDiffPanel: React.FC<{
  snapA: WorkbookViewSnapshot | null;
  snapB: WorkbookViewSnapshot | null;
}> = ({ snapA, snapB }) => {
  const diffRows = useMemo(() => {
    if (!snapA || !snapB) return [];
    const rows: Array<{ label: string; a: string; b: string }> = [];
    for (const field of DIFF_FIELDS) {
      const aVal = (snapA as any)?.[field.key];
      const bVal = (snapB as any)?.[field.key];
      if (aVal == null && bVal == null) continue;
      const aStr = formatSnapshotValue(field.key, aVal);
      const bStr = formatSnapshotValue(field.key, bVal);
      const same =
        typeof aVal === "object" || typeof bVal === "object" ? JSON.stringify(aVal) === JSON.stringify(bVal) : aVal === bVal;
      if (same) continue;
      rows.push({ label: field.label, a: aStr, b: bStr });
    }
    return rows;
  }, [snapA, snapB]);

  const statsA = useMemo(() => buildSnapshotStats(snapA), [snapA]);
  const statsB = useMemo(() => buildSnapshotStats(snapB), [snapB]);

  const statRow = (label: string, a?: number, b?: number) => {
    const delta = a != null && b != null ? b - a : null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(88px, 120px) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
        <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{label}</div>
        <div style={{ overflowWrap: "anywhere" }}>{formatNum(a)}</div>
        <div style={{ overflowWrap: "anywhere" }}>{formatNum(b)}</div>
        <div style={{ overflowWrap: "anywhere" }}>{delta == null ? "—" : formatNum(delta)}</div>
      </div>
    );
  };

  if (!snapA || !snapB) {
    return (
      <div style={{ fontSize: 11, opacity: 0.7 }}>
        Capture both A and B to compute a diff.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700 }}>Diff (A → B)</div>
      {diffRows.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(88px, 120px) minmax(0, 1fr) minmax(0, 1fr)", gap: 6, fontSize: 11 }}>
          {diffRows.map((row, idx) => (
            <React.Fragment key={`${row.label}-${idx}`}>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{row.label}</div>
              <div style={{ overflowWrap: "anywhere" }}>{row.a}</div>
              <div style={{ overflowWrap: "anywhere" }}>{row.b}</div>
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, opacity: 0.7 }}>No visible setting changes.</div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>Geometry stats</div>
      {(statsA.error || statsB.error) && (
        <div style={{ fontSize: 11, color: "#9a3412" }}>
          {statsA.error || statsB.error}
        </div>
      )}
      {statsA.stats && statsB.stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(88px, 120px) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 6, fontWeight: 700 }}>
            <div>Metric</div>
            <div>A</div>
            <div>B</div>
            <div>Δ</div>
          </div>
          {statRow("Area", statsA.stats.area, statsB.stats.area)}
          {statRow("Mean edge", statsA.stats.meanEdgeLength, statsB.stats.meanEdgeLength)}
          {statRow("BBox diag", statsA.stats.bboxDiag, statsB.stats.bboxDiag)}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(88px, 120px) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Vertices</div>
            <div>{statsA.stats.vertexCount}</div>
            <div>{statsB.stats.vertexCount}</div>
            <div>{statsB.stats.vertexCount - statsA.stats.vertexCount}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(88px, 120px) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Faces</div>
            <div>{statsA.stats.faceCount}</div>
            <div>{statsB.stats.faceCount}</div>
            <div>{statsB.stats.faceCount - statsA.stats.faceCount}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WorkbookPanel: React.FC<WorkbookPanelProps> = ({
  workbooks,
  activeWorkbookId,
  activeStageId,
  onSelectWorkbook,
  onCreateWorkbook,
  onCreateWorkbookFromTemplate,
  onCreateWorkbooksFromPack,
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
  onExportMarkdown,
  onExportPdf,
  onExportReplayHtml,
  onImportJson,
  onSaveWorkbook,
  onSaveWorkbookAs,
  bundleAssetMode,
  onChangeBundleAssetMode,
  workbookDirty,
  lastManualSaveAt,
  autosaveAt,
  autosaveIntervalSec,
  snapshotAt,
  snapshotHistory,
  selectedSnapshotId,
  onSelectSnapshot,
  onRestoreAutosave,
  onCreateSnapshot,
  onRestoreSnapshot,
  onRestoreSnapshotById,
  onDeleteSnapshot,
  readOnly,
  currentDatasetRef,
  cameraReady,
  computeStatusById,
  workbookStatus,
  paramCatalog,
  ghostOverlaysEnabled,
  onToggleGhostOverlays,
  templates,
  problemPacks,
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
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryTags, setLibraryTags] = useState<string[]>([]);
  const [workspacePage, setWorkspacePage] = useState<"scene" | "datasets" | "analysis">("scene");
  const [snapshotName, setSnapshotName] = useState("");
  const issueCursorRef = useRef(0);

  const getBlockStatus = (block: WorkbookBlock): { state: "ok" | "stale" | "fail" | "pending"; label: string } => {
    if (block.type === "compute") {
      const derived = computeStatusById[block.id];
      const status = derived ?? block.compute?.lastRun?.status ?? block.compute?.status ?? "idle";
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
  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const allLibraryTags = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    problemPacks.forEach((p) => p.tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [templates, problemPacks]);
  const matchesLibrary = useCallback(
    (title: string, description: string, tags: string[]) => {
      const q = libraryQuery.trim().toLowerCase();
      if (q) {
        const hay = `${title} ${description} ${tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!libraryTags.length) return true;
      return libraryTags.some((tag) => tags.includes(tag));
    },
    [libraryQuery, libraryTags]
  );
  const filteredTemplates = useMemo(
    () => templates.filter((t) => matchesLibrary(t.title, t.description, t.tags)),
    [templates, matchesLibrary]
  );
  const filteredPacks = useMemo(
    () => problemPacks.filter((p) => matchesLibrary(p.title, p.description, p.tags)),
    [problemPacks, matchesLibrary]
  );
  const hasStale = useMemo(
    () => Object.values(computeStatusById).some((status) => status === "stale"),
    [computeStatusById]
  );
  const hasComputeBlocks = useMemo(
    () => Object.keys(computeStatusById).length > 0,
    [computeStatusById]
  );
  const workspaceSceneItems = useMemo(() => {
    if (!activeWorkbook) return [];
    const items: Array<{ stageTitle: string; title: string }> = [];
    for (const stage of activeWorkbook.stages) {
      for (const block of stage.blocks) {
        if (block.type !== "visualize") continue;
        items.push({
          stageTitle: stage.title,
          title: block.title || "View",
        });
      }
    }
    return items;
  }, [activeWorkbook]);
  const workspaceDatasetItems = useMemo(() => {
    if (!activeWorkbook) return [];
    const refs = new Set<string>();
    for (const stage of activeWorkbook.stages) {
      for (const block of stage.blocks) {
        if (block.type === "visualize") {
          const snapA = block.visualize?.snapshotA ?? block.visualize?.snapshot;
          const snapB = block.visualize?.snapshotB;
          if (snapA?.datasetRef) refs.add(snapA.datasetRef);
          if (snapB?.datasetRef) refs.add(snapB.datasetRef);
        }
        if (block.type === "compute" && block.compute?.datasetRef) refs.add(block.compute.datasetRef);
      }
    }
    if (currentDatasetRef) refs.add(currentDatasetRef);
    return Array.from(refs);
  }, [activeWorkbook, currentDatasetRef]);
  const workspaceAnalysisItems = useMemo(() => {
    if (!activeWorkbook) return [];
    const overlays = new Set<string>();
    for (const stage of activeWorkbook.stages) {
      for (const block of stage.blocks) {
        if (block.type !== "compute") continue;
        if (block.compute?.outputs?.geodesicHeat?.polylines?.length) overlays.add("geodesic heat");
        if (block.compute?.outputs?.curveOverlay?.polylines?.length) overlays.add("curve overlay");
        if (block.compute?.outputs?.directionOverlay?.polylines?.length) overlays.add("direction overlay");
        if (block.compute?.outputs?.selectionMask?.count) overlays.add("selection mask");
        if (block.compute?.outputs?.geodesicPath?.indices?.length) overlays.add("geodesic path");
      }
    }
    return Array.from(overlays);
  }, [activeWorkbook]);

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

  const resolveVisualizeSnapshot = (block: WorkbookBlock, slot: WorkbookSnapshotSlot) => {
    if (block.type !== "visualize") return null;
    if (slot === "A") return block.visualize?.snapshotA ?? block.visualize?.snapshot ?? null;
    return block.visualize?.snapshotB ?? null;
  };

  const handleTogglePlay = (stageId: WorkbookStageId, block: WorkbookBlock) => {
    if (readOnly) return;
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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <h2 style={styles.h2}>Workbook</h2>
        <div style={{ fontSize: 11, opacity: 0.85, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ overflowWrap: "anywhere" }}>{activeWorkbook?.title ?? "Untitled workbook"}</span>
          <span
            aria-label={workbookDirty ? "Unsaved changes" : "Saved"}
            title={workbookDirty ? "Unsaved changes" : "Saved"}
            style={{ color: workbookDirty ? "#0f172a" : "#94a3b8", fontSize: 12, lineHeight: 1 }}
          >
            ●
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap", minWidth: 0 }}>
        <div style={{ fontSize: 11, opacity: 0.75, overflowWrap: "anywhere" }}>
          Current view: <strong>{currentDatasetRef}</strong>
          {cameraReady ? " · camera ready" : " · camera pending"}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={ghostOverlaysEnabled}
            onChange={(e) => onToggleGhostOverlays(e.target.checked)}
          />
          Ghost overlays
        </label>
      </div>

      <details style={{ marginBottom: 10 }} open>
        <summary style={{ fontSize: 11, fontWeight: 700, cursor: "pointer" }}>File</summary>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={onCreateWorkbook} disabled={readOnly} style={{ padding: "4px 8px" }}>
              New Workbook
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={readOnly}
              style={{ padding: "4px 8px" }}
            >
              Open...
            </button>
            <button type="button" onClick={onSaveWorkbook} disabled={readOnly} style={{ padding: "4px 8px" }}>
              Save
            </button>
            <button type="button" onClick={onSaveWorkbookAs} disabled={readOnly} style={{ padding: "4px 8px" }}>
              Save As...
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              Recent
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  onSelectWorkbook(id);
                  e.currentTarget.value = "";
                }}
                style={{ fontSize: 11 }}
              >
                <option value="">Select...</option>
                {[...workbooks]
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .slice(0, 10)
                  .map((wb) => (
                    <option key={wb.id} value={wb.id}>
                      {wb.title}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" onClick={onExportJson} style={{ padding: "4px 8px" }}>
              Export...
            </button>
            <button type="button" onClick={onExportReplayHtml} style={{ padding: "4px 8px" }}>
              Share bundle...
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={onExportMarkdown} style={{ padding: "2px 8px", fontSize: 11 }}>
              Export Markdown
            </button>
            <button type="button" onClick={onExportPdf} style={{ padding: "2px 8px", fontSize: 11 }}>
              Export PDF
            </button>
            <button type="button" onClick={onExportReplayHtml} style={{ padding: "2px 8px", fontSize: 11 }}>
              Export Replay HTML
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span>Assets:</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                name="wb-assets-mode"
                checked={bundleAssetMode === "embedded"}
                onChange={() => onChangeBundleAssetMode("embedded")}
                disabled={readOnly}
              />
              Embedded
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                name="wb-assets-mode"
                checked={bundleAssetMode === "linked"}
                onChange={() => onChangeBundleAssetMode("linked")}
                disabled={readOnly}
              />
              Linked
            </label>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".math3d,.json,application/json"
            disabled={readOnly}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </details>

      <div
        style={{
          marginBottom: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 8,
          background: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700 }}>Quick actions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onRestoreAutosave}
            disabled={readOnly || !autosaveAt}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Restore last autosave
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="Snapshot name"
            disabled={readOnly}
            style={{ minWidth: 180, padding: "2px 6px", fontSize: 11 }}
          />
          <button
            type="button"
            onClick={() => {
              onCreateSnapshot(snapshotName.trim() || undefined);
              setSnapshotName("");
            }}
            disabled={readOnly}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Snapshot
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            Switch
            <select
              value={selectedSnapshotId ?? ""}
              onChange={(e) => onSelectSnapshot(e.target.value)}
              disabled={readOnly || !snapshotHistory.length}
              style={{ fontSize: 11, minWidth: 180 }}
            >
              <option value="">Select snapshot...</option>
              {snapshotHistory.map((snap) => (
                <option key={snap.id} value={snap.id}>
                  {snap.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              if (selectedSnapshotId) {
                onRestoreSnapshotById(selectedSnapshotId);
                return;
              }
              onRestoreSnapshot();
            }}
            disabled={readOnly || (!snapshotAt && !selectedSnapshotId)}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Restore selected
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedSnapshotId) return;
              onDeleteSnapshot(selectedSnapshotId);
            }}
            disabled={readOnly || !selectedSnapshotId}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Delete snapshot
          </button>
        </div>
        <div style={{ fontSize: 10, opacity: 0.75 }}>
          Last save: {lastManualSaveAt ? new Date(lastManualSaveAt).toLocaleString() : "not saved yet"}.
          {" "}
          {workbookDirty ? "Unsaved changes." : "Saved."}
        </div>
        <div style={{ fontSize: 10, opacity: 0.75 }}>
          Autosave every {autosaveIntervalSec}s and on meaningful changes.
          {" "}
          Last autosave: {autosaveAt ? new Date(autosaveAt).toLocaleString() : "none"}.
        </div>
        <div style={{ fontSize: 10, opacity: 0.75 }}>
          Snapshots: {snapshotHistory.length}.
          {" "}
          Latest: {snapshotAt ? new Date(snapshotAt).toLocaleString() : "none"}.
        </div>
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
            disabled={readOnly || activeStageId !== "compute" || !hasComputeBlocks}
            style={{ padding: "2px 8px", fontSize: 11 }}
          >
            Run stage
          </button>
          <button
            type="button"
            onClick={onRunAllStale}
            disabled={readOnly || !hasStale}
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
            disabled={readOnly}
            style={{ padding: "4px 6px", fontSize: 12 }}
          />
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => activeWorkbook && onDuplicateWorkbook(activeWorkbook.id)}
            disabled={readOnly || !activeWorkbook}
            style={{ padding: "4px 8px" }}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => activeWorkbook && onDeleteWorkbook(activeWorkbook.id)}
            disabled={readOnly || !activeWorkbook}
            style={{ padding: "4px 8px" }}
          >
            Delete
          </button>
        </div>
      </div>

      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          Templates & problem packs
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <input
            type="text"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder="Search templates and packs..."
            style={{ padding: "4px 6px", fontSize: 12 }}
          />
          {allLibraryTags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {allLibraryTags.map((tag) => {
                const active = libraryTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setLibraryTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      );
                    }}
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid " + (active ? "#1f3556" : "#e2e8f0"),
                      background: active ? "#e6f0ff" : "#fff",
                      color: active ? "#1f3556" : "#475569",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {libraryTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLibraryTags([])}
                  style={{ padding: "2px 8px", fontSize: 10 }}
                >
                  Clear tags
                </button>
              )}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700 }}>Templates</div>
          {filteredTemplates.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredTemplates.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 8,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{t.title}</div>
                    <button
                      type="button"
                      onClick={() => onCreateWorkbookFromTemplate(t.id)}
                      disabled={readOnly}
                      style={{ padding: "2px 8px", fontSize: 11 }}
                    >
                      Use template
                    </button>
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{t.description}</div>
                  {t.requiredOperators?.length ? (
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                      Required operators: {t.requiredOperators.join(", ")}
                    </div>
                  ) : null}
                  {t.suggestedStages?.length ? (
                    <div style={{ fontSize: 10, opacity: 0.7 }}>
                      Suggested stages: {t.suggestedStages.join(", ")}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {t.tags.map((tag) => (
                      <span
                        key={`${t.id}-${tag}`}
                        style={{
                          padding: "1px 6px",
                          borderRadius: 999,
                          background: "#f1f5f9",
                          fontSize: 10,
                          color: "#334155",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.65 }}>No templates match the filter.</div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6 }}>Problem packs</div>
          {filteredPacks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredPacks.map((pack) => {
                const packTemplates = pack.templateIds
                  .map((id) => templateById.get(id))
                  .filter(Boolean) as WorkbookTemplateSpec[];
                return (
                  <div
                    key={pack.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 8,
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{pack.title}</div>
                      <button
                        type="button"
                        onClick={() => onCreateWorkbooksFromPack(pack.id)}
                        disabled={readOnly}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        Create all templates
                      </button>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>{pack.description}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                      Topic: {pack.topic} · Difficulty: {pack.difficulty}
                    </div>
                    {pack.prerequisites.length > 0 && (
                      <div style={{ fontSize: 10, opacity: 0.7 }}>
                        Prerequisites: {pack.prerequisites.join(", ")}
                      </div>
                    )}
                    <div style={{ fontSize: 10, opacity: 0.7 }}>
                      Required operators: {pack.requiredOperators.join(", ")}
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>
                      Suggested stages: {pack.suggestedStages.join(", ")}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {pack.tags.map((tag) => (
                        <span
                          key={`${pack.id}-${tag}`}
                          style={{
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "#f1f5f9",
                            fontSize: 10,
                            color: "#334155",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {packTemplates.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                        {packTemplates.map((t) => (
                          <div
                            key={`${pack.id}-${t.id}`}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                          >
                            <div style={{ fontSize: 11 }}>{t.title}</div>
                            <button
                              type="button"
                              onClick={() => onCreateWorkbookFromTemplate(t.id)}
                              disabled={readOnly}
                              style={{ padding: "2px 8px", fontSize: 11 }}
                            >
                              Use template
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.65 }}>No problem packs match the filter.</div>
          )}
        </div>
      </details>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Pages</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {([
            { id: "scene" as const, label: "Scene" },
            { id: "datasets" as const, label: "Datasets" },
            { id: "analysis" as const, label: "Analysis" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWorkspacePage(tab.id)}
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                border: "1px solid " + (workspacePage === tab.id ? "#1f3556" : "#d8d8d8"),
                background: workspacePage === tab.id ? "#e6f0ff" : "#fff",
                color: workspacePage === tab.id ? "#1f3556" : "#334155",
                fontSize: 11,
                fontWeight: 700,
              }}
              aria-pressed={workspacePage === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 8,
            background: "#fff",
            fontSize: 11,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Workspace tree</div>
          {workspacePage === "scene" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600 }}>Scenes</div>
              {workspaceSceneItems.length ? (
                workspaceSceneItems.map((item, idx) => (
                  <div key={`${item.stageTitle}-${item.title}-${idx}`}>
                    {idx + 1}. {item.title} <span style={{ opacity: 0.65 }}>({item.stageTitle})</span>
                  </div>
                ))
              ) : (
                <div style={{ opacity: 0.65 }}>No scene blocks yet.</div>
              )}
            </div>
          )}
          {workspacePage === "datasets" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600 }}>Datasets</div>
              {workspaceDatasetItems.length ? (
                workspaceDatasetItems.map((ref) => <div key={ref}>{ref}</div>)
              ) : (
                <div style={{ opacity: 0.65 }}>No datasets captured yet.</div>
              )}
            </div>
          )}
          {workspacePage === "analysis" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600 }}>Overlays</div>
              {workspaceAnalysisItems.length ? (
                workspaceAnalysisItems.map((item) => <div key={item}>{item}</div>)
              ) : (
                <div style={{ opacity: 0.65 }}>No analysis overlays yet.</div>
              )}
            </div>
          )}
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
                  block.type === "visualize" &&
                  (resolveVisualizeSnapshot(block, "A") || resolveVisualizeSnapshot(block, "B"))
                    ? "pointer"
                    : "default",
              }}
              onClick={(e) => {
                if (block.type !== "visualize") return;
                const snapA = resolveVisualizeSnapshot(block, "A");
                const snapB = resolveVisualizeSnapshot(block, "B");
                const snap = snapA ?? snapB;
                if (!snap) return;
                const slot = snapA ? "A" : "B";
                const tag = (e.target as HTMLElement).tagName;
                if (["INPUT", "TEXTAREA", "BUTTON", "SELECT", "OPTION", "A"].includes(tag)) return;
                onApplyVisualize(snap, block.id, slot);
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#111827" }}>
                  {BLOCK_TYPE_LABELS[block.type]}
                  {block.type === "compute" && block.compute?.lastRun?.cacheHit && (
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "#ecfeff",
                        color: "#0e7490",
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                      }}
                      title={`Cached output used${block.compute?.lastRun?.inputHash ? ` (input ${block.compute.lastRun.inputHash})` : ""}`}
                    >
                      CACHE
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => onMoveBlock(activeStageId, block.id, -1)}
                    disabled={readOnly || idx === 0}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveBlock(activeStageId, block.id, 1)}
                    disabled={readOnly || idx === activeStage.blocks.length - 1}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveBlock(activeStageId, block.id)}
                    disabled={readOnly}
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
                disabled={readOnly}
                style={{ width: "100%", marginBottom: 8, padding: "4px 6px", fontSize: 12 }}
              />

              {block.type === "text" && (
                <textarea
                  value={block.text ?? ""}
                  onChange={(e) => onUpdateBlock(activeStageId, block.id, { text: e.target.value })}
                  rows={4}
                  placeholder="Markdown text..."
                  disabled={readOnly}
                  style={{ width: "100%", padding: 6, fontSize: 12, fontFamily: "inherit" }}
                />
              )}

              {block.type === "formula" && (
                <textarea
                  value={block.formula ?? ""}
                  onChange={(e) => onUpdateBlock(activeStageId, block.id, { formula: e.target.value })}
                  rows={3}
                  placeholder="LaTeX or formula..."
                  disabled={readOnly}
                  style={{ width: "100%", padding: 6, fontSize: 12, fontFamily: "monospace" }}
                />
              )}

              {block.type === "visualize" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(() => {
                    const snapA = resolveVisualizeSnapshot(block, "A");
                    const snapB = resolveVisualizeSnapshot(block, "B");
                    const datasetRef = snapA?.datasetRef ?? snapB?.datasetRef ?? currentDatasetRef;
                    const live = block.visualize?.live ?? true;
                    return (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {([
                            { slot: "A" as const, snap: snapA },
                            { slot: "B" as const, snap: snapB },
                          ] as const).map(({ slot, snap }) => (
                            <div
                              key={slot}
                              style={{
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                                background: "#f8fafc",
                                padding: 6,
                              }}
                            >
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                                Snapshot {slot}
                              </div>
                              {snap?.thumbnail ? (
                                <img
                                  src={snap.thumbnail}
                                  alt={`Snapshot ${slot}`}
                                  style={{
                                    width: "100%",
                                    borderRadius: 6,
                                    border: "1px solid #e5e7eb",
                                    background: "#fff",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    height: 96,
                                    borderRadius: 6,
                                    border: "1px dashed #cbd5f5",
                                    background: "#fff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    color: "#64748b",
                                  }}
                                >
                                  No thumbnail
                                </div>
                              )}
                              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                                {snap
                                  ? `Captured ${new Date(snap.capturedAt).toLocaleString()}`
                                  : `No snapshot ${slot} yet.`}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.75 }}>
                          Dataset: <strong>{datasetRef}</strong>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => onCaptureVisualize(activeStageId, block.id, "A")}
                            disabled={readOnly}
                            style={{ padding: "4px 8px" }}
                          >
                            Capture A
                          </button>
                          <button
                            type="button"
                            onClick={() => snapA && onApplyVisualize(snapA, block.id, "A")}
                            disabled={!snapA}
                            style={{ padding: "4px 8px" }}
                          >
                            Jump A
                          </button>
                          <button
                            type="button"
                            onClick={() => onCaptureVisualize(activeStageId, block.id, "B")}
                            disabled={readOnly}
                            style={{ padding: "4px 8px" }}
                          >
                            Capture B
                          </button>
                          <button
                            type="button"
                            onClick={() => snapB && onApplyVisualize(snapB, block.id, "B")}
                            disabled={!snapB}
                            style={{ padding: "4px 8px" }}
                          >
                            Jump B
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleVisualizeLive(activeStageId, block.id, !live)}
                            disabled={readOnly}
                            style={{ padding: "4px 8px" }}
                          >
                            {live ? "Live" : "Frozen"}
                          </button>
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
                          disabled={readOnly}
                          style={{ width: "100%", padding: 6, fontSize: 12 }}
                        />
                        <div
                          style={{
                            borderTop: "1px solid #e5e7eb",
                            paddingTop: 8,
                            marginTop: 4,
                          }}
                        >
                          <VisualizeDiffPanel snapA={snapA} snapB={snapB} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {block.type === "compute" &&
                (() => {
                  const selectedOperatorId = block.compute?.operatorId ?? "";
                  const operatorSpec = selectedOperatorId
                    ? WORKBOOK_OPERATOR_BY_ID.get(selectedOperatorId)
                    : undefined;
                  const lastRun = block.compute?.lastRun;
                  const inputHash = lastRun?.inputHash;
                  const cacheHit = !!lastRun?.cacheHit;
                  const operatorOptions = WORKBOOK_OPERATOR_CATALOG.filter(
                    (op) => !op.hidden || op.id === selectedOperatorId
                  );
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 700 }}>
                        Operator
                        <select
                          value={selectedOperatorId}
                          onChange={(e) =>
                            onUpdateBlock(activeStageId, block.id, {
                              compute: { ...(block.compute ?? { status: "idle" }), operatorId: e.target.value },
                            })
                          }
                          disabled={readOnly}
                          style={{ width: "100%", marginTop: 4 }}
                        >
                          <option value="">Select an operator</option>
                          {operatorOptions.map((op) => (
                            <option key={op.id} value={op.id}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {operatorSpec?.hint?.length ? (
                        <div
                          style={{
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            background: "#f8fafc",
                            fontSize: 10,
                            color: "#334155",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
                            Quick hint
                          </div>
                          {operatorSpec.hint.map((line, idx) => (
                            <div key={`${operatorSpec.id}-hint-${idx}`} style={{ opacity: 0.85 }}>
                              {line}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => onRunComputeBlock(activeStageId, block.id, block.compute?.operatorId)}
                          disabled={readOnly || !block.compute?.operatorId}
                          style={{ padding: "4px 8px" }}
                        >
                          Run operator
                        </button>
                        <button
                          type="button"
                          onClick={() => onRunFromBlock(activeStageId, block.id)}
                          disabled={readOnly || !block.compute?.operatorId}
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
                        {cacheHit && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "#ecfeff",
                              color: "#0e7490",
                              fontWeight: 700,
                              fontSize: 10,
                              textTransform: "uppercase",
                            }}
                            title={inputHash ? `Input hash: ${inputHash}` : "Cache hit"}
                          >
                            Cache hit
                          </span>
                        )}
                        {inputHash && (
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 999,
                              background: "#f1f5f9",
                              color: "#475569",
                              fontWeight: 700,
                              fontSize: 9,
                              letterSpacing: 0.4,
                            }}
                            title={`Input hash: ${inputHash}`}
                          >
                            HASH
                          </span>
                        )}
                        {block.compute?.datasetRef && (
                          <span style={{ fontSize: 10, opacity: 0.6 }}>
                            {block.compute.datasetRef}
                          </span>
                        )}
                      </div>
                      {block.compute?.summary && (
                        <div style={{ fontSize: 11, opacity: 0.7 }}>{block.compute.summary}</div>
                      )}
                      {lastRun && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            background: "#f8fafc",
                            fontSize: 10,
                            color: "#334155",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
                            Run details
                          </div>
                          <div>Status: {lastRun.status}</div>
                          {lastRun.timing?.endedAt && (
                            <div>Last run: {new Date(lastRun.timing.endedAt).toLocaleString()}</div>
                          )}
                          {lastRun.timing?.durationMs != null && (
                            <div>Duration: {Math.max(0, Math.round(lastRun.timing.durationMs))} ms</div>
                          )}
                          {inputHash && <div title={`Input hash: ${inputHash}`}>Input hash: {inputHash}</div>}
                          {lastRun.logs?.length ? (
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: "pre-wrap",
                                fontFamily: "SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace",
                                fontSize: 10,
                                color: "#0f172a",
                              }}
                            >
                              {lastRun.logs.join("\n")}
                            </pre>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })()}

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
                      disabled={readOnly}
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
                      disabled={readOnly}
                      style={{ padding: "4px 8px" }}
                    >
                      Arm pick
                    </button>
                    {block.interaction?.kind === "draw_curve" && (
                      <button
                        type="button"
                        onClick={() => onFinishInteraction(activeStageId, block.id)}
                        disabled={readOnly}
                        style={{ padding: "4px 8px" }}
                      >
                        Finish curve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onClearInteraction(activeStageId, block.id)}
                      disabled={readOnly}
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
                        disabled={readOnly}
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
                    disabled={readOnly}
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
                      disabled={readOnly}
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
                    disabled={readOnly}
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
                              disabled={readOnly}
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
                                disabled={readOnly}
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
                              disabled={readOnly}
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
                                disabled={readOnly}
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
                                disabled={readOnly}
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
                          disabled={readOnly}
                          style={{ marginRight: 6 }}
                        />
                        Scrub mode
                      </label>
                      <button
                        type="button"
                        onClick={() => onApplyParams(activeStageId, block.id)}
                        disabled={readOnly}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        Apply params
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => onAddKeyframe(activeStageId, block.id)}
                        disabled={readOnly}
                        style={{ padding: "2px 8px", fontSize: 11 }}
                      >
                        Save keyframe
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(activeStageId, block)}
                        disabled={readOnly}
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
                              disabled={readOnly}
                              style={{ padding: "2px 6px", fontSize: 10 }}
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveKeyframe(activeStageId, block.id, kf.id)}
                              disabled={readOnly}
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
              disabled={readOnly}
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
