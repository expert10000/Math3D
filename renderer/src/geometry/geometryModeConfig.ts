import type { GeometryToMeshPromotionMode } from "./meshPromotionContract";

export type GeometryMode = "procedural" | "demo" | "scratch" | "workbook";
export type GeometryWorkbookUiMode = "compact" | "full";
export type GeometryDemoFamily = "stereometry" | "planimetry";
export type PlanimetryPresetId = "task" | "euler" | "tangent" | "incircle_reflection";
export type GeometryProceduralPanelTab =
  | "create"
  | "scene"
  | "object"
  | "construct"
  | "transform"
  | "view"
  | "history"
  | "analysis"
  | "demonstrations"
  | "debug"
  | "theory"
  | "script"
  | "euler";
export type GeometryDemonstrationCategory =
  | "cross_sections"
  | "volume_relations"
  | "scaling"
  | "polyhedra_topology";
export type GeometryVolumeRelationFocusMode = "sphere" | "cylinder" | "cone" | "cylinder_cone" | "all";
export type GeometryEulerScope = "selected" | "scene";
export type GeometryEulerPolygonTemplateId =
  | "torus_abab_inv"
  | "projective_aa"
  | "klein_abainvb"
  | "mobius_baca_inv"
  | "cylinder_uava_inv";
export type GeometryDemoTab = "task" | "objects" | "solve" | "script";
export type GeometryFitMode = "scene" | "stage" | "claim";
export type GeometryObjectRole = "primary" | "construction" | "helper" | "claim" | "diagnostic";

export const GEOMETRY_MODE_VALUES: GeometryMode[] = ["procedural", "demo", "scratch", "workbook"];
export const GEOMETRY_DEMO_TAB_VALUES: GeometryDemoTab[] = ["task", "objects", "solve", "script"];
export const GEOMETRY_PROCEDURAL_PANEL_VALUES: GeometryProceduralPanelTab[] = [
  "create",
  "scene",
  "object",
  "construct",
  "transform",
  "view",
  "history",
  "analysis",
  "demonstrations",
  "debug",
  "theory",
  "script",
  "euler",
];
export const GEOMETRY_DEMONSTRATION_CATEGORY_OPTIONS: Array<{ id: GeometryDemonstrationCategory; label: string }> = [
  { id: "cross_sections", label: "Cross-sections" },
  { id: "volume_relations", label: "Volume relations" },
  { id: "scaling", label: "Scaling" },
  { id: "polyhedra_topology", label: "Polyhedra topology" },
];
export const GEOMETRY_VOLUME_RELATION_FOCUS_OPTIONS: Array<{ id: GeometryVolumeRelationFocusMode; label: string }> = [
  { id: "sphere", label: "1: Sphere" },
  { id: "cylinder", label: "1: Cylinder" },
  { id: "cone", label: "1: Cone" },
  { id: "cylinder_cone", label: "2: Cyl + Cone" },
  { id: "all", label: "3: All" },
];
export const GEOMETRY_PROMOTION_MODE_LABELS: Record<GeometryToMeshPromotionMode, string> = {
  raw_mesh: "Raw mesh",
  triangulated_mesh: "Triangulated mesh",
  repaired_mesh: "Repaired mesh",
  analysis_ready_mesh: "Analysis-ready mesh",
  frozen_baked_object: "Frozen/baked object",
  editable_mesh_object: "Editable mesh object",
};
export const PLANIMETRY_PRESET_VALUES: PlanimetryPresetId[] = ["task", "euler", "tangent", "incircle_reflection"];

export const isGeometryModeValue = (value: string | undefined): value is GeometryMode =>
  !!value && GEOMETRY_MODE_VALUES.includes(value as GeometryMode);
export const isGeometryDemoTabValue = (value: string | undefined): value is GeometryDemoTab =>
  !!value && GEOMETRY_DEMO_TAB_VALUES.includes(value as GeometryDemoTab);
export const isGeometryProceduralPanelTabValue = (value: string | undefined): value is GeometryProceduralPanelTab =>
  !!value && GEOMETRY_PROCEDURAL_PANEL_VALUES.includes(value as GeometryProceduralPanelTab);
export const isPlanimetryPresetValue = (value: string | undefined): value is PlanimetryPresetId =>
  !!value && PLANIMETRY_PRESET_VALUES.includes(value as PlanimetryPresetId);
