export type UnifiedCommandHistoryWorkspace = "Mesh" | "Geometry";
export type UnifiedCommandHistoryKind = "topology" | "object" | "construction";

export type UnifiedCommandHistoryCounts = {
  readonly vertexCount: number;
  readonly faceCount: number;
};

export type UnifiedCommandHistoryEntry = {
  readonly workspace: UnifiedCommandHistoryWorkspace;
  readonly kind: UnifiedCommandHistoryKind;
  readonly id: string;
  readonly at: number;
  readonly title: string;
  readonly detail: string;
  readonly sourceLabel: string;
  readonly actionLabel: string;
  readonly targetLabel?: string | null;
  readonly resultLabel: string;
  readonly parametersLabel?: string | null;
  readonly beforeCounts?: UnifiedCommandHistoryCounts | null;
  readonly afterCounts?: UnifiedCommandHistoryCounts | null;
  readonly countsLabel?: string | null;
  readonly confirmationLabel: string;
  readonly lastCommandLabel: string;
};

export type MeshTopologyCommandHistorySource = {
  readonly id: string;
  readonly at: number;
  readonly actionLabel: string;
  readonly sourceLabel: string;
  readonly targetLabel: string;
  readonly paramsLabel?: string | null;
  readonly resultLabel: string;
  readonly selectedResultLabel?: string | null;
  readonly beforeCounts: UnifiedCommandHistoryCounts;
  readonly afterCounts: UnifiedCommandHistoryCounts;
};

export type GeometryObjectCommandHistorySource = {
  readonly id: string;
  readonly at: number;
  readonly label: string;
  readonly operationType: string;
  readonly operationTarget?: string | null;
  readonly operationParameters?: string | null;
  readonly objectName: string;
  readonly sourceObjectName?: string | null;
  readonly action?: string | null;
  readonly changeSummary?: string | null;
  readonly topologySummary?: string | null;
  readonly beforeVertexCount?: number | null;
  readonly afterVertexCount?: number | null;
  readonly beforeFaceCount?: number | null;
  readonly afterFaceCount?: number | null;
};

export type GeometryConstructionCommandHistorySource = {
  readonly id: string;
  readonly at: number;
  readonly action: string;
  readonly source: string;
  readonly result: string;
  readonly operationSummary?: {
    readonly source?: string | null;
    readonly action?: string | null;
    readonly result?: string | null;
    readonly parameters?: string | null;
  } | null;
  readonly planeSummary?: {
    readonly method?: string | null;
  } | null;
};

export function formatUnifiedCommandCounts(
  beforeCounts: UnifiedCommandHistoryCounts | null | undefined,
  afterCounts: UnifiedCommandHistoryCounts | null | undefined,
  separator = ", "
): string | null {
  if (!beforeCounts || !afterCounts) return null;
  return `V ${beforeCounts.vertexCount} -> ${afterCounts.vertexCount}${separator}F ${beforeCounts.faceCount} -> ${afterCounts.faceCount}`;
}

const compactActionLabel = (actionLabel: string): string =>
  actionLabel
    .replace(/\s+edge$/i, "")
    .replace(/\s+face$/i, "")
    .trim()
    .toLowerCase();

export function buildMeshTopologyCommandHistoryEntry(
  entry: MeshTopologyCommandHistorySource
): UnifiedCommandHistoryEntry {
  const countsLabel = formatUnifiedCommandCounts(entry.beforeCounts, entry.afterCounts);
  const selectedResult = entry.selectedResultLabel ?? entry.resultLabel;
  const lastCommandLabel = `${entry.targetLabel} ${compactActionLabel(entry.actionLabel)}`;
  return {
    workspace: "Mesh",
    kind: "topology",
    id: `mesh:${entry.id}`,
    at: entry.at,
    title: entry.actionLabel,
    detail: `${entry.sourceLabel} - ${entry.actionLabel} - ${entry.targetLabel}`,
    sourceLabel: entry.sourceLabel,
    actionLabel: entry.actionLabel,
    targetLabel: entry.targetLabel,
    resultLabel: entry.resultLabel,
    parametersLabel: entry.paramsLabel ?? null,
    beforeCounts: entry.beforeCounts,
    afterCounts: entry.afterCounts,
    countsLabel,
    confirmationLabel: `Done: ${selectedResult}`,
    lastCommandLabel,
  };
}

export function buildGeometryObjectCommandHistoryEntry(
  entry: GeometryObjectCommandHistorySource
): UnifiedCommandHistoryEntry {
  const mirrorSource =
    entry.operationType === "Mirror"
      ? entry.changeSummary?.match(/^Created mirror copy from (.+)\.$/)?.[1] ?? entry.operationTarget ?? entry.objectName
      : null;
  const lineageSource = entry.sourceObjectName ?? mirrorSource ?? null;
  const isCopyLike =
    Boolean(lineageSource) ||
    entry.action === "duplicate" ||
    entry.action === "history-duplicate" ||
    entry.action === "mirror-copy";
  const beforeCounts =
    entry.beforeVertexCount == null || entry.beforeFaceCount == null
      ? null
      : { vertexCount: entry.beforeVertexCount, faceCount: entry.beforeFaceCount };
  const afterCounts =
    entry.afterVertexCount == null || entry.afterFaceCount == null
      ? null
      : { vertexCount: entry.afterVertexCount, faceCount: entry.afterFaceCount };
  const countsLabel = formatUnifiedCommandCounts(beforeCounts, afterCounts);
  const subject = entry.operationTarget ?? entry.label;
  const resultLabel = isCopyLike
    ? `${lineageSource ?? entry.objectName} -> ${entry.objectName}`
    : entry.topologySummary ?? entry.objectName;
  return {
    workspace: "Geometry",
    kind: "object",
    id: `geometry:${entry.id}`,
    at: entry.at,
    title: entry.label,
    detail: `${entry.objectName} - ${entry.operationType}${entry.operationTarget ? ` - ${entry.operationTarget}` : ""}`,
    sourceLabel: lineageSource ?? entry.objectName,
    actionLabel: entry.operationType,
    targetLabel: entry.operationTarget,
    resultLabel,
    parametersLabel: entry.operationParameters,
    beforeCounts,
    afterCounts,
    countsLabel,
    confirmationLabel: `Done: ${subject}${countsLabel ? `, ${countsLabel}` : ""}`,
    lastCommandLabel: subject,
  };
}

export function buildGeometryConstructionCommandHistoryEntry(
  entry: GeometryConstructionCommandHistorySource
): UnifiedCommandHistoryEntry {
  const actionLabel = entry.operationSummary?.action ?? entry.action;
  const resultLabel = entry.operationSummary?.result ?? entry.result;
  const sourceLabel = entry.operationSummary?.source ?? entry.source;
  const title = entry.planeSummary ? `${entry.action} plane` : entry.action;
  return {
    workspace: "Geometry",
    kind: "construction",
    id: `geometry-construction:${entry.id}`,
    at: entry.at,
    title,
    detail: entry.planeSummary ? `${entry.source} - ${entry.planeSummary.method}` : `${entry.source} - ${entry.result}`,
    sourceLabel,
    actionLabel,
    resultLabel,
    parametersLabel: entry.operationSummary?.parameters,
    countsLabel: null,
    confirmationLabel: `Done: ${resultLabel}`,
    lastCommandLabel: `${actionLabel}: ${resultLabel}`,
  };
}
