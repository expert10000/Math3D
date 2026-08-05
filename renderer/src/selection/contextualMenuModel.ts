import type { ContextualEntityMode, ContextualSelectionWorkspace } from "./contextualSelectionModel";

export type ContextualSelectionTargetMode = "object" | ContextualEntityMode;

export type ContextualSelectionBreadcrumbInput = {
  readonly workspace: ContextualSelectionWorkspace;
  readonly targetMode: ContextualSelectionTargetMode;
  readonly objectLabel?: string | null;
  readonly entityLabel?: string | number | null;
};

const WORKSPACE_LABELS: Record<ContextualSelectionWorkspace, "Geometry" | "Mesh"> = {
  geometry: "Geometry",
  mesh: "Mesh",
};

const TARGET_LABELS: Record<ContextualSelectionTargetMode, "Object" | "Face" | "Edge" | "Vertex"> = {
  object: "Object",
  face: "Face",
  edge: "Edge",
  vertex: "Vertex",
};

const cleanLabel = (value: string | number | null | undefined): string | null => {
  if (value == null) return null;
  const text = String(value).trim();
  return text && text !== "none" ? text : null;
};

const normalizeEntityLabel = (mode: ContextualSelectionTargetMode, value: string | number | null | undefined): string | null => {
  const text = cleanLabel(value);
  if (!text) return null;
  const expected = TARGET_LABELS[mode];
  return text.toLowerCase().startsWith(expected.toLowerCase()) ? text : `${expected} ${text}`;
};

export function formatContextualSelectionBreadcrumb({
  workspace,
  targetMode,
  objectLabel,
  entityLabel,
}: ContextualSelectionBreadcrumbInput): string {
  const parts: string[] = [WORKSPACE_LABELS[workspace]];
  const object = cleanLabel(objectLabel);
  parts.push(object ? `Object: ${object}` : "Object");
  if (targetMode !== "object") {
    parts.push(normalizeEntityLabel(targetMode, entityLabel) ?? TARGET_LABELS[targetMode]);
  }
  return parts.join(" > ");
}

export function contextualSelectionMenuTitle(
  workspace: ContextualSelectionWorkspace,
  targetMode: ContextualSelectionTargetMode
): string {
  return `${WORKSPACE_LABELS[workspace]} ${TARGET_LABELS[targetMode]} menu`;
}
