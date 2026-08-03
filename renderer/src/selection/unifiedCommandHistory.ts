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

export type UnifiedCommandHistoryRow = {
  readonly label: "Source" | "Action" | "Before" | "After" | "Result" | "Params";
  readonly value: string;
};

export type UnifiedCommandParameterValue = string | number | boolean;

export type UnifiedCommandParameterEdit = {
  readonly key: string;
  readonly label: string;
  readonly value: UnifiedCommandParameterValue;
  readonly valueType: "number" | "boolean" | "string";
  readonly sourceValue: string;
  readonly restoreValue?: UnifiedCommandParameterValue | null;
  readonly editable: boolean;
};

export type UnifiedOperationTreeNode = {
  readonly id: string;
  readonly command: UnifiedCommandHistoryEntry;
  readonly rows: UnifiedCommandHistoryRow[];
  readonly parameterEdits: UnifiedCommandParameterEdit[];
  readonly canRestoreParameters: boolean;
  readonly canEditParameters: boolean;
  readonly topologyChanged: boolean;
  readonly children: UnifiedOperationTreeNode[];
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

export function buildUnifiedCommandHistoryRows(entry: UnifiedCommandHistoryEntry): UnifiedCommandHistoryRow[] {
  const rows: UnifiedCommandHistoryRow[] = [
    { label: "Source", value: entry.sourceLabel },
    {
      label: "Action",
      value: entry.targetLabel ? `${entry.actionLabel} - ${entry.targetLabel}` : entry.actionLabel,
    },
  ];
  if (entry.beforeCounts) {
    rows.push({
      label: "Before",
      value: `V ${entry.beforeCounts.vertexCount} / F ${entry.beforeCounts.faceCount}`,
    });
  }
  if (entry.afterCounts) {
    rows.push({
      label: "After",
      value: `V ${entry.afterCounts.vertexCount} / F ${entry.afterCounts.faceCount}`,
    });
  }
  rows.push({ label: "Result", value: entry.resultLabel });
  if (entry.parametersLabel) {
    rows.push({ label: "Params", value: entry.parametersLabel });
  }
  return rows;
}

const splitUnifiedCommandParameterParts = (parametersLabel: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < parametersLabel.length; i += 1) {
    const ch = parametersLabel[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    const rest = parametersLabel.slice(i);
    const separatorLength =
      rest.startsWith(" | ") || rest.startsWith(" · ")
        ? 3
        : ch === "," && /^\s+[A-Za-z][\w.-]*\s*(=|:)/.test(parametersLabel.slice(i + 1))
          ? 1
          : 0;
    if (!separatorLength) continue;
    const part = parametersLabel.slice(start, i).trim();
    if (part) parts.push(part);
    start = i + separatorLength;
    i = start - 1;
  }
  const finalPart = parametersLabel.slice(start).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
};

const parseUnifiedCommandParameterValue = (rawValue: string): UnifiedCommandParameterValue => {
  const withoutAnnotation = rawValue.trim().replace(/\s+\([^)]*\)\s*$/, "").trim();
  if (/^(true|false)$/i.test(withoutAnnotation)) return /^true$/i.test(withoutAnnotation);
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(withoutAnnotation)) {
    const numeric = Number(withoutAnnotation);
    if (Number.isFinite(numeric)) return numeric;
  }
  return withoutAnnotation;
};

const classifyUnifiedCommandParameterValue = (
  value: UnifiedCommandParameterValue
): UnifiedCommandParameterEdit["valueType"] => {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
};

export function parseUnifiedCommandParameterLabel(
  parametersLabel: string | null | undefined
): UnifiedCommandParameterEdit[] {
  if (!parametersLabel?.trim()) return [];
  return splitUnifiedCommandParameterParts(parametersLabel)
    .map((part): UnifiedCommandParameterEdit | null => {
      const changedMatch = part.match(/^([A-Za-z][\w.-]*)\s*:\s*(.*?)\s*->\s*(.+)$/);
      if (changedMatch) {
        const [, key, beforeRaw, afterRaw] = changedMatch;
        const value = parseUnifiedCommandParameterValue(afterRaw);
        return {
          key,
          label: key,
          value,
          valueType: classifyUnifiedCommandParameterValue(value),
          sourceValue: afterRaw.trim(),
          restoreValue: parseUnifiedCommandParameterValue(beforeRaw),
          editable: true,
        };
      }

      const valueMatch = part.match(/^([A-Za-z][\w.-]*)\s*=\s*(.+)$/);
      if (valueMatch) {
        const [, key, raw] = valueMatch;
        const value = parseUnifiedCommandParameterValue(raw);
        return {
          key,
          label: key,
          value,
          valueType: classifyUnifiedCommandParameterValue(value),
          sourceValue: raw.trim(),
          restoreValue: value,
          editable: true,
        };
      }
      return null;
    })
    .filter((entry): entry is UnifiedCommandParameterEdit => !!entry);
}

export function buildUnifiedOperationTreeNode(entry: UnifiedCommandHistoryEntry): UnifiedOperationTreeNode {
  const rows = buildUnifiedCommandHistoryRows(entry);
  const parameterEdits = parseUnifiedCommandParameterLabel(entry.parametersLabel);
  return {
    id: entry.id,
    command: entry,
    rows,
    parameterEdits,
    canRestoreParameters: parameterEdits.length > 0,
    canEditParameters: parameterEdits.some((param) => param.editable),
    topologyChanged: !!entry.beforeCounts && !!entry.afterCounts,
    children: [],
  };
}

export function buildUnifiedOperationTreeNodes(
  entries: readonly UnifiedCommandHistoryEntry[]
): UnifiedOperationTreeNode[] {
  return entries.map(buildUnifiedOperationTreeNode);
}

const compactActionLabel = (actionLabel: string): string =>
  actionLabel
    .replace(/\s+edge$/i, "")
    .replace(/\s+face$/i, "")
    .trim()
    .toLowerCase();

const formatGeometryCommandSubject = (entry: GeometryObjectCommandHistorySource): string => {
  const target = entry.operationTarget ?? entry.label;
  const label = entry.label.toLowerCase();
  if (label.includes("extrude")) return `${target} extruded`;
  if (label.includes("inset")) return `${target} inset`;
  if (label.includes("delete")) return `${target} deleted`;
  if (label.includes("subdivide")) return `${target} subdivided`;
  if (label.includes("split")) return `${target} split`;
  if (label.includes("collapse")) return `${target} collapsed`;
  if (label.includes("bevel")) return `${target} beveled`;
  if (label.includes("move")) return `${target} moved`;
  if (label.includes("weld")) return `${target} welded`;
  return target;
};

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
  const subject = formatGeometryCommandSubject(entry);
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
