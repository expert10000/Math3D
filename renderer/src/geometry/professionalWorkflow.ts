import type { GeometryMode, GeometryProceduralPanelTab } from "./geometryModeConfig";

export type GeometryProfessionalPanelId = "scene" | "object" | "view" | "analysis" | "services" | "theory";
export type GeometryProfessionalActionId = "gallery" | "new" | "demo" | "compare" | "more";
export type GeometryProfessionalToolId = "construct" | "modify" | "analyze" | "navigate";

export type GeometryProfessionalDestination =
  | { kind: "procedural-panel"; panel: GeometryProceduralPanelTab }
  | { kind: "mode"; mode: GeometryMode };

export type GeometryProfessionalEntry<TId extends string> = {
  id: TId;
  label: string;
  destination: GeometryProfessionalDestination;
};

export const GEOMETRY_PROFESSIONAL_PANELS: readonly GeometryProfessionalEntry<GeometryProfessionalPanelId>[] = [
  { id: "scene", label: "Scene", destination: { kind: "procedural-panel", panel: "scene" } },
  { id: "object", label: "Object", destination: { kind: "procedural-panel", panel: "object" } },
  { id: "view", label: "View", destination: { kind: "procedural-panel", panel: "view" } },
  { id: "analysis", label: "Analysis", destination: { kind: "procedural-panel", panel: "analysis" } },
  { id: "services", label: "Services", destination: { kind: "procedural-panel", panel: "debug" } },
  { id: "theory", label: "Theory", destination: { kind: "procedural-panel", panel: "theory" } },
] as const;

export const GEOMETRY_PROFESSIONAL_ACTIONS: readonly GeometryProfessionalEntry<GeometryProfessionalActionId>[] = [
  { id: "gallery", label: "Gallery", destination: { kind: "procedural-panel", panel: "create" } },
  { id: "new", label: "New", destination: { kind: "procedural-panel", panel: "create" } },
  { id: "demo", label: "Demo", destination: { kind: "mode", mode: "demo" } },
  { id: "compare", label: "Compare", destination: { kind: "procedural-panel", panel: "analysis" } },
  { id: "more", label: "More", destination: { kind: "procedural-panel", panel: "script" } },
] as const;

export const GEOMETRY_PROFESSIONAL_TOOLS: readonly GeometryProfessionalEntry<GeometryProfessionalToolId>[] = [
  { id: "construct", label: "Construct", destination: { kind: "procedural-panel", panel: "construct" } },
  { id: "modify", label: "Modify", destination: { kind: "procedural-panel", panel: "transform" } },
  { id: "analyze", label: "Analyze", destination: { kind: "procedural-panel", panel: "analysis" } },
  { id: "navigate", label: "Navigate", destination: { kind: "procedural-panel", panel: "scene" } },
] as const;

export const GEOMETRY_PROFESSIONAL_EXPANDED_GROUPS = [
  {
    id: "gallery",
    label: "Gallery choices",
    entries: [
      { id: "object-gallery", label: "Object Gallery", destination: { kind: "procedural-panel", panel: "create" } },
      { id: "scene-gallery", label: "Scene Gallery", destination: { kind: "procedural-panel", panel: "demonstrations" } },
    ],
  },
  {
    id: "new",
    label: "New workspace",
    entries: [
      { id: "new-object", label: "New object", destination: { kind: "procedural-panel", panel: "create" } },
      { id: "new-construction", label: "Construction Lab", destination: { kind: "mode", mode: "scratch" } },
      { id: "new-scratch", label: "Scratch", destination: { kind: "mode", mode: "scratch" } },
      { id: "new-workbook", label: "Workbook", destination: { kind: "mode", mode: "workbook" } },
    ],
  },
  {
    id: "existing",
    label: "Existing tools",
    entries: [
      { id: "procedural", label: "Procedural", destination: { kind: "mode", mode: "procedural" } },
      { id: "demo-preview", label: "Demo preview", destination: { kind: "mode", mode: "demo" } },
      { id: "scratch-editor", label: "Scratch editor", destination: { kind: "mode", mode: "scratch" } },
      { id: "workbook-scene", label: "Workbook scene", destination: { kind: "mode", mode: "workbook" } },
      { id: "history", label: "History", destination: { kind: "procedural-panel", panel: "history" } },
      { id: "script", label: "Scene Script", destination: { kind: "procedural-panel", panel: "script" } },
      { id: "topology", label: "Topology / Euler", destination: { kind: "procedural-panel", panel: "euler" } },
      { id: "debug", label: "Presets / debug", destination: { kind: "procedural-panel", panel: "debug" } },
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  entries: readonly GeometryProfessionalEntry<string>[];
}>;

export const geometryProfessionalActiveIds = (
  mode: GeometryMode,
  panel: GeometryProceduralPanelTab
): {
  panel: GeometryProfessionalPanelId | null;
  action: GeometryProfessionalActionId | null;
  tool: GeometryProfessionalToolId | null;
} => {
  if (mode === "demo") return { panel: null, action: "demo", tool: null };
  if (mode === "scratch" || mode === "workbook") return { panel: null, action: "new", tool: null };

  const activePanel = GEOMETRY_PROFESSIONAL_PANELS.find(
    (entry) => entry.destination.kind === "procedural-panel" && entry.destination.panel === panel
  )?.id ?? null;
  const activeAction: GeometryProfessionalActionId | null =
    panel === "create"
      ? "gallery"
      : panel === "analysis"
        ? "compare"
        : panel === "script" || panel === "debug" || panel === "history" || panel === "euler"
          ? "more"
          : null;
  const activeTool: GeometryProfessionalToolId | null =
    panel === "construct"
      ? "construct"
      : panel === "transform"
        ? "modify"
        : panel === "analysis"
          ? "analyze"
          : panel === "scene"
            ? "navigate"
            : null;

  return { panel: activePanel, action: activeAction, tool: activeTool };
};
