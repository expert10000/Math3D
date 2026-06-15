import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OverlayLabelSet } from "./SurfaceViewer";
import type { GeometryScene, Line3, Point3 } from "../geometry/types";
import {
  createSceneProjectDocument,
  deserializeSceneProject,
  getSceneDocumentExtension,
  serializeSceneProject,
  withSceneDocumentExtension,
  type SceneDocument,
} from "@math3d/core";
import { PROCEDURAL_SCENE_SCRIPT_STARTER } from "../geometry/scripting/sceneScriptExamples";
import { parseSceneScript as parseProceduralSceneScript } from "../geometry/scripting/sceneScriptParser";
import {
  buildPointLabelSet,
  type Circle3,
  type ConstructionConstraintDef,
  evaluateConstructionGraph,
  evaluateProblemChecks,
  type ConstructionNode,
  type ConstructionObjectSummary,
  type ProblemCheckDef,
  type ProblemCheckResult,
} from "../geometry/problemGraph";
import { formatConstraintValue } from "../geometry/analysis";
import {
  createGeometryObject,
  type GeometryObject,
  type GeometryObjectType,
} from "../geometry/proceduralObjects";

type BuildMode = "select" | "create" | "check";
export type ConstructionWorkspaceTab = "task" | "build" | "inspect" | "claims" | "script" | "scene";
export type ScratchSolidKind = Extract<GeometryObjectType, "box" | "sphere" | "cylinder" | "cone">;
export type ScratchSolid = GeometryObject & { type: ScratchSolidKind };
type ScratchPlacementKind = "point" | ScratchSolidKind;

type ToolKind =
  | "point"
  | "line"
  | "perpendicular"
  | "parallel"
  | "perpBisector"
  | "angleBisector"
  | "circle"
  | "circle3"
  | "circumcircle"
  | "circumcenter"
  | "midpoint"
  | "arcMidpoint"
  | "intersection"
  | "secondIntersection";

type CheckKind = "collinear" | "concyclic" | "perpendicular" | "parallel" | "pointOnCircle" | "equalDistance";

type ParseResult =
  | { ok: true; summary: string; node?: ConstructionNode; check?: ProblemCheckDef; constraint?: ConstructionConstraintDef }
  | { ok: false; error: string };

type ScriptPreset = {
  name: string;
  script: string;
  savedAt: number;
};

type ScriptOutlineEntry = {
  line: number;
  label: string;
};

type ScriptSymbolKind = "point" | "line" | "circle" | "claim" | "constraint" | "object";

type ScriptSymbol = {
  id: string;
  label: string;
  kind: ScriptSymbolKind;
  line: number;
  summary: string;
  dependencies: string[];
  usedBy: string[];
};

type UpgradedScriptDiagnostic = {
  level: "error" | "warning" | "hint";
  line: number | null;
  title: string;
  message: string;
  symbolId?: string;
};

type ScriptStageSection = {
  index: number;
  label: string;
  line: number;
  endLine: number;
  symbols: ScriptSymbol[];
};

type SceneMode = "plane2d" | "space3d";
type SceneType = "task" | "free" | "demo";
type ScriptSyncMode = "overwrite" | "appendNew" | "keepComments";
type ClaimsSortMode = "status" | "name" | "residual";
type ScriptSurfaceTab = "script" | "construction" | "automation";
type ScriptInspectorTab =
  | "present"
  | "outline"
  | "scene"
  | "symbols"
  | "definition"
  | "dependencies"
  | "claims"
  | "history";

type SceneBundle = {
  version: number;
  sceneName: string;
  sceneType: SceneType;
  sceneMode: SceneMode;
  metadata: string;
  script: string;
  nodes: ConstructionNode[];
  checks: ProblemCheckDef[];
  constraints?: ConstructionConstraintDef[];
  solids?: ScratchSolid[];
  selectedSolidId?: string | null;
};

type ConstructionLabExtension = {
  sceneType: SceneType;
  sceneMode: SceneMode;
  metadata: string;
  script: string;
  nodes: ConstructionNode[];
  checks: ProblemCheckDef[];
  constraints?: ConstructionConstraintDef[];
  solids?: ScratchSolid[];
  selectedSolidId?: string | null;
};

export type ConstructionLabState = {
  scene: GeometryScene;
  labels: OverlayLabelSet[] | null;
  checks: ProblemCheckResult[];
  graphObjects: ConstructionObjectSummary[];
  points: Record<string, Point3>;
  lines: Record<string, Line3>;
  circles: Record<string, Circle3>;
  errors: string[];
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
  constraints: ConstructionConstraintDef[];
  selectedNodeId: string;
  scriptText: string;
  solids: ScratchSolid[];
  selectedSolidId: string | null;
};

export type ConstructionLabSeed = {
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
  constraints?: ConstructionConstraintDef[];
  selectedNodeId?: string | null;
  scriptText?: string;
  solids?: ScratchSolid[];
  selectedSolidId?: string | null;
};

type ConstructionLabPanelProps = {
  onChange: (next: ConstructionLabState) => void;
  proceduralSceneScriptText?: string;
  onProceduralSceneScriptTextChange?: (script: string) => void;
  onRunProceduralSceneScript?: (script: string) => void;
  proceduralSceneScriptStatus?: string | null;
  proceduralSceneScriptError?: string | null;
  onPointPlacementModeChange?: (enabled: boolean) => void;
  viewportPickPoint?: { x: number; y: number; z: number } | null;
  viewportPickMeshKey?: string | null;
  onViewportPickConsumed?: () => void;
  viewportMovePoint?: { id: string; point: { x: number; y: number; z: number } } | null;
  onViewportMoveConsumed?: () => void;
  onFocusObjectInScene?: (focus: { target: { x: number; y: number; z: number }; radius?: number }) => void;
  onHoverObjectIds?: (ids: string[]) => void;
  seed?: ConstructionLabSeed | null;
  workspaceTab?: ConstructionWorkspaceTab;
  onWorkspaceTabChange?: (tab: ConstructionWorkspaceTab) => void;
  hideWorkspaceTabs?: boolean;
  hideScriptInspector?: boolean;
  scriptInspectorPortalTarget?: Element | null;
};

type ConstructionHistoryState = {
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
  constraints: ConstructionConstraintDef[];
  selectedNodeId: string;
  solids: ScratchSolid[];
  selectedSolidId: string | null;
  lockedNodeIds: string[];
  helperNodeIds: string[];
  disabledCheckIds: string[];
};

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const AUTOMATION_SCRIPT_STARTER = [
  "# Automation timeline script",
  "frame 0",
  "show A",
  "",
  "frame 10",
  "move A 5 0 0",
  "",
  "frame 20",
  "show sphere1",
].join("\n");

const parseAutomationTimelineScript = (script: string) => {
  let frameCount = 0;
  let actionCount = 0;
  const diagnostics: Array<{ line: number; message: string }> = [];
  const lines = script.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const tokens = trimmed.split(/\s+/);
    const head = tokens[0]?.toLowerCase();

    if (head === "frame") {
      const frame = Number(tokens[1]);
      if (tokens.length !== 2 || !Number.isFinite(frame)) {
        diagnostics.push({ line: lineNumber, message: "frame expects one numeric time value" });
        continue;
      }
      frameCount += 1;
      continue;
    }

    if (head === "show" || head === "hide") {
      if (tokens.length !== 2) {
        diagnostics.push({ line: lineNumber, message: `${head} expects one target id` });
        continue;
      }
      actionCount += 1;
      continue;
    }

    if (head === "move") {
      if (tokens.length !== 5 || tokens.slice(2).some((value) => !Number.isFinite(Number(value)))) {
        diagnostics.push({ line: lineNumber, message: "move expects target id plus x y z numbers" });
        continue;
      }
      actionCount += 1;
      continue;
    }

    diagnostics.push({ line: lineNumber, message: `unknown automation command '${tokens[0]}'` });
  }

  return { frameCount, actionCount, diagnostics };
};

const PRESET_STORAGE_KEY = "math3d.geometry.sceneScriptPresets.v1";
const BUILTIN_TASK_PRESET_NAME = "__builtin_olympiad_arc_task__";
const BUILTIN_TASK_PRESET_LABEL = "Task: Olympiad Arc";
const CONSTRUCTION_LAB_EXTENSION_KEY = "constructionLab";

const DEFAULT_FREE_POINTS: ConstructionNode[] = [
  { id: "A", type: "freePoint", label: "A", point: { x: -0.2, y: 1.35, z: 0 }, style: { color: 0xef4444, size: 0.05 } },
  { id: "B", type: "freePoint", label: "B", point: { x: -1.4, y: -0.7, z: 0 }, style: { color: 0xef4444, size: 0.05 } },
  { id: "C", type: "freePoint", label: "C", point: { x: 1.6, y: -0.55, z: 0 }, style: { color: 0xef4444, size: 0.05 } },
];

const DEFAULT_OLYMPIAD_ARC_SCRIPT = [
  "point A -0.2 1.35 0",
  "point B -1.4 -0.7 0",
  "point C 1.6 -0.55 0",
  "circumcircle A B C as Omega",
  "circumcenter A B C as O",
  "arc-midpoint Omega B C exclude A as M",
  "circle3 A O M as Gamma",
  "line A B as AB",
  "line A C as AC",
  "second-intersection AB Gamma exclude A as P",
  "second-intersection AC Gamma exclude A as Q",
  "line B C as BC",
  "perp-bisector P Q as bisPQ",
  "perp BC through A as A_perp_BC",
  "intersection bisPQ A_perp_BC as X",
  "check point-on-circle X Omega",
].join("\n");

const PRESENTATION_SCENE_PRESETS = [
  {
    id: "triangle_skeleton",
    label: "Triangle",
    summary: "Triangle ABC with its three side lines.",
    script: [
      "point A -1.4 -0.7 0",
      "point B 1.4 -0.7 0",
      "point C 0 1.1 0",
      "line A B as AB",
      "line B C as BC",
      "line A C as AC",
    ].join("\n"),
  },
  {
    id: "circumcircle_center",
    label: "Circumcircle",
    summary: "Triangle ABC with circumcircle Omega and center O.",
    script: [
      "point A -1.3 -0.65 0",
      "point B 1.35 -0.65 0",
      "point C 0.1 1.15 0",
      "line A B as AB",
      "line B C as BC",
      "line A C as AC",
      "circumcircle A B C as Omega",
      "circumcenter A B C as O",
      "check point-on-circle A Omega",
    ].join("\n"),
  },
  {
    id: "midline_theorem",
    label: "Midline",
    summary: "Midpoints M and N with the midline MN parallel to BC.",
    script: [
      "point A 0 1.25 0",
      "point B -1.5 -0.75 0",
      "point C 1.5 -0.75 0",
      "line A B as AB",
      "line A C as AC",
      "line B C as BC",
      "midpoint A B as M",
      "midpoint A C as N",
      "line M N as MN",
      "check parallel MN BC",
    ].join("\n"),
  },
  {
    id: "altitude",
    label: "Altitude",
    summary: "Altitude from A to BC with a perpendicular claim.",
    script: [
      "point A 0 1.2 0",
      "point B -1.4 -0.65 0",
      "point C 1.35 -0.45 0",
      "line A B as AB",
      "line A C as AC",
      "line B C as BC",
      "perp BC through A as A_perp_BC",
      "check perpendicular BC A_perp_BC",
    ].join("\n"),
  },
  {
    id: "parallel_lines",
    label: "Parallels",
    summary: "Two parallel lines with a transversal.",
    script: [
      "point A -1.4 -0.6 0",
      "point B 1.4 -0.6 0",
      "point C -1.2 0.75 0",
      "point D 1.6 0.75 0",
      "line A B as AB",
      "line C D as CD",
      "line A C as AC",
      "parallel AB through C as C_parallel_AB",
      "check parallel AB CD",
    ].join("\n"),
  },
  {
    id: "olympiad_arc",
    label: "Olympiad Arc",
    summary: "Full arc midpoint theorem construction with final claim.",
    script: DEFAULT_OLYMPIAD_ARC_SCRIPT,
  },
];

const OLYMPIAD_ARC_TASK_TEXT_PL =
  "Dany jest nierownoramienny trojkat ABC wpisany w okrag Omega o srodku O. " +
  "Punkt M jest srodkiem tego luku BC okregu Omega, ktory nie zawiera punktu A. " +
  "Okreg opisany na trojkacie AOM przecina proste AB i AC odpowiednio w punktach P != A i Q != A. " +
  "Zakladajac kolejnosc A-B-P na AB oraz Q-A-C na AC, wykazac, ze symetralna odcinka PQ " +
  "przecina prosta prostopadla do BC przechodzaca przez A w punkcie lezacym na okregu Omega.";

const OLYMPIAD_ARC_TASK_TEXT_EN =
  "Given a non-isosceles triangle ABC inscribed in circle Omega with center O. " +
  "Let M be the midpoint of arc BC not containing A. " +
  "The circumcircle of triangle AOM meets lines AB and AC at P != A and Q != A. " +
  "Assuming A-B-P are collinear in that order and Q-A-C are collinear in that order, " +
  "prove that the perpendicular bisector of PQ meets the line through A perpendicular to BC at a point on Omega.";

const TOOL_LABELS: Record<ToolKind, string> = {
  point: "Add free point",
  line: "Through 2 points",
  perpendicular: "Perpendicular through point",
  parallel: "Parallel through point",
  perpBisector: "Perpendicular bisector",
  angleBisector: "Angle bisector",
  circle: "Center + point",
  circle3: "Through 3 points",
  circumcircle: "Circumcircle",
  circumcenter: "Circumcenter",
  midpoint: "Midpoint",
  arcMidpoint: "Arc midpoint",
  intersection: "Intersection",
  secondIntersection: "Second intersection",
};

const CHECK_LABELS: Record<CheckKind, string> = {
  collinear: "Collinear",
  concyclic: "Concyclic",
  perpendicular: "Perpendicular",
  parallel: "Parallel",
  pointOnCircle: "Point on circle",
  equalDistance: "Equal distance",
};

const CONSTRAINT_TYPE_LABELS: Record<ConstructionConstraintDef["type"], string> = {
  parallel: "parallel",
  perpendicular: "perpendicular",
  equalLength: "equal length",
  equalRadius: "equal radius",
  coincident: "coincident",
  concentric: "concentric",
  tangent: "tangent",
};

const CHECK_BADGE_COLORS = {
  ok: "#2e7d32",
  fail: "#c62828",
  invalid: "#6b7280",
};

const CREATE_GROUPS: Array<{ title: string; tools: ToolKind[] }> = [
  { title: "Points", tools: ["point"] },
  { title: "Lines", tools: ["line", "perpendicular", "parallel", "perpBisector", "angleBisector"] },
  { title: "Circles", tools: ["circle", "circle3", "circumcircle"] },
  { title: "Derived", tools: ["midpoint", "arcMidpoint", "intersection", "secondIntersection", "circumcenter"] },
];

const SCRIPT_TEMPLATES: Array<{ label: string; command: string }> = [
  { label: "Free point", command: "point P 0 0 0" },
  { label: "Line through points", command: "line A B as AB" },
  { label: "Perpendicular through point", command: "perp AB through C as C_perp_AB" },
  { label: "Parallel through point", command: "parallel AB through C as C_parallel_AB" },
  { label: "Circle center-point", command: "circle O A as omega" },
  { label: "Circumcircle", command: "circumcircle A B C as Omega" },
  { label: "Intersection", command: "intersection AB AC as A1" },
  { label: "Second intersection", command: "second-intersection AB Omega exclude A as X" },
  { label: "Constraint perpendicular", command: "constraint perpendicular L2 L1" },
  { label: "Constraint equal radius", command: "constraint equal-radius c2 c1" },
  { label: "Claim point on circle", command: "check point-on-circle X Omega" },
];

const SCRIPT_INSPECTOR_TABS: Array<{ id: ScriptInspectorTab; label: string }> = [
  { id: "present", label: "Present" },
  { id: "outline", label: "Outline" },
  { id: "scene", label: "Scene" },
  { id: "symbols", label: "Symbols" },
  { id: "definition", label: "Definition" },
  { id: "dependencies", label: "Dependencies" },
  { id: "claims", label: "Claims" },
  { id: "history", label: "History" },
];

const formatInspectorNumber = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "-");

const isPointNode = (node: ConstructionNode) =>
  node.type === "freePoint" ||
  node.type === "midpoint" ||
  node.type === "circumcenter" ||
  node.type === "lineLineIntersection" ||
  node.type === "lineCircleIntersection" ||
  node.type === "circleCircleIntersection" ||
  node.type === "arcMidpointOnCircle";

const isLineNode = (node: ConstructionNode) =>
  node.type === "lineThroughPoints" ||
  node.type === "lineFromPointDir" ||
  node.type === "parallelLine" ||
  node.type === "perpendicularLine" ||
  node.type === "perpendicularBisector" ||
  node.type === "angleBisector";

const isCircleNode = (node: ConstructionNode) =>
  node.type === "circleCenterRadius" || node.type === "circleCenterPoint" || node.type === "circleThrough3Points";

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const cleanId = (text: string) => (text || "").replace(/[^A-Za-z0-9_]/g, "");

const buildConstructionScriptOutline = (script: string): ScriptOutlineEntry[] => {
  const lines = script.split(/\r?\n/);
  const explicit: ScriptOutlineEntry[] = [];
  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    const match = trimmed.match(/^#\s*stage\s+(\d+)\s*[:.-]?\s*(.+)$/i);
    if (match) explicit.push({ line: index + 1, label: `Stage ${match[1]} ${match[2].trim()}` });
  });
  if (explicit.length) return explicit;

  const generated: ScriptOutlineEntry[] = [];
  const seen = new Set<string>();
  const addStage = (key: string, label: string, line: number) => {
    if (seen.has(key)) return;
    seen.add(key);
    generated.push({ line, label });
  };

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const command = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (command === "point") addStage("triangle", "Stage 1 Triangle", index + 1);
    else if (["circumcircle", "circumcenter", "circle", "circle3"].includes(command)) {
      addStage("circles", "Stage 2 Circles", index + 1);
    } else if (command === "midpoint" || command === "arc-midpoint") {
      addStage("midpoints", "Stage 3 Midpoints", index + 1);
    } else if (
      ["line", "perp", "parallel", "perp-bisector", "angle-bisector", "intersection", "second-intersection"].includes(command)
    ) {
      addStage("constructions", "Stage 4 Constructions", index + 1);
    } else if (command === "check" || command === "constraint") {
      addStage("checks", "Stage 5 Checks", index + 1);
    }
  });

  return generated;
};

const scriptSymbolKindForNode = (node: ConstructionNode): ScriptSymbolKind => {
  if (isPointNode(node)) return "point";
  if (isLineNode(node)) return "line";
  if (isCircleNode(node)) return "circle";
  return "object";
};

const scriptSymbolKindLabel = (kind: ScriptSymbolKind) => {
  if (kind === "point") return "Point";
  if (kind === "line") return "Line";
  if (kind === "circle") return "Circle";
  if (kind === "claim") return "Claim";
  if (kind === "constraint") return "Constraint";
  return "Object";
};

const scriptCommandSuggestions = [
  "point",
  "line",
  "circle",
  "circumcircle",
  "circumcenter",
  "circle3",
  "midpoint",
  "arc-midpoint",
  "perp",
  "parallel",
  "perp-bisector",
  "angle-bisector",
  "intersection",
  "second-intersection",
  "check point-on-circle",
  "check collinear",
  "check perpendicular",
  "constraint perpendicular",
  "constraint parallel",
];

const uniqueId = (base: string, existingIds: Set<string>) => {
  const root = cleanId(base) || "obj";
  let id = root;
  let i = 1;
  while (existingIds.has(id)) {
    id = `${root}${i}`;
    i += 1;
  }
  return id;
};

const nodeDependencies = (node: ConstructionNode): string[] => {
  switch (node.type) {
    case "freePoint":
      return [];
    case "midpoint":
      return [node.a, node.b];
    case "circumcenter":
      return [node.a, node.b, node.c];
    case "lineThroughPoints":
      return [node.a, node.b];
    case "lineFromPointDir":
      return [node.point];
    case "parallelLine":
      return [node.point, node.line];
    case "perpendicularLine":
      return [node.point, node.line, ...(node.planeNormalRef ? [node.planeNormalRef] : [])];
    case "perpendicularBisector":
      return [node.a, node.b, ...(node.planeNormalRef ? [node.planeNormalRef] : [])];
    case "angleBisector":
      return [node.vertex, node.a, node.c];
    case "lineLineIntersection":
      return [node.lineA, node.lineB];
    case "lineCircleIntersection":
      return [
        node.line,
        node.circle,
        ...(node.choice?.mode === "nearest" || node.choice?.mode === "farthest" || node.choice?.mode === "otherThan"
          ? [node.choice.point]
          : []),
      ];
    case "circleCircleIntersection":
      return [
        node.circleA,
        node.circleB,
        ...(node.choice?.mode === "nearest" || node.choice?.mode === "farthest" || node.choice?.mode === "otherThan"
          ? [node.choice.point]
          : []),
      ];
    case "circleCenterRadius":
      return [node.center, ...(node.normalRef ? [node.normalRef] : [])];
    case "circleCenterPoint":
      return [node.center, node.point, ...(node.normalRef ? [node.normalRef] : [])];
    case "circleThrough3Points":
      return [node.a, node.b, node.c];
    case "arcMidpointOnCircle":
      return [node.circle, node.b, node.c, ...(node.excludePoint ? [node.excludePoint] : [])];
  }
};

const nodeImpactDependencies = (node: ConstructionNode): string[] => {
  if (node.type === "lineCircleIntersection") return [node.line, node.circle];
  if (node.type === "circleCircleIntersection") return [node.circleA, node.circleB];
  return nodeDependencies(node);
};

const constructionNodeTypeLabel = (node: ConstructionNode): string => {
  switch (node.type) {
    case "freePoint":
      return "Point";
    case "midpoint":
      return "Midpoint";
    case "circumcenter":
      return "Circumcenter";
    case "lineThroughPoints":
    case "lineFromPointDir":
      return "Line";
    case "parallelLine":
      return "Parallel";
    case "perpendicularLine":
      return "Perpendicular";
    case "perpendicularBisector":
      return "Perpendicular Bisector";
    case "angleBisector":
      return "Angle Bisector";
    case "lineLineIntersection":
    case "lineCircleIntersection":
    case "circleCircleIntersection":
      return "Intersection";
    case "circleCenterRadius":
    case "circleCenterPoint":
    case "circleThrough3Points":
      return "Circle";
    case "arcMidpointOnCircle":
      return "Arc Midpoint";
  }
};

const constructionNodeExpression = (node: ConstructionNode): string => {
  switch (node.type) {
    case "freePoint":
      return `point(${node.point.x},${node.point.y},${node.point.z})`;
    case "midpoint":
      return `midpoint(${node.a},${node.b})`;
    case "circumcenter":
      return `circumcenter(${node.a},${node.b},${node.c})`;
    case "lineThroughPoints":
      return `line(${node.a},${node.b})`;
    case "lineFromPointDir":
      return `lineFromPointDir(${node.point},(${node.direction.x},${node.direction.y},${node.direction.z}))`;
    case "parallelLine":
      return `parallel(${node.line},${node.point})`;
    case "perpendicularLine":
      return `perpendicular(${node.line},${node.point})`;
    case "perpendicularBisector":
      return `perpendicularBisector(${node.a},${node.b})`;
    case "angleBisector":
      return `angleBisector(${node.a},${node.vertex},${node.c})`;
    case "lineLineIntersection":
      return `intersection(${node.lineA},${node.lineB})`;
    case "lineCircleIntersection": {
      const suffix =
        node.choice?.mode === "otherThan"
          ? `,exclude=${node.choice.point}`
          : node.choice?.mode === "nearest" || node.choice?.mode === "farthest"
            ? `,${node.choice.mode}=${node.choice.point}`
            : node.choice?.mode
              ? `,${node.choice.mode}`
              : "";
      return `intersection(${node.line},${node.circle}${suffix})`;
    }
    case "circleCircleIntersection": {
      const suffix =
        node.choice?.mode === "otherThan"
          ? `,exclude=${node.choice.point}`
          : node.choice?.mode === "nearest" || node.choice?.mode === "farthest"
            ? `,${node.choice.mode}=${node.choice.point}`
            : node.choice?.mode
              ? `,${node.choice.mode}`
              : "";
      return `intersection(${node.circleA},${node.circleB}${suffix})`;
    }
    case "circleCenterRadius":
      return `circle(${node.center},${node.radius})`;
    case "circleCenterPoint":
      return `circle(${node.center},distance(${node.center},${node.point}))`;
    case "circleThrough3Points":
      return `circle(${node.a},${node.b},${node.c})`;
    case "arcMidpointOnCircle":
      return `arcMidpoint(${node.circle},${node.b},${node.c}${node.excludePoint ? `,exclude=${node.excludePoint}` : ""})`;
  }
};

const constructionNodeDefinition = (node: ConstructionNode): string => `${node.id} = ${constructionNodeExpression(node)}`;

const fallbackConstructionStageLabel = (node: ConstructionNode): string => {
  switch (node.type) {
    case "freePoint":
      return "Stage 1";
    case "circumcenter":
    case "circleCenterRadius":
    case "circleCenterPoint":
    case "circleThrough3Points":
      return "Stage 2";
    case "midpoint":
    case "arcMidpointOnCircle":
      return "Stage 3";
    default:
      return "Stage 4";
  }
};

const checkReferencedIds = (check: ProblemCheckDef): string[] => {
  if (check.type === "pointOnCircle") return [check.point, check.circle];
  if (check.type === "collinear" || check.type === "concyclic") return [...check.points];
  if (check.type === "perpendicular" || check.type === "parallel") return [...check.lines];
  if (check.type === "equalLength") return [...check.segments[0], ...check.segments[1]];
  if (check.type === "equalAngle") return [...check.angles[0], ...check.angles[1]];
  if (check.type === "samePower") return [check.point, ...check.circles];
  return [];
};

const buildScriptFromState = (
  nodes: ConstructionNode[],
  checks: ProblemCheckDef[],
  constraints: ConstructionConstraintDef[] = []
) => {
  const nodeLines = nodes.map((node) => {
    switch (node.type) {
      case "freePoint":
        return `point ${node.id} ${node.point.x} ${node.point.y} ${node.point.z}`;
      case "lineThroughPoints":
        return `line ${node.a} ${node.b} as ${node.id}`;
      case "perpendicularLine":
        return `perp ${node.line} through ${node.point} as ${node.id}`;
      case "parallelLine":
        return `parallel ${node.line} through ${node.point} as ${node.id}`;
      case "perpendicularBisector":
        return `perp-bisector ${node.a} ${node.b} as ${node.id}`;
      case "angleBisector":
        return `angle-bisector ${node.vertex} ${node.a} ${node.c} as ${node.id}`;
      case "circleCenterPoint":
        return `circle ${node.center} ${node.point} as ${node.id}`;
      case "circleThrough3Points":
        return `circle3 ${node.a} ${node.b} ${node.c} as ${node.id}`;
      case "circumcenter":
        return `circumcenter ${node.a} ${node.b} ${node.c} as ${node.id}`;
      case "midpoint":
        return `midpoint ${node.a} ${node.b} as ${node.id}`;
      case "arcMidpointOnCircle":
        return node.excludePoint
          ? `arc-midpoint ${node.circle} ${node.b} ${node.c} exclude ${node.excludePoint} as ${node.id}`
          : `arc-midpoint ${node.circle} ${node.b} ${node.c} as ${node.id}`;
      case "lineLineIntersection":
        return `intersection ${node.lineA} ${node.lineB} as ${node.id}`;
      case "lineCircleIntersection":
        if (node.choice?.mode === "otherThan") {
          return `second-intersection ${node.line} ${node.circle} exclude ${node.choice.point} as ${node.id}`;
        }
        return `line-circle-intersection ${node.line} ${node.circle} as ${node.id}`;
      default:
        return `# unsupported ${node.type} ${node.id}`;
    }
  });

  const checkLines = checks.map((check) => {
    if (check.type === "pointOnCircle") return `check point-on-circle ${check.point} ${check.circle}`;
    if (check.type === "collinear") return `check collinear ${check.points[0]} ${check.points[1]} ${check.points[2]}`;
    if (check.type === "concyclic")
      return `check concyclic ${check.points[0]} ${check.points[1]} ${check.points[2]} ${check.points[3]}`;
    if (check.type === "perpendicular") return `check perpendicular ${check.lines[0]} ${check.lines[1]}`;
    if (check.type === "parallel") return `check parallel ${check.lines[0]} ${check.lines[1]}`;
    if (check.type === "equalLength")
      return `check equal-distance ${check.segments[0][0]} ${check.segments[0][1]} ${check.segments[1][0]} ${check.segments[1][1]}`;
    return `# unsupported check ${check.id}`;
  });

  const constraintLines = constraints.map((constraint) => {
    const disabled = constraint.enabled === false ? " disabled" : "";
    return `constraint ${constraint.type} ${constraint.targetId} ${constraint.sourceId}${disabled}`;
  });

  return [...nodeLines, ...constraintLines, ...checkLines].join("\n");
};

const parseCommandLine = (
  line: string,
  existingNodeIds: Set<string>,
  nextCheckIndex: number,
  nextConstraintIndex = 1
): ParseResult => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return { ok: true, summary: "comment/empty" };

  const rawTokens = trimmed.split(/\s+/);
  const asIndex = rawTokens.findIndex((token) => token.toLowerCase() === "as");
  const alias = asIndex >= 0 ? rawTokens[asIndex + 1] : undefined;
  const tokens = asIndex >= 0 ? rawTokens.slice(0, asIndex) : rawTokens;
  const head = (tokens[0] ?? "").toLowerCase();
  const makeId = (base: string) => uniqueId(alias || base, existingNodeIds);

  if (head === "point") {
    if (tokens.length >= 4 && Number.isFinite(Number(tokens[2])) && Number.isFinite(Number(tokens[3]))) {
      const id = uniqueId(tokens[1], existingNodeIds);
      const x = Number(tokens[2]);
      const y = Number(tokens[3]);
      const z = Number.isFinite(Number(tokens[4])) ? Number(tokens[4]) : 0;
      return {
        ok: true,
        summary: `free point ${id} = (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
        node: { id, label: id, type: "freePoint", point: { x, y, z }, style: { color: 0xef4444, size: 0.045 } },
      };
    }
    if (tokens.length >= 3 && Number.isFinite(Number(tokens[1])) && Number.isFinite(Number(tokens[2]))) {
      const id = makeId("P");
      const x = Number(tokens[1]);
      const y = Number(tokens[2]);
      const z = Number.isFinite(Number(tokens[3])) ? Number(tokens[3]) : 0;
      return {
        ok: true,
        summary: `free point ${id} = (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`,
        node: { id, label: id, type: "freePoint", point: { x, y, z }, style: { color: 0xef4444, size: 0.045 } },
      };
    }
    return { ok: false, error: "point command expects: point <id> <x> <y> [z] or point <x> <y> [z] as <id>" };
  }

  if (head === "line" && tokens.length >= 3) {
    const id = makeId(`${tokens[1]}${tokens[2]}`);
    return {
      ok: true,
      summary: `line ${id}: through ${tokens[1]}, ${tokens[2]}`,
      node: { id, label: id, type: "lineThroughPoints", a: tokens[1], b: tokens[2], style: { color: 0x6b7280, length: 6 } },
    };
  }
  if (head === "circle" && tokens.length >= 3) {
    const id = makeId("C");
    return {
      ok: true,
      summary: `circle ${id}: center ${tokens[1]}, point ${tokens[2]}`,
      node: { id, label: id, type: "circleCenterPoint", center: tokens[1], point: tokens[2], style: { color: 0x2563eb, segments: 96 } },
    };
  }
  if (head === "circle3" && tokens.length >= 4) {
    const id = makeId("Gamma");
    return {
      ok: true,
      summary: `circle ${id}: through ${tokens[1]}, ${tokens[2]}, ${tokens[3]}`,
      node: { id, label: id, type: "circleThrough3Points", a: tokens[1], b: tokens[2], c: tokens[3], style: { color: 0x7c3aed, segments: 96 } },
    };
  }
  if (head === "circumcircle" && tokens.length >= 4) {
    const id = makeId("Omega");
    return {
      ok: true,
      summary: `circumcircle ${id}: (${tokens[1]}, ${tokens[2]}, ${tokens[3]})`,
      node: { id, label: id, type: "circleThrough3Points", a: tokens[1], b: tokens[2], c: tokens[3], style: { color: 0x2563eb, segments: 96 } },
    };
  }
  if (head === "circumcenter" && tokens.length >= 4) {
    const id = makeId("O");
    return {
      ok: true,
      summary: `circumcenter ${id}: (${tokens[1]}, ${tokens[2]}, ${tokens[3]})`,
      node: { id, label: id, type: "circumcenter", a: tokens[1], b: tokens[2], c: tokens[3], style: { color: 0xf59e0b, size: 0.045 } },
    };
  }
  if (head === "midpoint" && tokens.length >= 3) {
    const id = makeId("M");
    return {
      ok: true,
      summary: `midpoint ${id}: ${tokens[1]}-${tokens[2]}`,
      node: { id, label: id, type: "midpoint", a: tokens[1], b: tokens[2], style: { color: 0x22c55e, size: 0.045 } },
    };
  }
  if (head === "arc-midpoint" && tokens.length >= 4) {
    const excludeIndex = tokens.findIndex((token) => token.toLowerCase() === "exclude");
    const excludePoint = excludeIndex >= 0 ? tokens[excludeIndex + 1] : undefined;
    const id = makeId("M");
    return {
      ok: true,
      summary: `arc midpoint ${id} on ${tokens[1]} with ${tokens[2]}, ${tokens[3]}${excludePoint ? ` excluding ${excludePoint}` : ""}`,
      node: { id, label: id, type: "arcMidpointOnCircle", circle: tokens[1], b: tokens[2], c: tokens[3], excludePoint, style: { color: 0x22c55e, size: 0.05 } },
    };
  }
  if (head === "perp-bisector" && tokens.length >= 3) {
    const id = makeId(`bis${tokens[1]}${tokens[2]}`);
    return {
      ok: true,
      summary: `perp bisector ${id}: ${tokens[1]}-${tokens[2]}`,
      node: { id, label: id, type: "perpendicularBisector", a: tokens[1], b: tokens[2], style: { color: 0x0891b2, length: 6 } },
    };
  }
  if (head === "perp" && tokens.length >= 4) {
    const throughIndex = tokens.findIndex((token) => token.toLowerCase() === "through");
    if (throughIndex < 0 || throughIndex + 1 >= tokens.length) {
      return { ok: false, error: "perp command expects: perp <lineId> through <pointId> [as <id>]" };
    }
    const lineId = tokens[1];
    const pointId = tokens[throughIndex + 1];
    const id = makeId(`${pointId}_perp_${lineId}`);
    return {
      ok: true,
      summary: `perpendicular line ${id}: through ${pointId} to ${lineId}`,
      node: { id, label: id, type: "perpendicularLine", line: lineId, point: pointId, style: { color: 0x0f766e, length: 6 } },
    };
  }
  if (head === "parallel" && tokens.length >= 4) {
    const throughIndex = tokens.findIndex((token) => token.toLowerCase() === "through");
    if (throughIndex < 0 || throughIndex + 1 >= tokens.length) {
      return { ok: false, error: "parallel command expects: parallel <lineId> through <pointId> [as <id>]" };
    }
    const lineId = tokens[1];
    const pointId = tokens[throughIndex + 1];
    const id = makeId(`${pointId}_parallel_${lineId}`);
    return {
      ok: true,
      summary: `parallel line ${id}: through ${pointId} to ${lineId}`,
      node: { id, label: id, type: "parallelLine", line: lineId, point: pointId, style: { color: 0x7c3aed, length: 6 } },
    };
  }
  if (head === "angle-bisector" && tokens.length >= 4) {
    const id = makeId(`bis${tokens[2]}${tokens[1]}${tokens[3]}`);
    return {
      ok: true,
      summary: `angle bisector ${id}: at ${tokens[1]} between ${tokens[2]} and ${tokens[3]}`,
      node: {
        id,
        label: id,
        type: "angleBisector",
        vertex: tokens[1],
        a: tokens[2],
        c: tokens[3],
        style: { color: 0xa855f7, length: 6 },
      },
    };
  }
  if (head === "intersection" && tokens.length >= 3) {
    const id = makeId("X");
    return {
      ok: true,
      summary: `intersection ${id}: ${tokens[1]} x ${tokens[2]}`,
      node: { id, label: id, type: "lineLineIntersection", lineA: tokens[1], lineB: tokens[2], style: { color: 0xdc2626, size: 0.05 } },
    };
  }
  if (head === "second-intersection" && tokens.length >= 3) {
    const excludeIndex = tokens.findIndex((token) => token.toLowerCase() === "exclude");
    const excludePoint = excludeIndex >= 0 ? tokens[excludeIndex + 1] : "";
    if (!excludePoint) return { ok: false, error: "second-intersection expects: second-intersection <line> <circle> exclude <point> [as <id>]" };
    const id = makeId("P");
    return {
      ok: true,
      summary: `second intersection ${id}: ${tokens[1]} with ${tokens[2]}, excluding ${excludePoint}`,
      node: {
        id,
        label: id,
        type: "lineCircleIntersection",
        line: tokens[1],
        circle: tokens[2],
        choice: { mode: "otherThan", point: excludePoint },
        style: { color: 0xf97316, size: 0.045 },
      },
    };
  }

  if (head === "check" && tokens.length >= 2) {
    const checkType = (tokens[1] ?? "").toLowerCase();
    if (checkType === "point-on-circle" && tokens.length >= 4) {
      return {
        ok: true,
        summary: `check point-on-circle ${tokens[2]} ${tokens[3]}`,
        check: { id: `check_${nextCheckIndex}`, label: `${tokens[2]} on ${tokens[3]}`, type: "pointOnCircle", point: tokens[2], circle: tokens[3], tolerance: 2e-3 },
      };
    }
    if (checkType === "collinear" && tokens.length >= 5) {
      return {
        ok: true,
        summary: `check collinear ${tokens[2]} ${tokens[3]} ${tokens[4]}`,
        check: { id: `check_${nextCheckIndex}`, label: `${tokens[2]},${tokens[3]},${tokens[4]} collinear`, type: "collinear", points: [tokens[2], tokens[3], tokens[4]], tolerance: 1e-3 },
      };
    }
    if (checkType === "concyclic" && tokens.length >= 6) {
      return {
        ok: true,
        summary: `check concyclic ${tokens[2]} ${tokens[3]} ${tokens[4]} ${tokens[5]}`,
        check: { id: `check_${nextCheckIndex}`, label: `${tokens[2]},${tokens[3]},${tokens[4]},${tokens[5]} concyclic`, type: "concyclic", points: [tokens[2], tokens[3], tokens[4], tokens[5]], tolerance: 2e-3 },
      };
    }
    if (checkType === "perpendicular" && tokens.length >= 4) {
      return {
        ok: true,
        summary: `check perpendicular ${tokens[2]} ${tokens[3]}`,
        check: { id: `check_${nextCheckIndex}`, label: `${tokens[2]} perpendicular ${tokens[3]}`, type: "perpendicular", lines: [tokens[2], tokens[3]], toleranceDeg: 0.6 },
      };
    }
    if (checkType === "parallel" && tokens.length >= 4) {
      return {
        ok: true,
        summary: `check parallel ${tokens[2]} ${tokens[3]}`,
        check: { id: `check_${nextCheckIndex}`, label: `${tokens[2]} parallel ${tokens[3]}`, type: "parallel", lines: [tokens[2], tokens[3]], toleranceDeg: 0.6 },
      };
    }
    if (checkType === "equal-distance" && tokens.length >= 6) {
      return {
        ok: true,
        summary: `check equal-distance ${tokens[2]} ${tokens[3]} ${tokens[4]} ${tokens[5]}`,
        check: { id: `check_${nextCheckIndex}`, label: `|${tokens[2]}${tokens[3]}| = |${tokens[4]}${tokens[5]}|`, type: "equalLength", segments: [[tokens[2], tokens[3]], [tokens[4], tokens[5]]], tolerance: 2e-3 },
      };
    }
    return { ok: false, error: "Unsupported check command." };
  }

  if ((head === "constraint" || head === "constrain") && tokens.length >= 4) {
    const rawType = (tokens[1] ?? "").toLowerCase();
    const typeMap: Record<string, ConstructionConstraintDef["type"]> = {
      parallel: "parallel",
      perpendicular: "perpendicular",
      perp: "perpendicular",
      "equal-length": "equalLength",
      equallength: "equalLength",
      "equal-distance": "equalLength",
      "equal-radius": "equalRadius",
      equalradius: "equalRadius",
      coincident: "coincident",
      concentric: "concentric",
      tangent: "tangent",
    };
    const type = typeMap[rawType];
    if (!type) {
      return { ok: false, error: "constraint expects type: parallel, perpendicular, equal-length, equal-radius, coincident, concentric, tangent." };
    }
    const targetId = tokens[2];
    const sourceId = tokens[3];
    const disabled = tokens.some((token) => token.toLowerCase() === "disabled");
    const id = cleanId(alias || `constraint_${nextConstraintIndex}_${type}_${targetId}_${sourceId}`);
    return {
      ok: true,
      summary: `constraint ${targetId} ${CONSTRAINT_TYPE_LABELS[type]} ${sourceId}`,
      constraint: {
        id,
        label: `${targetId} ${CONSTRAINT_TYPE_LABELS[type]} ${sourceId}`,
        type,
        targetId,
        sourceId,
        enabled: disabled ? false : undefined,
      },
    };
  }

  return { ok: false, error: `Unsupported command: ${trimmed}` };
};

const parseSceneScript = (script: string) => {
  const draftNodes: ConstructionNode[] = [];
  const draftChecks: ProblemCheckDef[] = [];
  const draftConstraints: ConstructionConstraintDef[] = [];
  const ids = new Set<string>();

  const lines = script.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const parsed = parseCommandLine(line, ids, draftChecks.length + 1, draftConstraints.length + 1);
    if (!parsed.ok) {
      return { nodes: draftNodes, checks: draftChecks, constraints: draftConstraints, error: `Line ${i + 1}: ${parsed.error}` };
    }
    if (parsed.node) {
      draftNodes.push(parsed.node);
      ids.add(parsed.node.id);
    }
    if (parsed.check) {
      draftChecks.push(parsed.check);
    }
    if (parsed.constraint) {
      draftConstraints.push(parsed.constraint);
    }
  }
  return { nodes: draftNodes, checks: draftChecks, constraints: draftConstraints, error: null as string | null };
};

const buildScriptSymbols = (script: string): ScriptSymbol[] => {
  const symbols: ScriptSymbol[] = [];
  const ids = new Set<string>();
  const lines = script.split(/\r?\n/);
  let claimCount = 0;
  let constraintCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parsed = parseCommandLine(trimmed, ids, claimCount + 1, constraintCount + 1);
    if (!parsed.ok) break;

    if (parsed.node) {
      ids.add(parsed.node.id);
      symbols.push({
        id: parsed.node.id,
        label: parsed.node.label ?? parsed.node.id,
        kind: scriptSymbolKindForNode(parsed.node),
        line: i + 1,
        summary: parsed.summary,
        dependencies: nodeDependencies(parsed.node),
        usedBy: [],
      });
    }

    if (parsed.check) {
      claimCount += 1;
      symbols.push({
        id: parsed.check.id,
        label: parsed.check.label,
        kind: "claim",
        line: i + 1,
        summary: parsed.summary,
        dependencies: checkReferencedIds(parsed.check),
        usedBy: [],
      });
    }

    if (parsed.constraint) {
      constraintCount += 1;
      symbols.push({
        id: parsed.constraint.id,
        label: parsed.constraint.label ?? parsed.constraint.id,
        kind: "constraint",
        line: i + 1,
        summary: parsed.summary,
        dependencies: [parsed.constraint.targetId, parsed.constraint.sourceId],
        usedBy: [],
      });
    }
  }

  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  for (const symbol of symbols) {
    for (const dep of symbol.dependencies) {
      const target = byId.get(dep);
      if (target && !target.usedBy.includes(symbol.id)) target.usedBy.push(symbol.id);
    }
  }

  return symbols;
};

const DEFAULT_INITIAL_SCENE = (() => {
  const parsed = parseSceneScript(DEFAULT_OLYMPIAD_ARC_SCRIPT);
  if (!parsed.error && parsed.nodes.length > 0) {
    return {
      nodes: parsed.nodes,
      checks: parsed.checks,
      constraints: parsed.constraints,
      script: DEFAULT_OLYMPIAD_ARC_SCRIPT,
    };
  }
  return {
    nodes: DEFAULT_FREE_POINTS,
    checks: [] as ProblemCheckDef[],
    constraints: [] as ConstructionConstraintDef[],
    script: buildScriptFromState(DEFAULT_FREE_POINTS, []),
  };
})();

const normalizeConstructionSeed = (seed: ConstructionLabSeed | null | undefined) => {
  if (!seed || !Array.isArray(seed.nodes) || !Array.isArray(seed.checkDefs) || !seed.nodes.length) return null;
  const nodes = seed.nodes.map((node) => ({ ...node }));
  const checks = seed.checkDefs.map((check) => ({ ...check }));
  const constraints = Array.isArray(seed.constraints) ? seed.constraints.map((constraint) => ({ ...constraint })) : [];
  const selectedNodeId =
    typeof seed.selectedNodeId === "string" && nodes.some((node) => node.id === seed.selectedNodeId)
      ? seed.selectedNodeId
      : nodes[0].id;
  const scriptText =
    typeof seed.scriptText === "string" && seed.scriptText.trim().length
      ? seed.scriptText
      : buildScriptFromState(nodes, checks, constraints);
  const solids = Array.isArray(seed.solids)
    ? seed.solids
        .filter((solid): solid is ScratchSolid =>
          !!solid && ["box", "sphere", "cylinder", "cone"].includes(solid.type)
        )
        .map((solid) => ({
          ...solid,
          params: { ...solid.params },
          transform: {
            position: { ...solid.transform.position },
            rotation: { ...solid.transform.rotation },
            scale: { ...solid.transform.scale },
          },
          material: { ...solid.material },
        }))
    : [];
  const selectedSolidId =
    typeof seed.selectedSolidId === "string" && solids.some((solid) => solid.id === seed.selectedSolidId)
      ? seed.selectedSolidId
      : null;
  return { nodes, checks, constraints, selectedNodeId, scriptText, solids, selectedSolidId };
};

const loadPresets = (): ScriptPreset[] => {
  try {
    const raw = globalThis.localStorage?.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        name: String(entry?.name ?? ""),
        script: String(entry?.script ?? ""),
        savedAt: Number(entry?.savedAt ?? Date.now()),
      }))
      .filter((entry) => entry.name.length > 0 && entry.script.length > 0);
  } catch {
    return [];
  }
};

const savePresets = (presets: ScriptPreset[]) => {
  try {
    globalThis.localStorage?.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore storage failures
  }
};

export const ConstructionLabPanel: React.FC<ConstructionLabPanelProps> = ({
  onChange,
  proceduralSceneScriptText: controlledProceduralSceneScriptText,
  onProceduralSceneScriptTextChange,
  onRunProceduralSceneScript,
  proceduralSceneScriptStatus,
  proceduralSceneScriptError,
  onPointPlacementModeChange,
  viewportPickPoint = null,
  viewportPickMeshKey = null,
  onViewportPickConsumed,
  viewportMovePoint = null,
  onViewportMoveConsumed,
  onFocusObjectInScene,
  seed = null,
  workspaceTab: controlledWorkspaceTab,
  onWorkspaceTabChange,
  hideWorkspaceTabs = false,
  hideScriptInspector = false,
  scriptInspectorPortalTarget = null,
  onHoverObjectIds,
}) => {
  const seededState = normalizeConstructionSeed(seed);
  const [nodes, setNodes] = useState<ConstructionNode[]>(() =>
    seededState?.nodes ?? DEFAULT_INITIAL_SCENE.nodes.map((node) => ({ ...node }))
  );
  const [checkDefs, setCheckDefs] = useState<ProblemCheckDef[]>(() =>
    seededState?.checks ?? DEFAULT_INITIAL_SCENE.checks.map((check) => ({ ...check }))
  );
  const [constraints, setConstraints] = useState<ConstructionConstraintDef[]>(() =>
    seededState?.constraints ?? DEFAULT_INITIAL_SCENE.constraints.map((constraint) => ({ ...constraint }))
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => seededState?.selectedNodeId ?? DEFAULT_INITIAL_SCENE.nodes[0]?.id ?? "");
  const [solids, setSolids] = useState<ScratchSolid[]>(() => seededState?.solids ?? []);
  const [selectedSolidId, setSelectedSolidId] = useState<string | null>(() => seededState?.selectedSolidId ?? null);
  const [objectSearchQuery, setObjectSearchQuery] = useState("");

  const [buildMode, setBuildMode] = useState<BuildMode>("create");
  const [workspaceTabState, setWorkspaceTabState] = useState<ConstructionWorkspaceTab>("build");
  const [tool, setTool] = useState<ToolKind>("point");
  const [scratchPlacementKind, setScratchPlacementKind] = useState<ScratchPlacementKind | null>("point");
  const [toolForm, setToolForm] = useState<Record<string, string>>({});
  const [toolError, setToolError] = useState<string | null>(null);

  const [checkKind, setCheckKind] = useState<CheckKind>("pointOnCircle");
  const [checkForm, setCheckForm] = useState<Record<string, string>>({});
  const [checkError, setCheckError] = useState<string | null>(null);

  const [sceneName, setSceneName] = useState("Olympiad construction");
  const [sceneType, setSceneType] = useState<SceneType>("task");
  const [sceneMode, setSceneMode] = useState<SceneMode>("plane2d");
  const [sceneMetadata, setSceneMetadata] = useState(
    "Construct X as in the embedded olympiad-style arc problem."
  );
  const [scriptSyncMode, setScriptSyncMode] = useState<ScriptSyncMode>("overwrite");
  const [claimsSortMode, setClaimsSortMode] = useState<ClaimsSortMode>("status");
  const [disabledCheckIds, setDisabledCheckIds] = useState<Set<string>>(() => new Set());
  const [helpersVisible, setHelpersVisible] = useState(true);
  const [highlightRequiredInputs, setHighlightRequiredInputs] = useState(false);
  const [selectionAId, setSelectionAId] = useState("");
  const [selectionBId, setSelectionBId] = useState("");
  const [scriptSurfaceTab, setScriptSurfaceTab] = useState<ScriptSurfaceTab>("construction");
  const [scriptInspectorTab, setScriptInspectorTab] = useState<ScriptInspectorTab>("dependencies");
  const [selectedScriptTemplate, setSelectedScriptTemplate] = useState(SCRIPT_TEMPLATES[0]?.command ?? "");
  const [scriptTemplatesOpen, setScriptTemplatesOpen] = useState(false);
  const [lockedNodeIds, setLockedNodeIds] = useState<Set<string>>(() => new Set());
  const [helperNodeIds, setHelperNodeIds] = useState<Set<string>>(() => new Set());
  const [claimExplainId, setClaimExplainId] = useState<string | null>(null);
  const importSceneInputRef = useRef<HTMLInputElement | null>(null);
  const scriptEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const scriptLineGutterRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<{ stack: ConstructionHistoryState[]; index: number; applying: boolean }>({
    stack: [],
    index: -1,
    applying: false,
  });

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInput, setPaletteInput] = useState("");
  const [paletteError, setPaletteError] = useState<string | null>(null);

  const [scriptText, setScriptText] = useState<string>(() => seededState?.scriptText ?? DEFAULT_INITIAL_SCENE.script);
  const [localProceduralSceneScriptText, setLocalProceduralSceneScriptText] = useState(PROCEDURAL_SCENE_SCRIPT_STARTER);
  const proceduralSceneScriptText = controlledProceduralSceneScriptText ?? localProceduralSceneScriptText;
  const setProceduralSceneScriptText = useCallback(
    (script: string) => {
      setLocalProceduralSceneScriptText(script);
      onProceduralSceneScriptTextChange?.(script);
    },
    [onProceduralSceneScriptTextChange]
  );
  const [automationScriptText, setAutomationScriptText] = useState(AUTOMATION_SCRIPT_STARTER);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptCursorLine, setScriptCursorLine] = useState(1);
  const [selectedScriptSymbolId, setSelectedScriptSymbolId] = useState<string | null>(null);
  const [selectedScriptStageIndex, setSelectedScriptStageIndex] = useState<number | null>(null);
  const [foldedScriptStageKeys, setFoldedScriptStageKeys] = useState<Set<number>>(() => new Set());
  const [highlightedStageObjectIds, setHighlightedStageObjectIds] = useState<Set<string>>(() => new Set());
  const [scriptRunStepIndex, setScriptRunStepIndex] = useState(0);
  const [scriptDebugMode, setScriptDebugMode] = useState(false);
  const [scriptAnimating, setScriptAnimating] = useState(false);
  const scriptAnimationTimerRef = useRef<number | null>(null);
  const [presetName, setPresetName] = useState("my-scene");
  const [presets, setPresets] = useState<ScriptPreset[]>(() => loadPresets());
  const [selectedPresetName, setSelectedPresetName] = useState(BUILTIN_TASK_PRESET_NAME);
  const workspaceTab = controlledWorkspaceTab ?? workspaceTabState;
  const setWorkspaceTab = useCallback(
    (tab: ConstructionWorkspaceTab) => {
      if (controlledWorkspaceTab == null) setWorkspaceTabState(tab);
      onWorkspaceTabChange?.(tab);
    },
    [controlledWorkspaceTab, onWorkspaceTabChange]
  );

  const nodesForSolve = useMemo(
    () =>
      nodes.map((node) => {
        const hidden = !helpersVisible && helperNodeIds.has(node.id);
        if (!highlightedStageObjectIds.size) return hidden ? { ...node, hidden: true } : node;
        const highlighted = highlightedStageObjectIds.has(node.id);
        return {
          ...node,
          hidden: hidden || node.hidden,
          style: {
            ...node.style,
            opacity: highlighted ? 1 : 0.16,
            size: highlighted && node.style?.size ? node.style.size * 1.35 : node.style?.size,
            radiusScale: highlighted ? (node.style?.radiusScale ?? 1) * 1.2 : node.style?.radiusScale,
          },
        };
      }),
    [helperNodeIds, helpersVisible, highlightedStageObjectIds, nodes]
  );
  const solved = useMemo(() => evaluateConstructionGraph(nodesForSolve, constraints), [constraints, nodesForSolve]);
  const activeCheckDefs = useMemo(
    () => checkDefs.filter((check) => !disabledCheckIds.has(check.id)),
    [checkDefs, disabledCheckIds]
  );
  const checkResults = useMemo(() => evaluateProblemChecks(solved, activeCheckDefs), [solved, activeCheckDefs]);
  const labels = useMemo(() => buildPointLabelSet(solved.points), [solved.points]);
  const presetOptions = useMemo(() => {
    const userPresets = presets.filter((preset) => preset.name !== BUILTIN_TASK_PRESET_NAME);
    return [
      { name: BUILTIN_TASK_PRESET_NAME, script: DEFAULT_OLYMPIAD_ARC_SCRIPT, savedAt: 0 },
      ...userPresets,
    ];
  }, [presets]);
  const selectedPresetIsBuiltin = selectedPresetName === BUILTIN_TASK_PRESET_NAME;

  useEffect(() => {
    onChange({
      scene: solved.scene,
      labels,
      checks: checkResults,
      graphObjects: solved.objects,
      points: solved.points,
      lines: solved.lines,
      circles: solved.circles,
      errors: solved.errors,
      nodes,
      checkDefs,
      constraints,
      selectedNodeId,
      scriptText,
      solids,
      selectedSolidId,
    });
  }, [onChange, solved, labels, checkResults, nodes, checkDefs, constraints, selectedNodeId, scriptText, solids, selectedSolidId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScratchPlacementKind(null);
        setBuildMode("select");
        return;
      }
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!isPaletteShortcut) return;
      event.preventDefault();
      setWorkspaceTab("script");
      setPaletteOpen(true);
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(
    () => () => {
      if (scriptAnimationTimerRef.current != null) {
        window.clearTimeout(scriptAnimationTimerRef.current);
      }
    },
    []
  );

  const pointIds = useMemo(() => nodes.filter(isPointNode).map((node) => node.id), [nodes]);
  const lineIds = useMemo(() => nodes.filter(isLineNode).map((node) => node.id), [nodes]);
  const circleIds = useMemo(() => nodes.filter(isCircleNode).map((node) => node.id), [nodes]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const selectedSolid = useMemo(
    () => solids.find((solid) => solid.id === selectedSolidId) ?? null,
    [selectedSolidId, solids]
  );
  const selectedGraphObject = useMemo(
    () => solved.objects.find((entry) => entry.id === selectedNodeId) ?? null,
    [solved.objects, selectedNodeId]
  );

  const selectedNodeParameters = useMemo(
    () =>
      selectedNode
        ? Object.entries(selectedNode).filter(
            ([key]) => !["id", "label", "type", "hidden", "style"].includes(key)
          )
        : [],
    [selectedNode]
  );
  const selectedNodeLocked = !!(selectedNode && lockedNodeIds.has(selectedNode.id));
  const selectedNodeHelper = !!(selectedNode && helperNodeIds.has(selectedNode.id));
  const selectedNodeUsedBy = useMemo(() => {
    if (!selectedNode) return [] as string[];
    return nodes
      .filter((node) => node.id !== selectedNode.id && nodeDependencies(node).includes(selectedNode.id))
      .map((node) => node.id);
  }, [nodes, selectedNode]);
  const selectedNodeUsedByClaims = useMemo(() => {
    if (!selectedNode) return [] as string[];
    return checkDefs
      .filter((check) => checkReferencedIds(check).includes(selectedNode.id))
      .map((check) => check.label);
  }, [checkDefs, selectedNode]);
  const selectedNodeUsedByConstraints = useMemo(() => {
    if (!selectedNode) return [] as string[];
    return constraints
      .filter((constraint) => constraint.sourceId === selectedNode.id || constraint.targetId === selectedNode.id)
      .map((constraint) => constraint.label ?? constraint.id);
  }, [constraints, selectedNode]);
  const graphObjectById = useMemo(() => {
    const map = new Map<string, ConstructionObjectSummary>();
    for (const obj of solved.objects) map.set(obj.id, obj);
    return map;
  }, [solved.objects]);
  const nodeById = useMemo(() => {
    const map = new Map<string, ConstructionNode>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);
  const normalizedObjectSearchQuery = objectSearchQuery.trim().toLowerCase();
  const objectMatchesSearch = useCallback(
    (id: string) => {
      if (!normalizedObjectSearchQuery) return true;
      const node = nodeById.get(id);
      const obj = graphObjectById.get(id);
      const searchable = [
        id,
        node?.label,
        obj?.label,
        obj?.type,
        obj?.summary,
        node ? constructionNodeTypeLabel(node) : "",
        node ? constructionNodeDefinition(node) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedObjectSearchQuery);
    },
    [graphObjectById, nodeById, normalizedObjectSearchQuery]
  );
  const filteredSolvedObjects = useMemo(
    () => solved.objects.filter((obj) => objectMatchesSearch(obj.id)),
    [objectMatchesSearch, solved.objects]
  );
  const filteredConstructionNodes = useMemo(
    () => nodes.filter((node) => objectMatchesSearch(node.id)),
    [nodes, objectMatchesSearch]
  );

  const checkDefById = useMemo(() => {
    const map = new Map<string, ProblemCheckDef>();
    for (const check of checkDefs) map.set(check.id, check);
    return map;
  }, [checkDefs]);

  const scriptParsePreview = useMemo(() => parseSceneScript(scriptText), [scriptText]);
  const proceduralScriptPreview = useMemo(() => parseProceduralSceneScript(proceduralSceneScriptText), [proceduralSceneScriptText]);
  const automationScriptPreview = useMemo(() => parseAutomationTimelineScript(automationScriptText), [automationScriptText]);
  const scriptDiagnostics = useMemo(() => {
    const diagnostics: Array<{ line: number; kind: "error" | "warning"; message: string }> = [];
    const ids = new Set<string>();
    let objectCount = 0;
    let claimCount = 0;
    let constraintCount = 0;
    const lines = scriptText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parsed = parseCommandLine(trimmed, ids, claimCount + 1, constraintCount + 1);
      if (!parsed.ok) {
        diagnostics.push({ line: i + 1, kind: "error", message: parsed.error });
        break;
      }
      if (parsed.node) {
        if (ids.has(parsed.node.id)) {
          diagnostics.push({ line: i + 1, kind: "warning", message: `Alias ${parsed.node.id} already exists.` });
        }
        ids.add(parsed.node.id);
        objectCount += 1;
      }
      if (parsed.check) claimCount += 1;
      if (parsed.constraint) constraintCount += 1;
    }
    return {
      parsedSteps: objectCount + claimCount + constraintCount,
      objectCount,
      claimCount,
      constraintCount,
      warnings: diagnostics.filter((d) => d.kind === "warning"),
      errors: diagnostics.filter((d) => d.kind === "error"),
      diagnostics,
    };
  }, [scriptText]);
  const scriptLineNumbers = useMemo(() => {
    const count = Math.max(1, scriptText.split(/\r?\n/).length);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [scriptText]);
  const scriptOutline = useMemo(() => buildConstructionScriptOutline(scriptText), [scriptText]);
  const scriptSymbols = useMemo(() => buildScriptSymbols(scriptText), [scriptText]);
  const scriptSymbolById = useMemo(() => {
    const map = new Map<string, ScriptSymbol>();
    for (const symbol of scriptSymbols) map.set(symbol.id, symbol);
    return map;
  }, [scriptSymbols]);
  const scriptSymbolsByKind = useMemo(() => {
    const grouped: Record<ScriptSymbolKind, ScriptSymbol[]> = {
      point: [],
      line: [],
      circle: [],
      claim: [],
      constraint: [],
      object: [],
    };
    for (const symbol of scriptSymbols) grouped[symbol.kind].push(symbol);
    return grouped;
  }, [scriptSymbols]);
  const scriptStageSections = useMemo<ScriptStageSection[]>(() => {
    const totalLines = Math.max(1, scriptText.split(/\r?\n/).length);
    return scriptOutline.map((entry, index) => {
      const next = scriptOutline[index + 1];
      const endLine = next ? Math.max(entry.line, next.line - 1) : totalLines;
      return {
        index,
        label: entry.label,
        line: entry.line,
        endLine,
        symbols: scriptSymbols.filter((symbol) => symbol.line >= entry.line && symbol.line <= endLine),
      };
    });
  }, [scriptOutline, scriptSymbols, scriptText]);
  const nodeStageById = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of scriptStageSections) {
      const stageMatch = section.label.match(/stage\s+(\d+)/i);
      const label = stageMatch ? `Stage ${stageMatch[1]}` : section.label;
      for (const symbol of section.symbols) {
        if (symbol.kind !== "claim" && symbol.kind !== "constraint") map.set(symbol.id, label);
      }
    }
    return map;
  }, [scriptStageSections]);
  const scriptObjectStats = useMemo(
    () => ({
      points: scriptSymbolsByKind.point.length,
      lines: scriptSymbolsByKind.line.length,
      circles: scriptSymbolsByKind.circle.length,
      claims: scriptSymbolsByKind.claim.length,
      dependencies: scriptSymbols.reduce((total, symbol) => total + symbol.dependencies.length, 0),
    }),
    [scriptSymbols, scriptSymbolsByKind]
  );
  const scriptStageStatsByIndex = useMemo(() => {
    const map = new Map<
      number,
      {
        points: number;
        lines: number;
        circles: number;
        objects: number;
        dependencies: number;
        claims: number;
      }
    >();
    for (const stage of scriptStageSections) {
      map.set(stage.index, {
        points: stage.symbols.filter((symbol) => symbol.kind === "point").length,
        lines: stage.symbols.filter((symbol) => symbol.kind === "line").length,
        circles: stage.symbols.filter((symbol) => symbol.kind === "circle").length,
        objects: stage.symbols.filter((symbol) => symbol.kind === "object").length,
        dependencies: stage.symbols.reduce((total, symbol) => total + symbol.dependencies.length, 0),
        claims: stage.symbols.filter((symbol) => symbol.kind === "claim").length,
      });
    }
    return map;
  }, [scriptStageSections]);
  const executableScriptLines = useMemo(
    () => scriptSymbols.map((symbol) => symbol.line).filter((line, index, lines) => lines.indexOf(line) === index),
    [scriptSymbols]
  );
  const hiddenScriptNodeIds = useMemo(() => new Set(nodes.filter((node) => node.hidden).map((node) => node.id)), [nodes]);
  const upgradedScriptDiagnostics = useMemo(() => {
    const diagnostics: UpgradedScriptDiagnostic[] = [
      ...scriptDiagnostics.errors.map((diag) => ({
        level: "error" as const,
        line: diag.line,
        title: "Script error",
        message: diag.message,
      })),
      ...scriptDiagnostics.warnings.map((diag) => ({
        level: "warning" as const,
        line: diag.line,
        title: "Script warning",
        message: diag.message,
      })),
    ];

    for (const symbol of scriptSymbols) {
      if (symbol.kind !== "claim" && symbol.kind !== "constraint" && symbol.usedBy.length === 0) {
        diagnostics.push({
          level: "hint",
          line: symbol.line,
          title: "Unused object",
          message: `${symbol.id} is not referenced by another object or claim.`,
          symbolId: symbol.id,
        });
      }
      if (symbol.kind !== "claim" && symbol.kind !== "constraint" && symbol.id.length <= 1 && symbol.line > 3) {
        diagnostics.push({
          level: "hint",
          line: symbol.line,
          title: "Object name too generic",
          message: `${symbol.id} may be harder to scan in longer theorem scripts.`,
          symbolId: symbol.id,
        });
      }
    }

    for (const claim of scriptSymbolsByKind.claim) {
      for (const dep of claim.dependencies) {
        if (hiddenScriptNodeIds.has(dep)) {
          diagnostics.push({
            level: "warning",
            line: claim.line,
            title: "Claim references hidden object",
            message: `${claim.label} references hidden object ${dep}.`,
            symbolId: claim.id,
          });
        }
      }
    }

    if (!scriptOutline.length) {
      diagnostics.push({
        level: "hint",
        line: null,
        title: "Add stage comments",
        message: "Use comments like # Stage 1 Triangle to improve Outline labels.",
      });
    }

    return diagnostics;
  }, [hiddenScriptNodeIds, scriptDiagnostics.errors, scriptDiagnostics.warnings, scriptOutline.length, scriptSymbols, scriptSymbolsByKind.claim]);
  const upgradedDiagnosticCounts = useMemo(
    () => ({
      errors: upgradedScriptDiagnostics.filter((diag) => diag.level === "error").length,
      warnings: upgradedScriptDiagnostics.filter((diag) => diag.level === "warning").length,
      hints: upgradedScriptDiagnostics.filter((diag) => diag.level === "hint").length,
    }),
    [upgradedScriptDiagnostics]
  );
  const activeScriptOutlineIndex = useMemo(() => {
    let active = 0;
    for (let i = 0; i < scriptOutline.length; i++) {
      if (scriptOutline[i].line <= scriptCursorLine) active = i;
      else break;
    }
    return active;
  }, [scriptCursorLine, scriptOutline]);
  const displayedScriptStageIndex =
    selectedScriptStageIndex != null && selectedScriptStageIndex >= 0 && selectedScriptStageIndex < scriptStageSections.length
      ? selectedScriptStageIndex
      : activeScriptOutlineIndex;
  const cursorScriptSymbol = useMemo(
    () => scriptSymbols.find((symbol) => symbol.line === scriptCursorLine) ?? null,
    [scriptCursorLine, scriptSymbols]
  );
  const selectedScriptSymbol = useMemo(
    () => (selectedScriptSymbolId ? scriptSymbolById.get(selectedScriptSymbolId) ?? null : null) ?? cursorScriptSymbol,
    [cursorScriptSymbol, scriptSymbolById, selectedScriptSymbolId]
  );
  const selectedScriptNode = useMemo(
    () => (selectedScriptSymbol ? nodes.find((node) => node.id === selectedScriptSymbol.id) ?? null : null),
    [nodes, selectedScriptSymbol]
  );
  const selectedScriptDependents = useMemo(
    () =>
      selectedScriptSymbol
        ? selectedScriptSymbol.usedBy.filter((id) => {
            const symbol = scriptSymbolById.get(id);
            return !!symbol && symbol.kind !== "claim" && symbol.kind !== "constraint";
          })
        : [],
    [scriptSymbolById, selectedScriptSymbol]
  );
  const selectedScriptClaims = useMemo(
    () =>
      selectedScriptSymbol
        ? selectedScriptSymbol.usedBy.filter((id) => scriptSymbolById.get(id)?.kind === "claim")
        : [],
    [scriptSymbolById, selectedScriptSymbol]
  );
  const currentScriptLineText = useMemo(
    () => scriptText.split(/\r?\n/)[Math.max(0, scriptCursorLine - 1)] ?? "",
    [scriptCursorLine, scriptText]
  );
  const currentScriptCommandPrefix = useMemo(() => {
    const trimmed = currentScriptLineText.trimStart();
    if (!trimmed || trimmed.startsWith("#")) return "";
    const firstToken = trimmed.split(/\s+/)[0] ?? "";
    return firstToken.toLowerCase();
  }, [currentScriptLineText]);
  const activeCommandSuggestions = useMemo(() => {
    if (!currentScriptCommandPrefix) return scriptCommandSuggestions.slice(0, 6);
    return scriptCommandSuggestions
      .filter((suggestion) => suggestion.toLowerCase().startsWith(currentScriptCommandPrefix))
      .slice(0, 6);
  }, [currentScriptCommandPrefix]);
  const updateScriptCursorLine = useCallback(() => {
    const textarea = scriptEditorRef.current;
    if (!textarea) return;
    const nextLine = scriptText.slice(0, textarea.selectionStart).split(/\r?\n/).length;
    setScriptCursorLine(Math.max(1, nextLine));
    setSelectedScriptSymbolId(null);
    setSelectedScriptStageIndex(null);
    setHighlightedStageObjectIds(new Set());
  }, [scriptText]);
  const syncScriptLineGutterScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    if (scriptLineGutterRef.current) {
      scriptLineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }, []);

  const explainCheckInputs = useCallback((checkId: string) => {
    const check = checkDefById.get(checkId);
    if (!check) return "No check definition.";
    const resolved = (id: string) => graphObjectById.get(id)?.summary ?? "(missing)";
    if (check.type === "pointOnCircle") {
      return `point ${check.point}: ${resolved(check.point)} | circle ${check.circle}: ${resolved(check.circle)}`;
    }
    if (check.type === "collinear" || check.type === "concyclic") {
      return check.points.map((id) => `${id}: ${resolved(id)}`).join(" | ");
    }
    if (check.type === "perpendicular" || check.type === "parallel") {
      return check.lines.map((id) => `${id}: ${resolved(id)}`).join(" | ");
    }
    if (check.type === "equalLength") {
      const [ab, cd] = check.segments;
      return `${ab[0]}: ${resolved(ab[0])} | ${ab[1]}: ${resolved(ab[1])} | ${cd[0]}: ${resolved(cd[0])} | ${cd[1]}: ${resolved(cd[1])}`;
    }
    if (check.type === "equalAngle") {
      return check.angles
        .flat()
        .map((id) => `${id}: ${resolved(id)}`)
        .join(" | ");
    }
    if (check.type === "samePower") {
      return `point ${check.point}: ${resolved(check.point)} | circles ${check.circles[0]}, ${check.circles[1]}`;
    }
    return "Unsupported claim explainer.";
  }, [checkDefById, graphObjectById]);

  const checkFocusRefs = useCallback((checkId: string) => {
    const check = checkDefById.get(checkId);
    if (!check) return [] as string[];
    return checkReferencedIds(check);
  }, [checkDefById]);

  const focusNodeInScene = useCallback((id: string) => {
    if (!onFocusObjectInScene) return;
    const point = solved.points[id];
    if (point) {
      onFocusObjectInScene({ target: { x: point.x, y: point.y, z: point.z }, radius: 0.8 });
      return;
    }
    const line = solved.lines[id];
    if (line?.origin) {
      onFocusObjectInScene({ target: { x: line.origin.x, y: line.origin.y, z: line.origin.z }, radius: 2.5 });
      return;
    }
    const circle = solved.circles[id];
    if (circle?.center) {
      onFocusObjectInScene({
        target: { x: circle.center.x, y: circle.center.y, z: circle.center.z },
        radius: Math.max(1, Number(circle.radius) * 1.6),
      });
    }
  }, [onFocusObjectInScene, solved.circles, solved.lines, solved.points]);

  const selectConstructionObject = useCallback(
    (id: string, options: { focus?: boolean; openInspector?: boolean } = {}) => {
      if (!nodes.some((node) => node.id === id)) return;
      setSelectedNodeId(id);
      setBuildMode("select");
      const symbol = scriptSymbolById.get(id);
      if (symbol) setSelectedScriptSymbolId(symbol.id);
      if (options.openInspector !== false) setWorkspaceTab("inspect");
      if (options.focus !== false) focusNodeInScene(id);
    },
    [focusNodeInScene, nodes, scriptSymbolById]
  );

  const hoverConstructionObjects = useCallback(
    (ids: string[]) => {
      if (!onHoverObjectIds) return;
      const validIds = ids.filter((id, index) => nodes.some((node) => node.id === id) && ids.indexOf(id) === index);
      onHoverObjectIds(validIds);
    },
    [nodes, onHoverObjectIds]
  );
  const clearConstructionHover = useCallback(() => onHoverObjectIds?.([]), [onHoverObjectIds]);

  const constructionObjectTokenStyle = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? "#93c5fd" : "#dbe2ea"}`,
    borderRadius: 6,
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#0f172a",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: 10.5,
    fontWeight: 800,
    lineHeight: 1.15,
    padding: "2px 6px",
  });

  const renderConstructionObjectToken = (id: string, key = id): React.ReactNode => {
    const node = nodes.find((entry) => entry.id === id) ?? null;
    const object = graphObjectById.get(id) ?? null;
    if (!node) {
      return (
        <code key={key} style={{ color: "#b42318", overflowWrap: "anywhere" }}>
          {id}
        </code>
      );
    }
    const label = object?.label || node.label || id;
    return (
      <button
        key={key}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          selectConstructionObject(id);
        }}
        onMouseEnter={() => hoverConstructionObjects([id])}
        onMouseLeave={clearConstructionHover}
        onFocus={() => hoverConstructionObjects([id])}
        onBlur={clearConstructionHover}
        aria-pressed={selectedNodeId === id}
        title={object?.summary ? `${id}: ${object.summary}` : id}
        style={constructionObjectTokenStyle(selectedNodeId === id)}
      >
        {label}
      </button>
    );
  };

  const renderConstructionObjectTokens = (ids: string[]): React.ReactNode =>
    ids.length ? (
      <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {ids.map((id) => renderConstructionObjectToken(id))}
      </span>
    ) : (
      "-"
    );

  const renderClaimStatement = (check: ProblemCheckDef): React.ReactNode => {
    const pair = (left: string, relation: string, right: string) => (
      <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {renderConstructionObjectToken(left, `${check.id}-${left}`)}
        <span>{relation}</span>
        {renderConstructionObjectToken(right, `${check.id}-${right}`)}
      </span>
    );
    if (check.type === "pointOnCircle") return pair(check.point, "on", check.circle);
    if (check.type === "perpendicular") return pair(check.lines[0], "perpendicular to", check.lines[1]);
    if (check.type === "parallel") return pair(check.lines[0], "parallel to", check.lines[1]);
    if (check.type === "samePower") {
      return (
        <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span>pow</span>
          {renderConstructionObjectToken(check.point, `${check.id}-${check.point}`)}
          <span>on</span>
          {renderConstructionObjectToken(check.circles[0], `${check.id}-${check.circles[0]}`)}
          <span>=</span>
          {renderConstructionObjectToken(check.circles[1], `${check.id}-${check.circles[1]}`)}
        </span>
      );
    }
    if (check.type === "equalLength") {
      const [[a, b], [c, d]] = check.segments;
      return (
        <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span>|</span>
          {renderConstructionObjectToken(a, `${check.id}-${a}-a`)}
          {renderConstructionObjectToken(b, `${check.id}-${b}-b`)}
          <span>| = |</span>
          {renderConstructionObjectToken(c, `${check.id}-${c}-c`)}
          {renderConstructionObjectToken(d, `${check.id}-${d}-d`)}
          <span>|</span>
        </span>
      );
    }
    if (check.type === "equalAngle") {
      return (
        <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          {check.angles[0].map((id, index) => renderConstructionObjectToken(id, `${check.id}-angle-a-${id}-${index}`))}
          <span>=</span>
          {check.angles[1].map((id, index) => renderConstructionObjectToken(id, `${check.id}-angle-b-${id}-${index}`))}
        </span>
      );
    }
    const ids = check.type === "collinear" || check.type === "concyclic" ? [...check.points] : checkReferencedIds(check);
    return (
      <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {ids.map((id, index) => renderConstructionObjectToken(id, `${check.id}-${id}-${index}`))}
        <span>{check.type === "collinear" ? "collinear" : "concyclic"}</span>
      </span>
    );
  };

  const renderConstructionFormulaPanel = (node: ConstructionNode): React.ReactNode => (
    <div
      data-testid="construction-formula-panel"
      style={{
        border: "1px solid #bfdbfe",
        borderRadius: 8,
        background: "#f8fbff",
        padding: "7px 8px",
        display: "grid",
        gap: 4,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 8px", alignItems: "baseline" }}>
        <span style={{ color: "#64748b", fontWeight: 800 }}>Object</span>
        <strong style={{ fontFamily: "monospace" }}>{node.id}</strong>
        <span style={{ color: "#64748b", fontWeight: 800 }}>Type</span>
        <strong>{constructionNodeTypeLabel(node)}</strong>
        <span style={{ color: "#64748b", fontWeight: 800 }}>Definition</span>
        <code style={{ color: "#1d4ed8", fontWeight: 800, overflowWrap: "anywhere" }}>
          {constructionNodeDefinition(node)}
        </code>
      </div>
    </div>
  );

  const renderObjectMetadataPanel = (node: ConstructionNode): React.ReactNode => {
    const metadataRows = [
      ["Created At", nodeStageById.get(node.id) ?? fallbackConstructionStageLabel(node)],
      ["Author", "Construction"],
      ["Generated", node.type === "freePoint" ? "No" : "Yes"],
      ["Locked", lockedNodeIds.has(node.id) ? "Yes" : "No"],
    ];

    return (
      <div
        data-testid="construction-object-metadata"
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#ffffff",
          padding: "7px 8px",
          display: "grid",
          gap: 4,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
          Object Metadata
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 8px", alignItems: "baseline" }}>
          {metadataRows.map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={{ color: "#64748b", fontWeight: 800 }}>{label}</span>
              <strong>{value}</strong>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderDependencyImpactPanel = (node: ConstructionNode): React.ReactNode => {
    const impactIds = nodes
      .filter((entry) => entry.id !== node.id && nodeImpactDependencies(entry).includes(node.id))
      .map((entry) => entry.id);

    return (
      <div
        data-testid="construction-dependency-impact"
        style={{
          border: "1px solid #bbf7d0",
          borderRadius: 8,
          background: "#f7fff9",
          padding: "7px 8px",
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: "#166534", textTransform: "uppercase" }}>Impact</div>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 11 }}>
            Changing <strong style={{ fontFamily: "monospace" }}>{node.id}</strong> affects:
          </div>
          {impactIds.length ? (
            <div style={{ display: "grid", gap: 3 }}>
              {impactIds.map((id) => (
                <div key={`impact-${node.id}-${id}`} style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                  <span style={{ color: "#16a34a", fontWeight: 900 }}>✓</span>
                  {renderConstructionObjectToken(id, `impact-token-${node.id}-${id}`)}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#64748b" }}>No dependent objects.</div>
          )}
          <div style={{ fontSize: 11, fontWeight: 800 }}>Total affected: {impactIds.length}</div>
        </div>
      </div>
    );
  };

  const checkResultById = useMemo(() => {
    const map = new Map<string, ProblemCheckResult>();
    for (const row of checkResults) map.set(row.id, row);
    return map;
  }, [checkResults]);
  const claimRows = useMemo(() => {
    const rows = checkDefs.map((def) => {
      const result = checkResultById.get(def.id);
      const disabled = disabledCheckIds.has(def.id);
      const status = disabled ? "invalid" : result?.status ?? "invalid";
      const residual = disabled ? null : result?.residual ?? null;
      const tolerance =
        def.type === "perpendicular" || def.type === "parallel"
          ? Math.abs(def.toleranceDeg ?? 0.6)
          : Math.abs(("tolerance" in def ? def.tolerance : 1e-3) ?? 1e-3);
      const unit = def.type === "perpendicular" || def.type === "parallel" ? "deg" : "unit";
      return { def, result, disabled, status, residual, tolerance, unit };
    });
    if (claimsSortMode === "name") {
      rows.sort((a, b) => a.def.label.localeCompare(b.def.label));
    } else if (claimsSortMode === "residual") {
      rows.sort((a, b) => {
        const ar = a.residual == null ? Number.POSITIVE_INFINITY : Math.abs(a.residual);
        const br = b.residual == null ? Number.POSITIVE_INFINITY : Math.abs(b.residual);
        return ar - br;
      });
    } else {
      const rank: Record<string, number> = { fail: 0, invalid: 1, ok: 2 };
      rows.sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
    }
    return rows;
  }, [checkDefs, checkResultById, claimsSortMode, disabledCheckIds]);
  const passedClaimCount = useMemo(() => claimRows.filter((claim) => claim.status === "ok").length, [claimRows]);
  const validationRows = useMemo(() => {
    const rows: Array<{
      id: string;
      kind: "claim" | "definition" | "constraint";
      status: "validated" | "failed" | "warning";
      label: string;
      objectIds: string[];
      claim?: ProblemCheckDef;
    }> = [];

    for (const claim of claimRows) {
      rows.push({
        id: claim.def.id,
        kind: "claim",
        status: claim.disabled ? "warning" : claim.status === "ok" ? "validated" : "failed",
        label: claim.def.label,
        objectIds: checkReferencedIds(claim.def),
        claim: claim.def,
      });
    }

    for (const node of nodes) {
      if (node.type === "freePoint") continue;
      const valid = graphObjectById.get(node.id)?.valid ?? false;
      rows.push({
        id: `definition-${node.id}`,
        kind: "definition",
        status: node.hidden ? "warning" : valid ? "validated" : "failed",
        label: constructionNodeDefinition(node),
        objectIds: [node.id, ...nodeDependencies(node)],
      });
    }

    for (const constraint of constraints) {
      rows.push({
        id: `constraint-${constraint.id}`,
        kind: "constraint",
        status: constraint.enabled === false ? "warning" : "validated",
        label: constraint.label ?? `${constraint.targetId} ${CONSTRAINT_TYPE_LABELS[constraint.type]} ${constraint.sourceId}`,
        objectIds: [constraint.targetId, constraint.sourceId],
      });
    }

    return rows;
  }, [claimRows, constraints, graphObjectById, nodes]);
  const validationCounts = useMemo(
    () => ({
      validated: validationRows.filter((row) => row.status === "validated").length,
      failed: validationRows.filter((row) => row.status === "failed").length,
      warnings: validationRows.filter((row) => row.status === "warning").length,
    }),
    [validationRows]
  );
  const constructionHistoryRows = useMemo(
    () =>
      scriptSymbols
        .filter((symbol) => symbol.kind !== "constraint")
        .map((symbol, index) => ({
          step: index + 1,
          symbol,
          action: symbol.kind === "claim" ? "Create Claim" : `Create ${symbol.id}`,
          objectIds: symbol.kind === "claim"
            ? checkDefById.get(symbol.id)
              ? checkReferencedIds(checkDefById.get(symbol.id)!)
              : symbol.dependencies
            : [symbol.id],
        })),
    [checkDefById, scriptSymbols]
  );

  const snapshotCurrent = useCallback((): ConstructionHistoryState => ({
    nodes: nodes.map((node) => ({ ...node, style: node.style ? { ...node.style } : undefined })),
    checkDefs: checkDefs.map((check) => ({ ...check })),
    constraints: constraints.map((constraint) => ({ ...constraint })),
    selectedNodeId,
    solids: solids.map((solid) => ({
      ...solid,
      params: { ...solid.params },
      transform: {
        position: { ...solid.transform.position },
        rotation: { ...solid.transform.rotation },
        scale: { ...solid.transform.scale },
      },
      material: { ...solid.material },
    })),
    selectedSolidId,
    lockedNodeIds: Array.from(lockedNodeIds).sort(),
    helperNodeIds: Array.from(helperNodeIds).sort(),
    disabledCheckIds: Array.from(disabledCheckIds).sort(),
  }), [checkDefs, constraints, disabledCheckIds, helperNodeIds, lockedNodeIds, nodes, selectedNodeId, selectedSolidId, solids]);

  const snapshotSignature = useMemo(
    () => JSON.stringify(snapshotCurrent()),
    [snapshotCurrent]
  );

  useEffect(() => {
    const history = historyRef.current;
    if (history.applying) return;
    const next = snapshotCurrent();
    const current = history.stack[history.index];
    if (current && JSON.stringify(current) === snapshotSignature) return;
    const trimmed = history.stack.slice(0, history.index + 1);
    trimmed.push(next);
    const MAX_HISTORY = 200;
    history.stack = trimmed.length > MAX_HISTORY ? trimmed.slice(trimmed.length - MAX_HISTORY) : trimmed;
    history.index = history.stack.length - 1;
  }, [snapshotCurrent, snapshotSignature]);

  const applyHistoryState = useCallback((state: ConstructionHistoryState) => {
    historyRef.current.applying = true;
    setNodes(state.nodes.map((node) => ({ ...node, style: node.style ? { ...node.style } : undefined })));
    setCheckDefs(state.checkDefs.map((check) => ({ ...check })));
    setConstraints(state.constraints.map((constraint) => ({ ...constraint })));
    setSelectedNodeId(state.selectedNodeId);
    setSolids(state.solids);
    setSelectedSolidId(state.selectedSolidId);
    setLockedNodeIds(new Set(state.lockedNodeIds));
    setHelperNodeIds(new Set(state.helperNodeIds));
    setDisabledCheckIds(new Set(state.disabledCheckIds));
    queueMicrotask(() => {
      historyRef.current.applying = false;
    });
  }, []);

  const undoHistory = useCallback(() => {
    const history = historyRef.current;
    if (history.index <= 0) return;
    history.index -= 1;
    const state = history.stack[history.index];
    if (state) applyHistoryState(state);
  }, [applyHistoryState]);

  const redoHistory = useCallback(() => {
    const history = historyRef.current;
    if (history.index >= history.stack.length - 1) return;
    history.index += 1;
    const state = history.stack[history.index];
    if (state) applyHistoryState(state);
  }, [applyHistoryState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoHistory();
        return;
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redoHistory();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [redoHistory, undoHistory]);

  const sceneObjectStats = useMemo(() => {
    const stats = {
      total: solved.objects.length,
      visible: 0,
      invalid: 0,
      point: 0,
      line: 0,
      circle: 0,
    };
    for (const obj of solved.objects) {
      if (!obj.hidden) stats.visible += 1;
      if (!obj.valid) stats.invalid += 1;
      if (obj.type === "point") stats.point += 1;
      if (obj.type === "line") stats.line += 1;
      if (obj.type === "circle") stats.circle += 1;
    }
    return stats;
  }, [solved.objects]);

  const toggleNodeVisible = useCallback((id: string) => {
    if (lockedNodeIds.has(id)) return;
    setNodes((prev) =>
      prev.map((node) => (node.id === id ? { ...node, hidden: !node.hidden } : node))
    );
  }, [lockedNodeIds]);

  const updateToolField = (key: string, value: string) => {
    setToolForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateCheckField = (key: string, value: string) => {
    setCheckForm((prev) => ({ ...prev, [key]: value }));
  };
  const toolValue = (key: string) => toolForm[key] ?? "";
  const checkValue = (key: string) => checkForm[key] ?? "";
  const toolRequiredFields: Record<ToolKind, string[]> = {
    point: [],
    line: ["a", "b"],
    perpendicular: ["line", "point"],
    parallel: ["line", "point"],
    perpBisector: ["a", "b"],
    angleBisector: ["vertex", "a", "c"],
    circle: ["center", "point"],
    circle3: ["a", "b", "c"],
    circumcircle: ["a", "b", "c"],
    circumcenter: ["a", "b", "c"],
    midpoint: ["a", "b"],
    arcMidpoint: ["circle", "b", "c"],
    intersection: ["lineA", "lineB"],
    secondIntersection: ["line", "circle", "exclude"],
  };
  const missingRequiredToolFields = useMemo(
    () => toolRequiredFields[tool].filter((field) => !String(toolForm[field] ?? "").trim().length),
    [tool, toolForm]
  );
  const pointPlacementMode =
    workspaceTab === "build" &&
    buildMode === "create" &&
    scratchPlacementKind === "point" &&
    tool === "point";
  const solidPlacementMode =
    workspaceTab === "build" &&
    buildMode === "create" &&
    scratchPlacementKind != null &&
    scratchPlacementKind !== "point";
  const viewportPlacementMode = pointPlacementMode || solidPlacementMode;

  const useSelectedObjectsForTool = useCallback(() => {
    if (!selectedNodeId) {
      setToolError("Select an object in scene contents first.");
      return;
    }
    const selected = graphObjectById.get(selectedNodeId);
    if (!selected) {
      setToolError("Selected object is not solved.");
      return;
    }
    const pointFieldsByTool: Record<ToolKind, string[]> = {
      point: [],
      line: ["a", "b"],
      perpendicular: ["point"],
      parallel: ["point"],
      perpBisector: ["a", "b"],
      angleBisector: ["vertex", "a", "c"],
      circle: ["center", "point"],
      circle3: ["a", "b", "c"],
      circumcircle: ["a", "b", "c"],
      circumcenter: ["a", "b", "c"],
      midpoint: ["a", "b"],
      arcMidpoint: ["b", "c", "exclude"],
      intersection: [],
      secondIntersection: ["exclude"],
    };
    const lineFieldsByTool: Record<ToolKind, string[]> = {
      point: [],
      line: [],
      perpendicular: ["line"],
      parallel: ["line"],
      perpBisector: [],
      angleBisector: [],
      circle: [],
      circle3: [],
      circumcircle: [],
      circumcenter: [],
      midpoint: [],
      arcMidpoint: [],
      intersection: ["lineA", "lineB"],
      secondIntersection: ["line"],
    };
    const circleFieldsByTool: Record<ToolKind, string[]> = {
      point: [],
      line: [],
      perpendicular: [],
      parallel: [],
      perpBisector: [],
      angleBisector: [],
      circle: [],
      circle3: [],
      circumcircle: [],
      circumcenter: [],
      midpoint: [],
      arcMidpoint: ["circle"],
      intersection: [],
      secondIntersection: ["circle"],
    };

    const fieldPool =
      selected.type === "point"
        ? pointFieldsByTool[tool]
        : selected.type === "line"
          ? lineFieldsByTool[tool]
          : circleFieldsByTool[tool];
    if (!fieldPool.length) {
      setToolError(`Selected ${selected.type} cannot be used for this tool.`);
      return;
    }
    setToolForm((prev) => {
      const next = { ...prev };
      const target = fieldPool.find((field) => !String(prev[field] ?? "").trim().length) ?? fieldPool[0];
      next[target] = selected.id;
      return next;
    });
    setToolError(null);
  }, [graphObjectById, selectedNodeId, tool]);

  const swapToolInputs = useCallback(() => {
    const pair: [string, string] | null =
      tool === "line" || tool === "perpBisector" || tool === "midpoint"
        ? ["a", "b"]
        : tool === "circle3" || tool === "circumcircle" || tool === "circumcenter"
          ? ["a", "b"]
          : tool === "intersection"
            ? ["lineA", "lineB"]
            : tool === "arcMidpoint"
              ? ["b", "c"]
              : null;
    if (!pair) {
      setToolError("Swap is not available for this tool.");
      return;
    }
    setToolForm((prev) => ({ ...prev, [pair[0]]: prev[pair[1]] ?? "", [pair[1]]: prev[pair[0]] ?? "" }));
    setToolError(null);
  }, [tool]);

  const clearBuildSelections = useCallback(() => {
    setToolForm({});
    setSelectedNodeId("");
    setToolError(null);
  }, []);

  const addNode = useCallback((node: ConstructionNode, nextMode: BuildMode = "select") => {
    setNodes((prev) => [...prev, node]);
    setSelectedNodeId(node.id);
    setSelectedSolidId(null);
    setBuildMode(nextMode);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setConstraints((prev) => prev.filter((constraint) => constraint.sourceId !== nodeId && constraint.targetId !== nodeId));
  }, []);

  useEffect(() => {
    onPointPlacementModeChange?.(viewportPlacementMode);
  }, [onPointPlacementModeChange, viewportPlacementMode]);

  useEffect(() => {
    if (!viewportPickPoint) return;
    if (!viewportPlacementMode) {
      if (viewportPickMeshKey && solids.some((solid) => solid.id === viewportPickMeshKey)) {
        setSelectedSolidId(viewportPickMeshKey);
        setSelectedNodeId("");
        setBuildMode("select");
        setWorkspaceTab("build");
      }
      onViewportPickConsumed?.();
      return;
    }
    if (solidPlacementMode && scratchPlacementKind) {
      const ids = new Set([...nodes.map((node) => node.id), ...solids.map((solid) => solid.id)]);
      const id = uniqueId(scratchPlacementKind, ids);
      const solid = createGeometryObject(scratchPlacementKind, id) as ScratchSolid;
      solid.name = `${scratchPlacementKind[0].toUpperCase()}${scratchPlacementKind.slice(1)}`;
      solid.transform.position = { ...viewportPickPoint };
      setSolids((prev) => [...prev, solid]);
      setSelectedSolidId(id);
      setSelectedNodeId("");
      onViewportPickConsumed?.();
      return;
    }
    if (!pointPlacementMode) return;
    const ids = new Set(nodes.map((node) => node.id));
    const requestedId = cleanId(toolForm["id"] ?? "");
    const id = uniqueId(requestedId || "P", ids);
    addNode({
      id,
      label: id,
      type: "freePoint",
      point: { x: viewportPickPoint.x, y: viewportPickPoint.y, z: viewportPickPoint.z },
      style: { color: 0xef4444, size: 0.045 },
    }, "create");
    setSelectedSolidId(null);
    setToolForm((prev) => ({
      ...prev,
      x: viewportPickPoint.x.toFixed(3),
      y: viewportPickPoint.y.toFixed(3),
      z: viewportPickPoint.z.toFixed(3),
    }));
    onViewportPickConsumed?.();
  }, [
    addNode,
    nodes,
    onViewportPickConsumed,
    pointPlacementMode,
    scratchPlacementKind,
    solidPlacementMode,
    solids,
    tool,
    toolForm,
    viewportPickMeshKey,
    viewportPickPoint,
    viewportPlacementMode,
  ]);

  useEffect(() => {
    if (!viewportMovePoint) return;
    const id = viewportMovePoint.id;
    const p = viewportMovePoint.point;
    const nextPoint = {
      x: Number(p.x),
      y: Number(p.y),
      z: Number(p.z),
    };
    if (!id || !Number.isFinite(nextPoint.x) || !Number.isFinite(nextPoint.y) || !Number.isFinite(nextPoint.z)) {
      onViewportMoveConsumed?.();
      return;
    }
    setNodes((prev) =>
      prev.map((node) =>
        node.id === id && node.type === "freePoint" && !lockedNodeIds.has(node.id)
          ? { ...node, point: nextPoint }
          : node
      )
    );
    setSelectedNodeId(id);
    setBuildMode("select");
    onViewportMoveConsumed?.();
  }, [lockedNodeIds, onViewportMoveConsumed, viewportMovePoint]);

  useEffect(() => {
    const ids = new Set(nodes.map((node) => node.id));
    if (selectedSolidId && solids.some((solid) => solid.id === selectedSolidId)) return;
    if (!ids.size) {
      if (selectedNodeId) setSelectedNodeId("");
      return;
    }
    if (!selectedNodeId || !ids.has(selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.id ?? "");
    }
  }, [nodes, selectedNodeId, selectedSolidId, solids]);

  useEffect(() => {
    const ids = new Set(nodes.map((node) => node.id));
    setLockedNodeIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    setHelperNodeIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [nodes]);

  useEffect(() => {
    const ids = new Set(checkDefs.map((check) => check.id));
    setDisabledCheckIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [checkDefs]);

  const parseWithCurrentState = useCallback(
    (command: string) => {
      const ids = new Set(nodes.map((node) => node.id));
      return parseCommandLine(command, ids, checkDefs.length + 1, constraints.length + 1);
    },
    [nodes, checkDefs.length, constraints.length]
  );

  const palettePreview = useMemo(() => parseWithCurrentState(paletteInput), [parseWithCurrentState, paletteInput]);

  const executeParsedCommand = (parsed: ParseResult) => {
    if (!parsed.ok) return;
    if (parsed.node) addNode(parsed.node);
    if (parsed.check) {
      setCheckDefs((prev) => [...prev, parsed.check!]);
      setBuildMode("check");
    }
    if (parsed.constraint) {
      setConstraints((prev) => [...prev, parsed.constraint!]);
      setBuildMode("select");
    }
  };

  const handleAddFromCreateTool = () => {
    setToolError(null);
    const ids = new Set(nodes.map((node) => node.id));
    const requestedId = cleanId(toolValue("id"));
    const makeId = (base: string) => uniqueId(requestedId || base, ids);

    const fail = (message: string) => {
      setToolError(message);
      return;
    };

    if (tool === "point") {
      const id = makeId("P");
      addNode({
        id,
        label: id,
        type: "freePoint",
        point: {
          x: parseNumber(toolValue("x"), 0),
          y: parseNumber(toolValue("y"), 0),
          z: parseNumber(toolValue("z"), 0),
        },
        style: { color: 0xef4444, size: 0.045 },
      });
      return;
    }
    if (tool === "line") {
      if (!toolValue("a") || !toolValue("b")) return fail("Line requires points a and b.");
      const id = makeId(`${toolValue("a")}${toolValue("b")}`);
      addNode({ id, label: id, type: "lineThroughPoints", a: toolValue("a"), b: toolValue("b"), style: { color: 0x6b7280, length: 6 } });
      return;
    }
    if (tool === "perpendicular") {
      if (!toolValue("line") || !toolValue("point")) return fail("Perpendicular requires line and point.");
      const id = makeId(`${toolValue("point")}_perp_${toolValue("line")}`);
      addNode({ id, label: id, type: "perpendicularLine", line: toolValue("line"), point: toolValue("point"), style: { color: 0x0f766e, length: 6 } });
      return;
    }
    if (tool === "parallel") {
      if (!toolValue("line") || !toolValue("point")) return fail("Parallel requires line and point.");
      const id = makeId(`${toolValue("point")}_parallel_${toolValue("line")}`);
      addNode({ id, label: id, type: "parallelLine", line: toolValue("line"), point: toolValue("point"), style: { color: 0x7c3aed, length: 6 } });
      return;
    }
    if (tool === "perpBisector") {
      if (!toolValue("a") || !toolValue("b")) return fail("Perpendicular bisector requires points a and b.");
      const id = makeId(`bis${toolValue("a")}${toolValue("b")}`);
      addNode({ id, label: id, type: "perpendicularBisector", a: toolValue("a"), b: toolValue("b"), style: { color: 0x0891b2, length: 6 } });
      return;
    }
    if (tool === "angleBisector") {
      if (!toolValue("vertex") || !toolValue("a") || !toolValue("c")) return fail("Angle bisector requires vertex, a, c.");
      const id = makeId(`bis${toolValue("a")}${toolValue("vertex")}${toolValue("c")}`);
      addNode({
        id,
        label: id,
        type: "angleBisector",
        vertex: toolValue("vertex"),
        a: toolValue("a"),
        c: toolValue("c"),
        style: { color: 0xa855f7, length: 6 },
      });
      return;
    }
    if (tool === "circle") {
      if (!toolValue("center") || !toolValue("point")) return fail("Circle requires center and point.");
      const id = makeId("C");
      addNode({ id, label: id, type: "circleCenterPoint", center: toolValue("center"), point: toolValue("point"), style: { color: 0x2563eb, segments: 96 } });
      return;
    }
    if (tool === "circle3") {
      if (!toolValue("a") || !toolValue("b") || !toolValue("c")) return fail("Circle through 3 points requires a,b,c.");
      const id = makeId("Gamma");
      addNode({ id, label: id, type: "circleThrough3Points", a: toolValue("a"), b: toolValue("b"), c: toolValue("c"), style: { color: 0x7c3aed, segments: 96 } });
      return;
    }
    if (tool === "circumcircle") {
      if (!toolValue("a") || !toolValue("b") || !toolValue("c")) return fail("Circumcircle requires a,b,c.");
      const id = makeId("Omega");
      addNode({ id, label: id, type: "circleThrough3Points", a: toolValue("a"), b: toolValue("b"), c: toolValue("c"), style: { color: 0x2563eb, segments: 96 } });
      return;
    }
    if (tool === "circumcenter") {
      if (!toolValue("a") || !toolValue("b") || !toolValue("c")) return fail("Circumcenter requires a,b,c.");
      const id = makeId("O");
      addNode({ id, label: id, type: "circumcenter", a: toolValue("a"), b: toolValue("b"), c: toolValue("c"), style: { color: 0xf59e0b, size: 0.045 } });
      return;
    }
    if (tool === "midpoint") {
      if (!toolValue("a") || !toolValue("b")) return fail("Midpoint requires a,b.");
      const id = makeId("M");
      addNode({ id, label: id, type: "midpoint", a: toolValue("a"), b: toolValue("b"), style: { color: 0x22c55e, size: 0.045 } });
      return;
    }
    if (tool === "arcMidpoint") {
      if (!toolValue("circle") || !toolValue("b") || !toolValue("c")) return fail("Arc midpoint requires circle,b,c.");
      const id = makeId("M");
      addNode({
        id,
        label: id,
        type: "arcMidpointOnCircle",
        circle: toolValue("circle"),
        b: toolValue("b"),
        c: toolValue("c"),
        excludePoint: toolValue("exclude") || undefined,
        style: { color: 0x22c55e, size: 0.05 },
      });
      return;
    }
    if (tool === "intersection") {
      if (!toolValue("lineA") || !toolValue("lineB")) return fail("Intersection requires lineA and lineB.");
      const id = makeId("X");
      addNode({ id, label: id, type: "lineLineIntersection", lineA: toolValue("lineA"), lineB: toolValue("lineB"), style: { color: 0xdc2626, size: 0.05 } });
      return;
    }
    if (!toolValue("line") || !toolValue("circle") || !toolValue("exclude")) return fail("Second intersection requires line, circle, exclude point.");
    const id = makeId("P");
    addNode({
      id,
      label: id,
      type: "lineCircleIntersection",
      line: toolValue("line"),
      circle: toolValue("circle"),
      choice: { mode: "otherThan", point: toolValue("exclude") },
      style: { color: 0xf97316, size: 0.045 },
    });
  };

  const handleAddCheck = () => {
    setCheckError(null);
    const id = `check_${checkDefs.length + 1}`;
    if (checkKind === "pointOnCircle") {
      if (!checkValue("point") || !checkValue("circle")) {
        setCheckError("Point-on-circle requires point and circle.");
        return;
      }
      setCheckDefs((prev) => [...prev, { id, label: `${checkValue("point")} on ${checkValue("circle")}`, type: "pointOnCircle", point: checkValue("point"), circle: checkValue("circle"), tolerance: 2e-3 }]);
      return;
    }
    if (checkKind === "collinear") {
      if (!checkValue("a") || !checkValue("b") || !checkValue("c")) {
        setCheckError("Collinear requires a, b, c.");
        return;
      }
      setCheckDefs((prev) => [...prev, { id, label: `${checkValue("a")},${checkValue("b")},${checkValue("c")} collinear`, type: "collinear", points: [checkValue("a"), checkValue("b"), checkValue("c")], tolerance: 1e-3 }]);
      return;
    }
    if (checkKind === "concyclic") {
      if (!checkValue("a") || !checkValue("b") || !checkValue("c") || !checkValue("d")) {
        setCheckError("Concyclic requires a, b, c, d.");
        return;
      }
      setCheckDefs((prev) => [...prev, { id, label: `${checkValue("a")},${checkValue("b")},${checkValue("c")},${checkValue("d")} concyclic`, type: "concyclic", points: [checkValue("a"), checkValue("b"), checkValue("c"), checkValue("d")], tolerance: 2e-3 }]);
      return;
    }
    if (checkKind === "perpendicular" || checkKind === "parallel") {
      if (!checkValue("lineA") || !checkValue("lineB")) {
        setCheckError("Perpendicular/parallel requires lineA and lineB.");
        return;
      }
      setCheckDefs((prev) => [
        ...prev,
        checkKind === "perpendicular"
          ? { id, label: `${checkValue("lineA")} perpendicular ${checkValue("lineB")}`, type: "perpendicular", lines: [checkValue("lineA"), checkValue("lineB")], toleranceDeg: 0.6 }
          : { id, label: `${checkValue("lineA")} parallel ${checkValue("lineB")}`, type: "parallel", lines: [checkValue("lineA"), checkValue("lineB")], toleranceDeg: 0.6 },
      ]);
      return;
    }
    if (!checkValue("a") || !checkValue("b") || !checkValue("c") || !checkValue("d")) {
      setCheckError("Equal distance requires a,b,c,d.");
      return;
    }
    setCheckDefs((prev) => [...prev, { id, label: `|${checkValue("a")}${checkValue("b")}| = |${checkValue("c")}${checkValue("d")}|`, type: "equalLength", segments: [[checkValue("a"), checkValue("b")], [checkValue("c"), checkValue("d")]], tolerance: 2e-3 }]);
  };

  const executePalette = () => {
    setPaletteError(null);
    const parsed = parseWithCurrentState(paletteInput);
    if (!parsed.ok) {
      setPaletteError(parsed.error);
      return;
    }
    executeParsedCommand(parsed);
    setPaletteInput("");
    setPaletteOpen(false);
  };

  const applyScriptToScene = useCallback((script: string) => {
    const parsed = parseSceneScript(script);
    if (parsed.error) {
      setScriptError(parsed.error);
      return false;
    }
    if (!parsed.nodes.length) {
      setScriptError("Script produced no construction objects.");
      return false;
    }
    setScriptError(null);
    setNodes(parsed.nodes);
    setCheckDefs(parsed.checks);
    setConstraints(parsed.constraints);
    setDisabledCheckIds(new Set());
    setLockedNodeIds(new Set());
    setHelperNodeIds(new Set());
    setSelectedNodeId(parsed.nodes[0].id);
    setBuildMode("select");
    return true;
  }, []);

  const rebuildFromScript = () => {
    setScriptError(null);
    const source = scriptText.trim().length ? scriptText : DEFAULT_OLYMPIAD_ARC_SCRIPT;
    if (!scriptText.trim().length) {
      setScriptText(DEFAULT_OLYMPIAD_ARC_SCRIPT);
      setSelectedPresetName(BUILTIN_TASK_PRESET_NAME);
    }
    applyScriptToScene(source);
    setScriptRunStepIndex(executableScriptLines.length);
  };

  const scriptPrefixThroughLine = useCallback((lineNumber: number) => {
    const lines = scriptText.split(/\r?\n/);
    return lines.slice(0, Math.max(0, lineNumber)).join("\n");
  }, [scriptText]);

  const focusScriptLine = useCallback((lineNumber: number) => {
    const textarea = scriptEditorRef.current;
    if (!textarea || lineNumber < 1) return;
    const lines = scriptText.split(/\r?\n/);
    let start = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) start += lines[i].length + 1;
    const end = start + (lines[lineNumber - 1]?.length ?? 0);
    textarea.focus();
    textarea.setSelectionRange(start, end);
    setScriptCursorLine(Math.max(1, lineNumber));
  }, [scriptText]);

  const stepScript = useCallback(() => {
    if (!executableScriptLines.length) return;
    const nextIndex = Math.min(scriptRunStepIndex, executableScriptLines.length - 1);
    const lineNumber = executableScriptLines[nextIndex];
    const prefix = scriptPrefixThroughLine(lineNumber);
    if (applyScriptToScene(prefix)) {
      setScriptRunStepIndex(nextIndex + 1);
      focusScriptLine(lineNumber);
    }
  }, [applyScriptToScene, executableScriptLines, focusScriptLine, scriptPrefixThroughLine, scriptRunStepIndex]);

  const resetScriptStepper = useCallback(() => {
    if (scriptAnimationTimerRef.current != null) {
      window.clearTimeout(scriptAnimationTimerRef.current);
      scriptAnimationTimerRef.current = null;
    }
    setScriptAnimating(false);
    setScriptRunStepIndex(0);
    setScriptError(null);
  }, []);

  const animateScript = useCallback(() => {
    if (scriptAnimating) {
      if (scriptAnimationTimerRef.current != null) {
        window.clearTimeout(scriptAnimationTimerRef.current);
        scriptAnimationTimerRef.current = null;
      }
      setScriptAnimating(false);
      return;
    }
    if (!executableScriptLines.length) return;
    setScriptAnimating(true);
    let index = 0;
    const tick = () => {
      const lineNumber = executableScriptLines[index];
      if (lineNumber == null) {
        setScriptAnimating(false);
        scriptAnimationTimerRef.current = null;
        setScriptRunStepIndex(executableScriptLines.length);
        return;
      }
      if (applyScriptToScene(scriptPrefixThroughLine(lineNumber))) {
        setScriptRunStepIndex(index + 1);
        focusScriptLine(lineNumber);
      }
      index += 1;
      scriptAnimationTimerRef.current = window.setTimeout(tick, 450);
    };
    tick();
  }, [applyScriptToScene, executableScriptLines, focusScriptLine, scriptAnimating, scriptPrefixThroughLine]);

  const focusScriptSymbol = useCallback((symbolId: string) => {
    const symbol = scriptSymbolById.get(symbolId);
    if (!symbol) return;
    setScriptInspectorTab("dependencies");
    setSelectedScriptSymbolId(symbol.id);
    focusScriptLine(symbol.line);
    if (symbol.kind === "claim") {
      const firstRef = symbol.dependencies[0];
      if (firstRef) focusNodeInScene(firstRef);
      return;
    }
    if (symbol.kind !== "constraint") {
      setSelectedNodeId(symbol.id);
      focusNodeInScene(symbol.id);
    }
  }, [focusNodeInScene, focusScriptLine, scriptSymbolById]);
  const handleScriptEditorClick = useCallback(() => {
    updateScriptCursorLine();
    const textarea = scriptEditorRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const left = scriptText.slice(0, cursor).match(/[A-Za-z_][A-Za-z0-9_-]*$/)?.[0] ?? "";
    const right = scriptText.slice(cursor).match(/^[A-Za-z0-9_-]*/)?.[0] ?? "";
    const token = `${left}${right}`;
    const symbol = scriptSymbolById.get(token);
    if (!symbol || symbol.kind === "constraint") return;
    setSelectedScriptSymbolId(symbol.id);
    setSelectedScriptStageIndex(null);
    setHighlightedStageObjectIds(new Set([symbol.id]));
    setSelectedNodeId(symbol.id);
    focusNodeInScene(symbol.id);
  }, [focusNodeInScene, scriptSymbolById, scriptText, updateScriptCursorLine]);

  const selectScriptStage = useCallback((stageIndex: number) => {
    const stage = scriptStageSections[stageIndex];
    if (!stage) return;
    setSelectedScriptStageIndex(stage.index);
    const objectIds = stage.symbols
      .filter((symbol) => symbol.kind !== "claim" && symbol.kind !== "constraint")
      .map((symbol) => symbol.id);
    setHighlightedStageObjectIds(new Set(objectIds));
    applyScriptToScene(scriptPrefixThroughLine(stage.endLine));
    focusScriptLine(stage.line);
    const firstObjectId = objectIds[0];
    if (firstObjectId) {
      setSelectedNodeId(firstObjectId);
      focusNodeInScene(firstObjectId);
    }
  }, [applyScriptToScene, focusNodeInScene, focusScriptLine, scriptPrefixThroughLine, scriptStageSections]);

  const selectAdjacentScriptStage = useCallback((direction: -1 | 1) => {
    if (!scriptStageSections.length) return;
    const nextIndex = Math.max(0, Math.min(scriptStageSections.length - 1, displayedScriptStageIndex + direction));
    selectScriptStage(nextIndex);
  }, [displayedScriptStageIndex, scriptStageSections.length, selectScriptStage]);

  const toggleScriptStageFold = useCallback((stageIndex: number) => {
    setFoldedScriptStageKeys((prev) => {
      const next = new Set(prev);
      if (next.has(stageIndex)) next.delete(stageIndex);
      else next.add(stageIndex);
      return next;
    });
  }, []);

  const applyCommandSuggestion = useCallback((suggestion: string) => {
    const lines = scriptText.split(/\r?\n/);
    const index = Math.max(0, Math.min(lines.length - 1, scriptCursorLine - 1));
    const current = lines[index] ?? "";
    const indent = current.match(/^\s*/)?.[0] ?? "";
    const rest = current.trimStart().replace(/^\S+\s*/, "");
    const nextLine = `${indent}${suggestion}${rest ? ` ${rest}` : " "}`;
    lines[index] = nextLine;
    setScriptText(lines.join("\n"));
    window.setTimeout(() => {
      focusScriptLine(scriptCursorLine);
    }, 0);
  }, [focusScriptLine, scriptCursorLine, scriptText]);

  const renderScriptDependencyTree = useCallback(
    (symbol: ScriptSymbol | null, depth = 0, visited = new Set<string>()): React.ReactNode => {
      if (!symbol) return null;
      if (visited.has(symbol.id)) {
        return (
          <div style={{ paddingLeft: depth * 10, fontFamily: "monospace", fontSize: 10.5, color: "#64748b" }}>
            {symbol.id} (cycle)
          </div>
        );
      }
      const nextVisited = new Set(visited);
      nextVisited.add(symbol.id);
      return (
        <div key={`${symbol.id}-${depth}`}>
          <button
            type="button"
            onClick={() => focusScriptSymbol(symbol.id)}
            title={`${scriptSymbolKindLabel(symbol.kind)} ${symbol.id}\n${symbol.summary}\nUsed by ${symbol.usedBy.length} objects`}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              padding: "2px 0 2px " + depth * 10,
              fontFamily: "monospace",
              fontSize: 10.5,
              cursor: "pointer",
            }}
          >
            {depth === 0 ? "" : "\u2514\u2500 "}
            {symbol.id}
          </button>
          {symbol.dependencies.map((dep) => {
            const depSymbol = scriptSymbolById.get(dep);
            return depSymbol ? (
              renderScriptDependencyTree(depSymbol, depth + 1, nextVisited)
            ) : (
              <div
                key={`${symbol.id}-${dep}`}
                style={{ paddingLeft: (depth + 1) * 10, fontFamily: "monospace", fontSize: 10.5, color: "#94a3b8" }}
              >
                {"\u2514\u2500 "}
                {dep}
              </div>
            );
          })}
        </div>
      );
    },
    [focusScriptSymbol, scriptSymbolById]
  );

  const renderScriptDependentTree = useCallback(
    (root: ScriptSymbol | null): React.ReactNode => {
      if (!root) return null;
      const reachable = new Set<string>();
      const queue = [...root.usedBy];
      while (queue.length) {
        const id = queue.shift();
        if (!id || reachable.has(id)) continue;
        const symbol = scriptSymbolById.get(id);
        if (!symbol) continue;
        reachable.add(id);
        queue.push(...symbol.usedBy);
      }

      const childrenByParent = new Map<string, string[]>();
      const appendChild = (parentId: string, childId: string) => {
        const current = childrenByParent.get(parentId) ?? [];
        if (!current.includes(childId)) childrenByParent.set(parentId, [...current, childId]);
      };

      for (const id of reachable) {
        const symbol = scriptSymbolById.get(id);
        if (!symbol) continue;
        const dependencies = symbol.dependencies.filter((dep) => dep === root.id || reachable.has(dep));
        const rootIndex = dependencies.indexOf(root.id);
        let parentId = root.id;
        if (rootIndex >= 0 && rootIndex < dependencies.length - 1) {
          parentId = dependencies[dependencies.length - 1] ?? root.id;
        } else if (rootIndex < 0 && dependencies.length) {
          parentId = dependencies[dependencies.length - 1] ?? root.id;
        }
        if (parentId === id) parentId = root.id;
        appendChild(parentId, id);
      }

      const renderNode = (symbolId: string, prefix = "", isLast = true, visited = new Set<string>()): React.ReactNode => {
        const symbol = scriptSymbolById.get(symbolId);
        if (!symbol) return null;
        const active = selectedScriptSymbol?.id === symbol.id;
        const nextVisited = new Set(visited);
        nextVisited.add(symbol.id);
        const childIds = (childrenByParent.get(symbol.id) ?? []).filter((childId) => !nextVisited.has(childId));
        const connector = prefix ? (isLast ? "\u2514\u2500 " : "\u251c\u2500 ") : "";
        const childPrefix = prefix + (prefix ? (isLast ? "   " : "\u2502  ") : "");
        return (
          <div key={`dependent-tree-${symbol.id}-${prefix || "root"}`} style={{ display: "grid", gap: 1 }}>
            <button
              type="button"
              onClick={() => focusScriptSymbol(symbol.id)}
              title={`${scriptSymbolKindLabel(symbol.kind)} ${symbol.id}\n${symbol.summary}\nDepends on ${symbol.dependencies.length} objects`}
              style={{
                border: "none",
                borderRadius: 5,
                background: active ? "#eff6ff" : "transparent",
                color: active ? "#1d4ed8" : "#0f172a",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 10.5,
                fontWeight: prefix ? 600 : 800,
                padding: "2px 4px",
                textAlign: "left",
                whiteSpace: "pre",
              }}
            >
              {prefix}
              {connector}
              {symbol.kind === "claim" ? `Claim: ${symbol.label}` : symbol.id}
            </button>
            {childIds.map((childId, index) =>
              renderNode(childId, childPrefix, index === childIds.length - 1, nextVisited)
            )}
          </div>
        );
      };

      return (
        <div
          data-testid="construction-script-dependent-tree"
          style={{
            border: "1px solid #dbe2ea",
            borderRadius: 8,
            background: "#f8fafc",
            padding: "6px 8px",
            display: "grid",
            gap: 1,
          }}
        >
          {renderNode(root.id)}
          {!reachable.size && (
            <div style={{ fontFamily: "monospace", fontSize: 10.5, color: "#64748b", padding: "2px 4px" }}>
              {root.id}
            </div>
          )}
        </div>
      );
    },
    [focusScriptSymbol, scriptSymbolById, selectedScriptSymbol]
  );

  const runScriptFragment = useCallback((fragment: string, startLine = 1) => {
    const lines = fragment.split(/\r?\n/);
    const ids = new Set(nodes.map((node) => node.id));
    const nextNodes = nodes.slice();
    const nextChecks = checkDefs.slice();
    const nextConstraints = constraints.slice();
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parsed = parseCommandLine(line, ids, nextChecks.length + 1, nextConstraints.length + 1);
      if (!parsed.ok) {
        const absoluteLine = startLine + i;
        setScriptError(`Line ${absoluteLine}: ${parsed.error}`);
        focusScriptLine(absoluteLine);
        return;
      }
      if (parsed.node) {
        nextNodes.push(parsed.node);
        ids.add(parsed.node.id);
      }
      if (parsed.check) nextChecks.push(parsed.check);
      if (parsed.constraint) nextConstraints.push(parsed.constraint);
    }
    setNodes(nextNodes);
    setCheckDefs(nextChecks);
    setConstraints(nextConstraints);
    setScriptError(null);
  }, [checkDefs, constraints, focusScriptLine, nodes]);

  const runSelectedScript = useCallback(() => {
    const textarea = scriptEditorRef.current;
    if (!textarea) return;
    const text = scriptText;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    if (end > start) {
      const selected = text.slice(start, end);
      const lineOffset = text.slice(0, start).split(/\r?\n/).length;
      runScriptFragment(selected, lineOffset);
      return;
    }
    const lines = text.split(/\r?\n/);
    const lineIndex = text.slice(0, start).split(/\r?\n/).length - 1;
    const current = lines[lineIndex] ?? "";
    runScriptFragment(current, lineIndex + 1);
  }, [runScriptFragment, scriptText]);

  const runScriptFromCursor = useCallback(() => {
    const textarea = scriptEditorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const lineIndex = scriptText.slice(0, start).split(/\r?\n/).length - 1;
    const lines = scriptText.split(/\r?\n/);
    const fragment = lines.slice(lineIndex).join("\n");
    runScriptFragment(fragment, lineIndex + 1);
  }, [runScriptFragment, scriptText]);

  const regenerateScriptFromScene = () => {
    const generated = buildScriptFromState(nodes, checkDefs, constraints);
    if (scriptSyncMode === "overwrite") {
      setScriptText(generated);
      setScriptError(null);
      return;
    }
    if (scriptSyncMode === "appendNew") {
      const currentLines = new Set(scriptText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      const additions = generated
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !currentLines.has(line));
      if (additions.length) {
        setScriptText((prev) => `${prev.trimEnd()}\n${additions.join("\n")}`);
      }
      setScriptError(null);
      return;
    }
    const comments = scriptText
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("#"));
    setScriptText([...comments, generated].join("\n"));
    setScriptError(null);
  };

  const saveScriptPreset = useCallback((nameRaw: string, script: string) => {
    const name = cleanId(nameRaw) || `preset_${Date.now()}`;
    const next: ScriptPreset[] = [
      { name, script, savedAt: Date.now() },
      ...presets.filter((preset) => preset.name !== name),
    ].slice(0, 30);
    setPresets(next);
    setSelectedPresetName(name);
    savePresets(next);
    return name;
  }, [presets]);

  const saveCurrentScriptPreset = () => {
    saveScriptPreset(presetName, scriptText);
  };

  const loadSelectedPreset = () => {
    const preset = presetOptions.find((entry) => entry.name === selectedPresetName);
    if (!preset) return;
    setScriptText(preset.script);
    applyScriptToScene(preset.script);
  };
  const loadPresentationScene = useCallback((preset: (typeof PRESENTATION_SCENE_PRESETS)[number]) => {
    setSceneName(preset.label);
    setSceneType(preset.id === "olympiad_arc" ? "task" : "demo");
    setSceneMode("plane2d");
    setSceneMetadata(preset.summary);
    setScriptText(preset.script);
    setSelectedPresetName("");
    setScriptInspectorTab("outline");
    applyScriptToScene(preset.script);
  }, [applyScriptToScene]);

  const deleteSelectedPreset = () => {
    if (!selectedPresetName || selectedPresetIsBuiltin) return;
    const next = presets.filter((preset) => preset.name !== selectedPresetName);
    setPresets(next);
    setSelectedPresetName(BUILTIN_TASK_PRESET_NAME);
    savePresets(next);
  };

  const focusClaimInputs = useCallback((checkId: string) => {
    const refs = checkFocusRefs(checkId);
    const target = refs.find((id) => nodes.some((node) => node.id === id));
    if (!target) return;
    setSelectedNodeId(target);
    setWorkspaceTab("inspect");
    setBuildMode("select");
  }, [checkFocusRefs, nodes]);

  const toggleClaimEnabled = useCallback((checkId: string) => {
    setDisabledCheckIds((prev) => {
      const next = new Set(prev);
      if (next.has(checkId)) next.delete(checkId);
      else next.add(checkId);
      return next;
    });
  }, []);

  const updateClaimTolerance = useCallback((checkId: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    setCheckDefs((prev) =>
      prev.map((check) => {
        if (check.id !== checkId) return check;
        if (check.type === "perpendicular" || check.type === "parallel") {
          return { ...check, toleranceDeg: value };
        }
        return { ...check, tolerance: value };
      })
    );
  }, []);

  const resetToEmbeddedTask = useCallback(() => {
    setScriptText(DEFAULT_OLYMPIAD_ARC_SCRIPT);
    setSelectedPresetName(BUILTIN_TASK_PRESET_NAME);
    setSceneName("Olympiad construction");
    setSceneType("task");
    setSceneMode("plane2d");
    setSceneMetadata("Construct X as in the embedded olympiad-style arc problem.");
    setDisabledCheckIds(new Set());
    setWorkspaceTab("build");
    setBuildMode("create");
    applyScriptToScene(DEFAULT_OLYMPIAD_ARC_SCRIPT);
  }, [applyScriptToScene]);

  const cloneSceneToPreset = useCallback(() => {
    const cloneScript = buildScriptFromState(nodes, checkDefs, constraints);
    setScriptText(cloneScript);
    const suggestedName = `${cleanId(sceneName) || "scene"}_copy`;
    setPresetName(suggestedName);
    saveScriptPreset(suggestedName, cloneScript);
  }, [checkDefs, constraints, nodes, saveScriptPreset, sceneName]);

  const exportSceneBundle = useCallback(() => {
    const extension: ConstructionLabExtension = {
      sceneType,
      sceneMode,
      metadata: sceneMetadata,
      script: scriptText,
      nodes,
      checks: checkDefs,
      constraints,
      solids,
      selectedSolidId,
    };
    const baseDoc: SceneDocument = {
      id: cleanId(sceneName) || `scene_${Date.now()}`,
      title: sceneName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      geometry: solved.scene,
      metadata: sceneMetadata ? { description: sceneMetadata } : undefined,
      extensions: {
        [CONSTRUCTION_LAB_EXTENSION_KEY]: extension,
      },
    };
    const doc = withSceneDocumentExtension(baseDoc, {
      scripts: [
        {
          id: "construction-lab-script",
          title: sceneName,
          kind: "construction",
          language: "math3d-scene-script",
          source: scriptText,
          updatedAt: baseDoc.updatedAt,
        },
      ],
      workbookWorkspace: {
        version: 2,
        savedAt: baseDoc.updatedAt,
        geometry: {
          mode: "scratch",
          scratchScene: {
            nodes,
            checkDefs,
            constraints,
            selectedNodeId,
            scriptText,
            solids,
            selectedSolidId,
          },
        },
      },
    });
    const project = createSceneProjectDocument(doc);
    try {
      const blob = new Blob([serializeSceneProject(project)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${cleanId(sceneName) || "problem_scene"}.math3d.scene.json`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setScriptError(`Scene export failed: ${String(err)}`);
    }
  }, [checkDefs, constraints, nodes, sceneMetadata, sceneMode, sceneName, sceneType, scriptText, selectedNodeId, selectedSolidId, solids, solved.scene]);

  const exportSceneScript = useCallback(() => {
    try {
      const blob = new Blob([scriptText], { type: "text/plain" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${cleanId(sceneName) || "problem_scene"}.scene.txt`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      setScriptError(`Scene script export failed: ${String(err)}`);
    }
  }, [sceneName, scriptText]);

  const importSceneBundle = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result ?? "");
        const parsedProject = deserializeSceneProject(raw);

        let nextNodes: ConstructionNode[] | null = null;
        let nextChecks: ProblemCheckDef[] | null = null;
        let nextConstraints: ConstructionConstraintDef[] = [];
        let nextSolids: ScratchSolid[] = [];
        let nextSelectedSolidId: string | null = null;
        let nextScript: string | null = null;
        let nextSceneName: string | null = null;
        let nextSceneType: SceneType = "task";
        let nextSceneMode: SceneMode = "plane2d";
        let nextMetadata = "";

        if (parsedProject.ok) {
          const versionedExt = getSceneDocumentExtension(parsedProject.value.scene);
          const workspace = versionedExt?.workbookWorkspace as any;
          const scratchScene = workspace?.geometry?.scratchScene;
          const versionedScript =
            versionedExt?.scripts?.find((script) => script.kind === "construction") ??
            versionedExt?.scripts?.[0] ??
            null;
          if (scratchScene && Array.isArray(scratchScene.nodes) && Array.isArray(scratchScene.checkDefs)) {
            nextNodes = scratchScene.nodes as ConstructionNode[];
            nextChecks = scratchScene.checkDefs as ProblemCheckDef[];
            nextConstraints = Array.isArray(scratchScene.constraints)
              ? (scratchScene.constraints as ConstructionConstraintDef[])
              : [];
            nextSolids = Array.isArray(scratchScene.solids) ? scratchScene.solids as ScratchSolid[] : [];
            nextSelectedSolidId = typeof scratchScene.selectedSolidId === "string" ? scratchScene.selectedSolidId : null;
            nextScript =
              typeof scratchScene.scriptText === "string"
                ? scratchScene.scriptText
                : typeof versionedScript?.source === "string"
                  ? versionedScript.source
                  : null;
            nextSceneName = parsedProject.value.scene.title || "Imported scene";
            nextSceneType = "task";
            nextSceneMode = "plane2d";
            nextMetadata =
              typeof parsedProject.value.scene.metadata?.description === "string"
                ? parsedProject.value.scene.metadata.description
                : "";
          }

          const ext = parsedProject.value.scene.extensions?.[CONSTRUCTION_LAB_EXTENSION_KEY];
          const extObj = ext && typeof ext === "object" ? (ext as Partial<ConstructionLabExtension>) : null;
          if (!nextNodes && extObj && Array.isArray(extObj.nodes) && Array.isArray(extObj.checks)) {
            nextNodes = extObj.nodes as ConstructionNode[];
            nextChecks = extObj.checks as ProblemCheckDef[];
            nextConstraints = Array.isArray(extObj.constraints) ? (extObj.constraints as ConstructionConstraintDef[]) : [];
            nextSolids = Array.isArray(extObj.solids) ? extObj.solids as ScratchSolid[] : [];
            nextSelectedSolidId = typeof extObj.selectedSolidId === "string" ? extObj.selectedSolidId : null;
            nextScript =
              typeof extObj.script === "string"
                ? extObj.script
                : typeof versionedScript?.source === "string"
                  ? versionedScript.source
                  : null;
            nextSceneName = parsedProject.value.scene.title || "Imported scene";
            nextSceneType = extObj.sceneType === "demo" || extObj.sceneType === "free" ? extObj.sceneType : "task";
            nextSceneMode = extObj.sceneMode === "space3d" ? "space3d" : "plane2d";
            nextMetadata =
              typeof extObj.metadata === "string"
                ? extObj.metadata
                : typeof parsedProject.value.scene.metadata?.description === "string"
                  ? parsedProject.value.scene.metadata.description
                  : "";
          }
        }

        if (!nextNodes || !nextChecks) {
          const parsedLegacy = JSON.parse(raw) as Partial<SceneBundle>;
          if (!Array.isArray(parsedLegacy.nodes) || !Array.isArray(parsedLegacy.checks)) {
            throw new Error("Missing nodes/checks arrays.");
          }
          nextNodes = parsedLegacy.nodes as ConstructionNode[];
          nextChecks = parsedLegacy.checks as ProblemCheckDef[];
          nextConstraints = Array.isArray(parsedLegacy.constraints) ? (parsedLegacy.constraints as ConstructionConstraintDef[]) : [];
          nextSolids = Array.isArray(parsedLegacy.solids) ? parsedLegacy.solids as ScratchSolid[] : [];
          nextSelectedSolidId = typeof parsedLegacy.selectedSolidId === "string" ? parsedLegacy.selectedSolidId : null;
          nextScript = typeof parsedLegacy.script === "string" ? parsedLegacy.script : null;
          nextSceneName = typeof parsedLegacy.sceneName === "string" && parsedLegacy.sceneName.trim() ? parsedLegacy.sceneName : "Imported scene";
          nextSceneType = parsedLegacy.sceneType === "demo" || parsedLegacy.sceneType === "free" ? parsedLegacy.sceneType : "task";
          nextSceneMode = parsedLegacy.sceneMode === "space3d" ? "space3d" : "plane2d";
          nextMetadata = typeof parsedLegacy.metadata === "string" ? parsedLegacy.metadata : "";
        }

        if (!nextNodes.length) throw new Error("Imported scene has no nodes.");
        setNodes(nextNodes);
        setCheckDefs(nextChecks);
        setConstraints(nextConstraints);
        setSolids(nextSolids);
        setSelectedSolidId(nextSolids.some((solid) => solid.id === nextSelectedSolidId) ? nextSelectedSolidId : null);
        setLockedNodeIds(new Set());
        setHelperNodeIds(new Set());
        setDisabledCheckIds(new Set());
        setSelectedNodeId(nextNodes[0].id);
        setScriptText(
          typeof nextScript === "string" && nextScript.trim().length
            ? nextScript
            : buildScriptFromState(nextNodes, nextChecks, nextConstraints)
        );
        setSceneName(nextSceneName ?? "Imported scene");
        setSceneType(nextSceneType);
        setSceneMode(nextSceneMode);
        setSceneMetadata(nextMetadata);
        setScriptError(null);
        setWorkspaceTab("scene");
      } catch (err) {
        setScriptError(`Scene import failed: ${String(err)}`);
      }
    };
    reader.onerror = () => setScriptError("Scene import failed while reading file.");
    reader.readAsText(file);
  }, []);

  const insertScriptTemplate = useCallback(() => {
    if (!selectedScriptTemplate) return;
    setScriptText((prev) => (prev.trim().length ? `${prev.trimEnd()}\n${selectedScriptTemplate}` : selectedScriptTemplate));
  }, [selectedScriptTemplate]);

  const cloneIntoGeometry3D = useCallback(() => {
    try {
      globalThis.dispatchEvent(
        new CustomEvent("math3d:problem-scene:clone-to-geometry3d", {
          detail: {
            scene: solved.scene,
            labels,
            name: sceneName,
          },
        })
      );
      setScriptError(null);
    } catch (err) {
      setScriptError(`Clone to Geometry 3D failed: ${String(err)}`);
    }
  }, [labels, sceneName, solved.scene]);

  const createFromSelection = useCallback(() => {
    if (!selectedNodeId) {
      setToolError("Select an object first.");
      return;
    }
    const selected = graphObjectById.get(selectedNodeId);
    if (!selected || selected.type !== "point") {
      setToolError("Create from selection currently supports point objects.");
      return;
    }
    const point = solved.points[selectedNodeId];
    if (!point) {
      setToolError("Selected point is not solved.");
      return;
    }
    const ids = new Set(nodes.map((node) => node.id));
    const id = uniqueId(`${selectedNodeId}_copy`, ids);
    addNode(
      {
        id,
        label: `${selectedNodeId} copy`,
        type: "freePoint",
        point: { x: point.x, y: point.y, z: point.z },
        style: { color: 0xef4444, size: 0.045 },
      },
      "create"
    );
    setToolError(null);
  }, [addNode, graphObjectById, nodes, selectedNodeId, solved.points]);

  const useSelectedAsSelectionSlot = useCallback((slot: "a" | "b") => {
    if (!selectedNodeId) return;
    if (slot === "a") setSelectionAId(selectedNodeId);
    else setSelectionBId(selectedNodeId);
  }, [selectedNodeId]);

  const selectionA = selectionAId ? graphObjectById.get(selectionAId) ?? null : null;
  const selectionB = selectionBId ? graphObjectById.get(selectionBId) ?? null : null;

  const createClaimFromSelection = useCallback(() => {
    setCheckError(null);
    if (!selectionA || !selectionB) {
      setCheckError("Select two objects for claim creation.");
      return;
    }
    const id = `check_${checkDefs.length + 1}`;
    if (selectionA.type === "point" && selectionB.type === "circle") {
      setCheckDefs((prev) => [
        ...prev,
        {
          id,
          label: `${selectionA.id} on ${selectionB.id}`,
          type: "pointOnCircle",
          point: selectionA.id,
          circle: selectionB.id,
          tolerance: 2e-3,
        },
      ]);
      return;
    }
    if (selectionA.type === "circle" && selectionB.type === "point") {
      setCheckDefs((prev) => [
        ...prev,
        {
          id,
          label: `${selectionB.id} on ${selectionA.id}`,
          type: "pointOnCircle",
          point: selectionB.id,
          circle: selectionA.id,
          tolerance: 2e-3,
        },
      ]);
      return;
    }
    if (selectionA.type === "line" && selectionB.type === "line") {
      setCheckDefs((prev) => [
        ...prev,
        {
          id,
          label: `${selectionA.id} parallel ${selectionB.id}`,
          type: "parallel",
          lines: [selectionA.id, selectionB.id],
          toleranceDeg: 0.6,
        },
      ]);
      return;
    }
    setCheckError("No automatic claim rule for this selection pair.");
  }, [checkDefs.length, selectionA, selectionB]);

  const createObjectFromSelectionAssistant = useCallback((kind: "line" | "midpoint" | "perpBisector" | "perpendicular" | "parallel") => {
    setToolError(null);
    if (!selectionA || !selectionB) {
      setToolError("Select two objects first.");
      return;
    }
    const ids = new Set(nodes.map((node) => node.id));
    if (kind === "line" || kind === "midpoint" || kind === "perpBisector") {
      if (!(selectionA.type === "point" && selectionB.type === "point")) {
        setToolError("This suggestion requires two points.");
        return;
      }
      if (kind === "line") {
        const id = uniqueId(`${selectionA.id}${selectionB.id}`, ids);
        addNode({
          id,
          label: id,
          type: "lineThroughPoints",
          a: selectionA.id,
          b: selectionB.id,
          style: { color: 0x6b7280, length: 6 },
        }, "create");
        return;
      }
      if (kind === "midpoint") {
        const id = uniqueId("M", ids);
        addNode({
          id,
          label: id,
          type: "midpoint",
          a: selectionA.id,
          b: selectionB.id,
          style: { color: 0x22c55e, size: 0.045 },
        }, "create");
        return;
      }
      const id = uniqueId(`bis${selectionA.id}${selectionB.id}`, ids);
      addNode({
        id,
        label: id,
        type: "perpendicularBisector",
        a: selectionA.id,
        b: selectionB.id,
        style: { color: 0x0891b2, length: 6 },
      }, "create");
      return;
    }

    const lineObj = selectionA.type === "line" ? selectionA : selectionB.type === "line" ? selectionB : null;
    const pointObj = selectionA.type === "point" ? selectionA : selectionB.type === "point" ? selectionB : null;
    if (!lineObj || !pointObj) {
      setToolError("Needs one line and one point.");
      return;
    }
    if (kind === "perpendicular") {
      const id = uniqueId(`${pointObj.id}_perp_${lineObj.id}`, ids);
      addNode({
        id,
        label: id,
        type: "perpendicularLine",
        line: lineObj.id,
        point: pointObj.id,
        style: { color: 0x0f766e, length: 6 },
      }, "create");
      return;
    }
    const id = uniqueId(`${pointObj.id}_parallel_${lineObj.id}`, ids);
    addNode({
      id,
      label: id,
      type: "parallelLine",
      line: lineObj.id,
      point: pointObj.id,
      style: { color: 0x7c3aed, length: 6 },
    }, "create");
  }, [addNode, nodes, selectionA, selectionB]);

  const renderToolInputs = () => {
    if (tool === "point") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <input type="number" placeholder="x" value={toolValue("x")} onChange={(e) => updateToolField("x", e.target.value)} />
          <input type="number" placeholder="y" value={toolValue("y")} onChange={(e) => updateToolField("y", e.target.value)} />
          <input type="number" placeholder="z" value={toolValue("z")} onChange={(e) => updateToolField("z", e.target.value)} />
        </div>
      );
    }
    if (tool === "line" || tool === "perpBisector" || tool === "midpoint") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <select value={toolValue("a")} onChange={(e) => updateToolField("a", e.target.value)}>
            <option value="">point a</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("b")} onChange={(e) => updateToolField("b", e.target.value)}>
            <option value="">point b</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (tool === "circle") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <select value={toolValue("center")} onChange={(e) => updateToolField("center", e.target.value)}>
            <option value="">center</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("point")} onChange={(e) => updateToolField("point", e.target.value)}>
            <option value="">point</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (tool === "circle3" || tool === "circumcircle" || tool === "circumcenter") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <select value={toolValue("a")} onChange={(e) => updateToolField("a", e.target.value)}>
            <option value="">a</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("b")} onChange={(e) => updateToolField("b", e.target.value)}>
            <option value="">b</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("c")} onChange={(e) => updateToolField("c", e.target.value)}>
            <option value="">c</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (tool === "perpendicular" || tool === "parallel") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <select value={toolValue("line")} onChange={(e) => updateToolField("line", e.target.value)}>
            <option value="">line</option>
            {lineIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("point")} onChange={(e) => updateToolField("point", e.target.value)}>
            <option value="">through point</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (tool === "angleBisector") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <select value={toolValue("vertex")} onChange={(e) => updateToolField("vertex", e.target.value)}>
            <option value="">vertex</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("a")} onChange={(e) => updateToolField("a", e.target.value)}>
            <option value="">a</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("c")} onChange={(e) => updateToolField("c", e.target.value)}>
            <option value="">c</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (tool === "intersection") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <select value={toolValue("lineA")} onChange={(e) => updateToolField("lineA", e.target.value)}>
            <option value="">line A</option>
            {lineIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("lineB")} onChange={(e) => updateToolField("lineB", e.target.value)}>
            <option value="">line B</option>
            {lineIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (tool === "secondIntersection") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <select value={toolValue("line")} onChange={(e) => updateToolField("line", e.target.value)}>
            <option value="">line</option>
            {lineIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("circle")} onChange={(e) => updateToolField("circle", e.target.value)}>
            <option value="">circle</option>
            {circleIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={toolValue("exclude")} onChange={(e) => updateToolField("exclude", e.target.value)}>
            <option value="">exclude point</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
        <select value={toolValue("circle")} onChange={(e) => updateToolField("circle", e.target.value)}>
          <option value="">circle</option>
          {circleIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <select value={toolValue("b")} onChange={(e) => updateToolField("b", e.target.value)}>
          <option value="">B</option>
          {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <select value={toolValue("c")} onChange={(e) => updateToolField("c", e.target.value)}>
          <option value="">C</option>
          {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
        <select value={toolValue("exclude")} onChange={(e) => updateToolField("exclude", e.target.value)}>
          <option value="">exclude</option>
          {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </div>
    );
  };

  const renderCheckInputs = () => {
    if (checkKind === "pointOnCircle") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <select value={checkValue("point")} onChange={(e) => updateCheckField("point", e.target.value)}>
            <option value="">point</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={checkValue("circle")} onChange={(e) => updateCheckField("circle", e.target.value)}>
            <option value="">circle</option>
            {circleIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (checkKind === "perpendicular" || checkKind === "parallel") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <select value={checkValue("lineA")} onChange={(e) => updateCheckField("lineA", e.target.value)}>
            <option value="">line A</option>
            {lineIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={checkValue("lineB")} onChange={(e) => updateCheckField("lineB", e.target.value)}>
            <option value="">line B</option>
            {lineIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      );
    }
    if (checkKind === "collinear") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(["a", "b", "c"] as const).map((key) => (
            <select key={key} value={checkValue(key)} onChange={(e) => updateCheckField(key, e.target.value)}>
              <option value="">{key}</option>
              {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          ))}
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {(["a", "b", "c", "d"] as const).map((key) => (
          <select key={key} value={checkValue(key)} onChange={(e) => updateCheckField(key, e.target.value)}>
            <option value="">{key}</option>
            {pointIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        ))}
      </div>
    );
  };

  const renderScriptInspector = (content: React.ReactElement): React.ReactNode => {
    if (scriptInspectorPortalTarget) return createPortal(content, scriptInspectorPortalTarget);
    if (hideScriptInspector) return null;
    return content;
  };

  return (
    <div className="construction-lab-panel" style={{ display: "grid", gap: 12, minWidth: 0, maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {!hideWorkspaceTabs &&
          (["task", "build", "inspect", "claims", "script", "scene"] as ConstructionWorkspaceTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWorkspaceTab(tab)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid " + (workspaceTab === tab ? "#0a66c2" : "#d1d5db"),
                background: workspaceTab === tab ? "#e6f0ff" : "#fff",
                fontWeight: workspaceTab === tab ? 700 : 500,
                fontSize: 11,
              }}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        <button
          type="button"
          onClick={undoHistory}
          disabled={historyRef.current.index <= 0}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redoHistory}
          disabled={historyRef.current.index >= historyRef.current.stack.length - 1}
          title="Redo (Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z)"
        >
          Redo
        </button>
      </div>
      {(
        <div data-testid="scratch-placement-toolbar" style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={scratchPlacementKind === "point"}
            onClick={() => {
              setWorkspaceTab("build");
              setBuildMode("create");
              setTool("point");
              setScratchPlacementKind("point");
            }}
          >
            Point
          </button>
          <button type="button" onClick={() => { setWorkspaceTab("build"); setBuildMode("create"); setTool("line"); setScratchPlacementKind(null); }}>Line</button>
          <button type="button" onClick={() => { setWorkspaceTab("build"); setBuildMode("create"); setTool("circle"); setScratchPlacementKind(null); }}>Circle</button>
          <span style={{ width: 1, alignSelf: "stretch", background: "#d1d5db" }} />
          {(["box", "sphere", "cylinder", "cone"] as ScratchSolidKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={scratchPlacementKind === kind}
              onClick={() => {
                setWorkspaceTab("build");
                setBuildMode("create");
                setScratchPlacementKind(kind);
              }}
            >
              {kind[0].toUpperCase() + kind.slice(1)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setWorkspaceTab("build");
              setScratchPlacementKind(null);
              setBuildMode("select");
            }}
          >
            Select
          </button>
        </div>
      )}
      <div style={{ display: "grid", gap: 4 }}>
        <input
          type="search"
          value={objectSearchQuery}
          onChange={(e) => setObjectSearchQuery(e.target.value)}
          placeholder="Search objects..."
          aria-label="Search objects"
          style={{ width: "100%", fontSize: 12 }}
        />
        {normalizedObjectSearchQuery && (
          <div style={{ display: "grid", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", fontSize: 10, color: "#64748b" }}>
              <span>
                {filteredSolvedObjects.length} of {solved.objects.length} objects
              </span>
              <button type="button" onClick={() => setObjectSearchQuery("")} style={{ padding: "2px 6px", fontSize: 10 }}>
                Clear
              </button>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {filteredSolvedObjects.slice(0, 8).map((obj) => (
                <button
                  key={`search-${obj.id}`}
                  type="button"
                  onClick={() => selectConstructionObject(obj.id)}
                  onMouseEnter={() => hoverConstructionObjects([obj.id])}
                  onMouseLeave={clearConstructionHover}
                  style={{
                    border: "1px solid " + (selectedNodeId === obj.id ? "#93c5fd" : "#e5e7eb"),
                    borderRadius: 6,
                    background: selectedNodeId === obj.id ? "#eff6ff" : "#fff",
                    padding: "3px 7px",
                    fontSize: 10.5,
                    fontFamily: "monospace",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {obj.label || obj.id}
                </button>
              ))}
              {!filteredSolvedObjects.length && <span style={{ fontSize: 10.5, color: "#64748b" }}>No matches</span>}
            </div>
          </div>
        )}
      </div>

      {workspaceTab === "task" && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>Task statement</div>
          <div style={{ fontSize: 11, lineHeight: 1.45 }}>{OLYMPIAD_ARC_TASK_TEXT_PL}</div>
          <div style={{ fontSize: 11, lineHeight: 1.45, opacity: 0.75 }}>{OLYMPIAD_ARC_TASK_TEXT_EN}</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Embedded script already builds O, Omega, M, Gamma, points P/Q, bisector(PQ), A_perp_BC, and X check on Omega.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setWorkspaceTab("build")}>Open Build</button>
            <button type="button" onClick={() => setWorkspaceTab("claims")}>Open Claims</button>
            <button type="button" onClick={() => setWorkspaceTab("script")}>Open Script</button>
            <button type="button" onClick={resetToEmbeddedTask}>Reload embedded task</button>
          </div>
        </div>
      )}

      {workspaceTab === "build" && (
        <>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginRight: 6 }}>Guided build:</div>
            {(["select", "create", "check"] as BuildMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBuildMode(mode)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: "1px solid " + (buildMode === mode ? "#0a66c2" : "#d1d5db"),
                  background: buildMode === mode ? "#e6f0ff" : "#fff",
                  fontWeight: buildMode === mode ? 700 : 500,
                  fontSize: 11,
                }}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 8,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Scene contents</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 10, opacity: 0.72 }}>
              {sceneObjectStats.visible + solids.filter((solid) => solid.visible).length}/{sceneObjectStats.total + solids.length} visible
            </div>
            <button type="button" onClick={() => setHelpersVisible((v) => !v)} style={{ fontSize: 10, padding: "2px 6px" }}>
              {helpersVisible ? "Hide helpers" : "Show helpers"}
            </button>
          </div>
        </div>
        {sceneObjectStats.total > 0 || solids.length > 0 ? (
          <>
            <div style={{ fontSize: 10, opacity: 0.72 }}>
              Points {sceneObjectStats.point} · Lines {sceneObjectStats.line} · Circles {sceneObjectStats.circle}
              {sceneObjectStats.invalid > 0 ? ` · Invalid ${sceneObjectStats.invalid}` : ""}
            </div>
            <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
              {filteredSolvedObjects.map((obj) => (
                <div
                  key={obj.id}
                  onMouseEnter={() => hoverConstructionObjects([obj.id])}
                  onMouseLeave={clearConstructionHover}
                  onClick={() => {
                    setSelectedNodeId(obj.id);
                    setSelectedSolidId(null);
                    setBuildMode("select");
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto",
                    gap: 6,
                    alignItems: "center",
                    border: selectedNodeId === obj.id ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "4px 6px",
                    background: selectedNodeId === obj.id ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!obj.hidden}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleNodeVisible(obj.id)}
                    title="Visible"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNodeId(obj.id);
                      setBuildMode("select");
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      textAlign: "left",
                      padding: 0,
                      cursor: "pointer",
                      display: "flex",
                      gap: 6,
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{obj.label || obj.id}</span>
                    <span style={{ fontSize: 10, opacity: 0.65 }}>{obj.type}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      focusNodeInScene(obj.id);
                    }}
                    style={{ padding: "2px 6px", fontSize: 10 }}
                  >
                    Focus
                  </button>
                  <span style={{ fontSize: 10, color: obj.valid ? "#2e7d32" : "#b42318", fontWeight: 700 }}>
                    {obj.valid ? "OK" : "ERR"}
                  </span>
                </div>
              ))}
              {solids.map((solid) => (
                <div
                  key={solid.id}
                  onClick={() => {
                    setSelectedSolidId(solid.id);
                    setSelectedNodeId("");
                    setBuildMode("select");
                    setWorkspaceTab("build");
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 6,
                    alignItems: "center",
                    border: selectedSolidId === solid.id ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "4px 6px",
                    background: selectedSolidId === solid.id ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={solid.visible}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() =>
                      setSolids((prev) => prev.map((entry) => entry.id === solid.id ? { ...entry, visible: !entry.visible } : entry))
                    }
                  />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{solid.name} <small>({solid.type})</small></span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSolids((prev) => prev.filter((entry) => entry.id !== solid.id));
                      setSelectedSolidId((current) => current === solid.id ? null : current);
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
              {!filteredSolvedObjects.length && normalizedObjectSearchQuery && (
                <div style={{ fontSize: 11, opacity: 0.7 }}>No objects match this search.</div>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, opacity: 0.7 }}>No scene objects yet.</div>
        )}
        {solved.errors.length > 0 && (
          <div style={{ fontSize: 10, color: "#b42318" }}>{solved.errors[0]}</div>
        )}
      </div>

      {buildMode === "create" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Construction tools</div>
          {CREATE_GROUPS.map((group) => (
            <div key={group.title} style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>{group.title}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {group.tools.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setTool(kind);
                      setScratchPlacementKind(kind === "point" ? "point" : null);
                    }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 8,
                      border: "1px solid " + (tool === kind ? "#0a66c2" : "#d1d5db"),
                      background: tool === kind ? "#e6f0ff" : "#fff",
                      fontSize: 11,
                    }}
                  >
                    {TOOL_LABELS[kind]}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>
              Action: {TOOL_LABELS[tool]}
            </div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>
              Required inputs: {toolRequiredFields[tool].length ? toolRequiredFields[tool].join(", ") : "none"}
              {missingRequiredToolFields.length
                ? ` · missing: ${missingRequiredToolFields.join(", ")}`
                : " · ready"}
            </div>
            {tool === "point" && (
              <div style={{ fontSize: 11, opacity: 0.72 }}>
                Click in the 3D viewer to place a free point on the construction workplane.
              </div>
            )}
            <input
              type="text"
              placeholder="optional id/alias"
              value={toolValue("id")}
              onChange={(e) => updateToolField("id", e.target.value)}
            />
            {renderToolInputs()}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={handleAddFromCreateTool}>
                Add object
              </button>
              <button type="button" onClick={createFromSelection}>
                Create from selection
              </button>
              <button type="button" onClick={useSelectedObjectsForTool}>
                Use selected objects
              </button>
              <button type="button" onClick={swapToolInputs}>
                Swap inputs
              </button>
              <button type="button" onClick={clearBuildSelections}>
                Clear selection
              </button>
              <button type="button" onClick={() => setHighlightRequiredInputs((v) => !v)}>
                {highlightRequiredInputs ? "Hide required hints" : "Highlight required inputs"}
              </button>
            </div>
            <div style={{ borderTop: "1px dashed #e5e7eb", paddingTop: 8, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>Selection assistant</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 6, alignItems: "center" }}>
                <select value={selectionAId} onChange={(e) => setSelectionAId(e.target.value)}>
                  <option value="">Selection A</option>
                  {solved.objects.map((obj) => (
                    <option key={`a-${obj.id}`} value={obj.id}>{obj.id}</option>
                  ))}
                </select>
                <button type="button" onClick={() => useSelectedAsSelectionSlot("a")}>Use selected</button>
                <select value={selectionBId} onChange={(e) => setSelectionBId(e.target.value)}>
                  <option value="">Selection B</option>
                  {solved.objects.map((obj) => (
                    <option key={`b-${obj.id}`} value={obj.id}>{obj.id}</option>
                  ))}
                </select>
                <button type="button" onClick={() => useSelectedAsSelectionSlot("b")}>Use selected</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={createClaimFromSelection}>Create claim from selection</button>
                <button type="button" onClick={() => createObjectFromSelectionAssistant("midpoint")}>Suggest midpoint</button>
                <button type="button" onClick={() => createObjectFromSelectionAssistant("line")}>Suggest segment/line</button>
                <button type="button" onClick={() => createObjectFromSelectionAssistant("perpBisector")}>
                  Suggest perpendicular bisector
                </button>
                <button type="button" onClick={() => createObjectFromSelectionAssistant("perpendicular")}>
                  Suggest perpendicular through point
                </button>
                <button type="button" onClick={() => createObjectFromSelectionAssistant("parallel")}>
                  Suggest parallel through point
                </button>
              </div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
                A={selectionA?.id ?? "-"} ({selectionA?.type ?? "-"}) · B={selectionB?.id ?? "-"} ({selectionB?.type ?? "-"})
              </div>
            </div>
            {highlightRequiredInputs && missingRequiredToolFields.length > 0 && (
              <div style={{ fontSize: 11, color: "#b42318" }}>
                Missing required inputs: {missingRequiredToolFields.join(", ")}
              </div>
            )}
            {toolError && <div style={{ fontSize: 11, color: "#b42318" }}>{toolError}</div>}
          </div>
        </div>
      )}

      {buildMode === "check" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Checks</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(CHECK_LABELS) as CheckKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setCheckKind(kind)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "1px solid " + (checkKind === kind ? "#0a66c2" : "#d1d5db"),
                  background: checkKind === kind ? "#e6f0ff" : "#fff",
                  fontSize: 11,
                }}
              >
                {CHECK_LABELS[kind]}
              </button>
            ))}
          </div>
          {renderCheckInputs()}
          <button type="button" onClick={handleAddCheck}>Add check</button>
          {checkError && <div style={{ fontSize: 11, color: "#b42318" }}>{checkError}</div>}

          <div style={{ display: "grid", gap: 6 }}>
            {checkResults.map((check) => (
              <div
                key={check.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 11,
                }}
              >
                <span style={{ color: CHECK_BADGE_COLORS[check.status], fontWeight: 700 }}>{check.status}</span>
                <span>{check.label}</span>
                <span style={{ fontFamily: "monospace", opacity: 0.75 }}>
                  {formatConstraintValue(check.residual, check.unit === "deg" ? "deg" : "unit")}
                </span>
                <button type="button" onClick={() => setCheckDefs((prev) => prev.filter((entry) => entry.id !== check.id))}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {buildMode === "select" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Inspector</div>
          {selectedSolid ? (
            <div data-testid="scratch-solid-inspector" style={{ display: "grid", gap: 7, fontSize: 11 }}>
              <div>Selected solid type: <b>{selectedSolid.type}</b></div>
              <label>
                Name
                <input
                  value={selectedSolid.name}
                  onChange={(event) =>
                    setSolids((prev) => prev.map((solid) => solid.id === selectedSolid.id ? { ...solid, name: event.target.value } : solid))
                  }
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              {(["position", "rotation", "scale"] as const).map((group) => (
                <div key={group} style={{ display: "grid", gap: 3 }}>
                  <strong>{group[0].toUpperCase() + group.slice(1)}</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                    {(["x", "y", "z"] as const).map((axis) => (
                      <label key={axis}>
                        {axis}
                        <input
                          type="number"
                          step={group === "rotation" ? 0.1 : 0.05}
                          value={selectedSolid.transform[group][axis]}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (!Number.isFinite(value)) return;
                            setSolids((prev) => prev.map((solid) => solid.id === selectedSolid.id ? {
                              ...solid,
                              transform: {
                                ...solid.transform,
                                [group]: { ...solid.transform[group], [axis]: group === "scale" ? Math.max(0.001, value) : value },
                              },
                            } : solid));
                          }}
                          style={{ width: "100%" }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: "grid", gap: 4 }}>
                <strong>Parameters</strong>
                {Object.entries(selectedSolid.params).map(([key, raw]) => (
                  <label key={key}>
                    {key}
                    {typeof raw === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={raw}
                        onChange={(event) =>
                          setSolids((prev) => prev.map((solid) => solid.id === selectedSolid.id ? {
                            ...solid,
                            params: { ...solid.params, [key]: event.target.checked },
                          } : solid))
                        }
                      />
                    ) : (
                      <input
                        type={typeof raw === "number" ? "number" : "text"}
                        value={String(raw)}
                        onChange={(event) => {
                          const value = typeof raw === "number" ? Number(event.target.value) : event.target.value;
                          if (typeof raw === "number" && !Number.isFinite(value)) return;
                          setSolids((prev) => prev.map((solid) => solid.id === selectedSolid.id ? {
                            ...solid,
                            params: { ...solid.params, [key]: value },
                          } : solid));
                        }}
                        style={{ width: "100%", marginTop: 2 }}
                      />
                    )}
                  </label>
                ))}
              </div>
              <label>
                Color
                <input
                  type="color"
                  value={`#${(selectedSolid.material.color ?? 0x8aa4ff).toString(16).padStart(6, "0")}`}
                  onChange={(event) =>
                    setSolids((prev) => prev.map((solid) => solid.id === selectedSolid.id ? {
                      ...solid,
                      material: { ...solid.material, color: Number.parseInt(event.target.value.slice(1), 16) },
                    } : solid))
                  }
                />
              </label>
              <label>
                Opacity
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selectedSolid.material.opacity ?? 1}
                  onChange={(event) => {
                    const opacity = Number(event.target.value);
                    if (!Number.isFinite(opacity)) return;
                    setSolids((prev) => prev.map((solid) => solid.id === selectedSolid.id ? {
                      ...solid,
                      material: { ...solid.material, opacity: Math.max(0, Math.min(1, opacity)) },
                    } : solid));
                  }}
                />
              </label>
            </div>
          ) : selectedNode ? (
            <div style={{ display: "grid", gap: 6, fontSize: 11 }}>
              <div>Selected object type: <b>{constructionNodeTypeLabel(selectedNode)}</b></div>
              {selectedNode.type !== "freePoint" && renderConstructionFormulaPanel(selectedNode)}
              {renderObjectMetadataPanel(selectedNode)}
              {renderDependencyImpactPanel(selectedNode)}
              <label>
                Rename
                <input
                  type="text"
                  value={selectedNode.label ?? ""}
                  onChange={(e) =>
                    setNodes((prev) =>
                      prev.map((node) => (node.id === selectedNode.id ? { ...node, label: e.target.value } : node))
                    )
                  }
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span>Dependencies:</span>
                {renderConstructionObjectTokens(nodeDependencies(selectedNode))}
              </div>
              <div>Constraints: {selectedNodeUsedByConstraints.join(", ") || "-"}</div>
              <div style={{ fontFamily: "monospace", opacity: 0.75 }}>
                Parameters:{" "}
                {selectedNodeParameters.length
                  ? selectedNodeParameters.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`).join(", ")
                  : "-"}
              </div>
              <div style={{ fontFamily: "monospace", opacity: 0.75 }}>
                Solved: {selectedGraphObject?.summary ?? "No solved value"}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.7 }}>No selected object.</div>
          )}

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Construction graph</div>
            <div style={{ display: "grid", gap: 6 }}>
              {filteredConstructionNodes.map((node, idx) => (
                <div
                  key={node.id}
                  onMouseEnter={() => hoverConstructionObjects([node.id])}
                  onMouseLeave={clearConstructionHover}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto auto 1fr auto auto auto",
                    gap: 6,
                    alignItems: "center",
                    border: selectedNodeId === node.id ? "1px solid #93c5fd" : "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "4px 6px",
                  }}
                >
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{idx + 1}</span>
                  <input
                    type="checkbox"
                    checked={!node.hidden}
                    onChange={() =>
                      setNodes((prev) => prev.map((entry) => (entry.id === node.id ? { ...entry, hidden: !entry.hidden } : entry)))
                    }
                    title="Visible"
                  />
                  <div style={{ display: "grid", gap: 3 }}>
                    <input
                      type="text"
                      value={node.label ?? node.id}
                      onChange={(e) =>
                        setNodes((prev) => prev.map((entry) => (entry.id === node.id ? { ...entry, label: e.target.value } : entry)))
                      }
                      style={{ width: "100%", fontSize: 11 }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(node.id)}
                      style={{ background: "transparent", border: "none", textAlign: "left", padding: 0, cursor: "pointer", fontSize: 10, opacity: 0.7 }}
                    >
                      {node.id} ({node.type})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNodes((prev) => {
                        const i = prev.findIndex((entry) => entry.id === node.id);
                        if (i <= 0) return prev;
                        const next = prev.slice();
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        return next;
                      })
                    }
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNodes((prev) => {
                        const i = prev.findIndex((entry) => entry.id === node.id);
                        if (i < 0 || i >= prev.length - 1) return prev;
                        const next = prev.slice();
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        return next;
                      })
                    }
                  >
                    Down
                  </button>
                  <button type="button" onClick={() => deleteNode(node.id)}>
                    Delete
                  </button>
                </div>
              ))}
              {!filteredConstructionNodes.length && normalizedObjectSearchQuery && (
                <div style={{ fontSize: 11, opacity: 0.7 }}>No construction nodes match this search.</div>
              )}
            </div>
            <button type="button" onClick={() => setNodes((prev) => prev.map((node) => ({ ...node })))} style={{ marginTop: 8 }}>
              Rebuild
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {workspaceTab === "inspect" && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Inspector</div>
          {selectedNode ? (
            <div style={{ display: "grid", gap: 8, fontSize: 11 }}>
              <div>Type: <b>{constructionNodeTypeLabel(selectedNode)}</b></div>
              <div>Alias: <code>{selectedNode.id}</code></div>
              <div>Role: <b>{selectedNode.type === "freePoint" ? "free" : "derived"}</b></div>
              {selectedNode.type !== "freePoint" && renderConstructionFormulaPanel(selectedNode)}
              {renderObjectMetadataPanel(selectedNode)}
              {renderDependencyImpactPanel(selectedNode)}
              <label>
                Name / label
                <input
                  type="text"
                  value={selectedNode.label ?? ""}
                  disabled={selectedNodeLocked}
                  onChange={(e) =>
                    setNodes((prev) =>
                      prev.map((node) => (node.id === selectedNode.id ? { ...node, label: e.target.value } : node))
                    )
                  }
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <div style={{ fontFamily: "monospace", opacity: 0.8 }}>
                Coordinates / equation: {selectedGraphObject?.summary ?? "No solved value"}
              </div>
              <div style={{ fontFamily: "monospace", opacity: 0.8 }}>
                Parameters:{" "}
                {selectedNodeParameters.length
                  ? selectedNodeParameters
                      .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
                      .join(", ")
                  : "-"}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span>Dependencies:</span>
                {renderConstructionObjectTokens(nodeDependencies(selectedNode))}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span>Used by:</span>
                {renderConstructionObjectTokens(selectedNodeUsedBy)}
              </div>
              <div>Used in claims: {selectedNodeUsedByClaims.join(" | ") || "-"}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={!selectedNode.hidden}
                    disabled={selectedNodeLocked}
                    onChange={() => toggleNodeVisible(selectedNode.id)}
                  />
                  visible
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedNodeLocked}
                    onChange={() =>
                      setLockedNodeIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(selectedNode.id)) next.delete(selectedNode.id);
                        else next.add(selectedNode.id);
                        return next;
                      })
                    }
                  />
                  locked
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedNodeHelper}
                    onChange={() =>
                      setHelperNodeIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(selectedNode.id)) next.delete(selectedNode.id);
                        else next.add(selectedNode.id);
                        return next;
                      })
                    }
                  />
                  helper
                </label>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => focusNodeInScene(selectedNode.id)}>
                  Focus in scene
                </button>
                <button
                  type="button"
                  disabled={selectedNodeLocked}
                  onClick={() => deleteNode(selectedNode.id)}
                >
                  Delete
                </button>
                <button type="button" onClick={() => setWorkspaceTab("build")}>Go To Build</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.7 }}>No selected object.</div>
          )}
        </div>
      )}

      {workspaceTab === "claims" && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Claims</div>
            <select
              value={claimsSortMode}
              onChange={(e) => setClaimsSortMode(e.target.value as ClaimsSortMode)}
              style={{ fontSize: 11 }}
            >
              <option value="status">Sort by status</option>
              <option value="name">Sort by name</option>
              <option value="residual">Sort by residual</option>
            </select>
          </div>
          <div
            data-testid="construction-validation-center"
            style={{
              border: "1px solid #dbeafe",
              borderRadius: 8,
              padding: "7px 8px",
              display: "grid",
              gap: 7,
              background: "#f8fbff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, fontWeight: 800 }}>Validation Center</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10.5 }}>
                <span style={{ color: "#166534", fontWeight: 800 }}>Validated: {validationCounts.validated}</span>
                <span style={{ color: "#b42318", fontWeight: 800 }}>Failed: {validationCounts.failed}</span>
                <span style={{ color: "#a16207", fontWeight: 800 }}>Warnings: {validationCounts.warnings}</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {validationRows.map((row) => {
                const color =
                  row.status === "validated" ? "#166534" : row.status === "failed" ? "#b42318" : "#a16207";
                const mark = row.status === "validated" ? "✓" : row.status === "failed" ? "✕" : "!";
                return (
                  <div
                    key={row.id}
                    onMouseEnter={() => hoverConstructionObjects(row.objectIds)}
                    onMouseLeave={clearConstructionHover}
                    onFocus={() => hoverConstructionObjects(row.objectIds)}
                    onBlur={clearConstructionHover}
                    tabIndex={0}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr) auto",
                      gap: 7,
                      alignItems: "center",
                      border: "1px solid #e5e7eb",
                      borderRadius: 7,
                      background: "#fff",
                      padding: "4px 6px",
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color, fontWeight: 900 }}>{mark}</span>
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      {row.claim ? renderClaimStatement(row.claim) : row.kind === "definition" ? <code>{row.label}</code> : row.label}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>
                      {row.kind}
                    </span>
                  </div>
                );
              })}
              {!validationRows.length && <div style={{ fontSize: 11, opacity: 0.7 }}>No validations yet.</div>}
            </div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Add new claim</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(CHECK_LABELS) as CheckKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setCheckKind(kind)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 8,
                    border: "1px solid " + (checkKind === kind ? "#0a66c2" : "#d1d5db"),
                    background: checkKind === kind ? "#e6f0ff" : "#fff",
                    fontSize: 11,
                  }}
                >
                  {CHECK_LABELS[kind]}
                </button>
              ))}
            </div>
            {renderCheckInputs()}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={handleAddCheck}>Add claim</button>
              <button type="button" onClick={createClaimFromSelection}>Create claim from selection</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minWidth: 0 }}>
              <select value={selectionAId} onChange={(e) => setSelectionAId(e.target.value)} style={{ flex: "1 1 100px" }}>
                <option value="">Selection A</option>
                {solved.objects.map((obj) => (
                  <option key={`claims-a-${obj.id}`} value={obj.id}>{obj.id}</option>
                ))}
              </select>
              <button type="button" onClick={() => useSelectedAsSelectionSlot("a")}>Use selected</button>
              <select value={selectionBId} onChange={(e) => setSelectionBId(e.target.value)} style={{ flex: "1 1 100px" }}>
                <option value="">Selection B</option>
                {solved.objects.map((obj) => (
                  <option key={`claims-b-${obj.id}`} value={obj.id}>{obj.id}</option>
                ))}
              </select>
              <button type="button" onClick={() => useSelectedAsSelectionSlot("b")}>Use selected</button>
            </div>
            {checkError && <div style={{ fontSize: 11, color: "#b42318" }}>{checkError}</div>}
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>Active constraints</div>
            {constraints.map((constraint) => (
              <div
                key={constraint.id}
                onMouseEnter={() => hoverConstructionObjects([constraint.targetId, constraint.sourceId])}
                onMouseLeave={clearConstructionHover}
                style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", fontSize: 11 }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={constraint.enabled !== false}
                    onChange={() =>
                      setConstraints((prev) =>
                        prev.map((entry) =>
                          entry.id === constraint.id
                            ? { ...entry, enabled: entry.enabled === false ? undefined : false }
                            : entry
                        )
                      )
                    }
                  />
                  enabled
                </label>
                <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  {constraint.label && <span>{constraint.label}:</span>}
                  {renderConstructionObjectToken(constraint.targetId, `${constraint.id}-target`)}
                  <span>{CONSTRAINT_TYPE_LABELS[constraint.type]}</span>
                  {renderConstructionObjectToken(constraint.sourceId, `${constraint.id}-source`)}
                </span>
                <button type="button" onClick={() => setConstraints((prev) => prev.filter((entry) => entry.id !== constraint.id))}>
                  Delete
                </button>
              </div>
            ))}
            {!constraints.length && <div style={{ fontSize: 11, opacity: 0.7 }}>No active constraints.</div>}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {claimRows.map((claim) => (
              <div
                key={claim.def.id}
                onClick={() => focusClaimInputs(claim.def.id)}
                onMouseEnter={() => hoverConstructionObjects(checkReferencedIds(claim.def))}
                onMouseLeave={clearConstructionHover}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "6px 8px",
                  display: "grid",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: CHECK_BADGE_COLORS[claim.status], fontWeight: 700 }}>
                    {claim.disabled ? "DISABLED" : claim.status.toUpperCase()}
                  </span>
                  <span>{renderClaimStatement(claim.def)}</span>
                  <span style={{ fontFamily: "monospace", opacity: 0.75 }}>
                    {formatConstraintValue(claim.residual, claim.unit === "deg" ? "deg" : "unit")}
                    {" / "}
                    {formatConstraintValue(claim.tolerance, claim.unit === "deg" ? "deg" : "unit")}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!claim.disabled}
                      onChange={() => toggleClaimEnabled(claim.def.id)}
                    />
                    enabled
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    tolerance
                    <input
                      type="number"
                      min={0}
                      step={claim.unit === "deg" ? 0.1 : 0.0005}
                      value={claim.tolerance}
                      onChange={(e) => updateClaimTolerance(claim.def.id, Number(e.target.value))}
                      style={{ width: 90 }}
                    />
                    <span style={{ opacity: 0.7 }}>{claim.unit}</span>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => focusClaimInputs(claim.def.id)} disabled={!checkFocusRefs(claim.def.id).length}>
                    Focus in scene
                  </button>
                  <button type="button" onClick={() => setClaimExplainId((prev) => (prev === claim.def.id ? null : claim.def.id))}>
                    Explain inputs
                  </button>
                  <button type="button" onClick={() => setCheckDefs((prev) => prev.filter((entry) => entry.id !== claim.def.id))}>
                    Delete
                  </button>
                </div>
                {claimExplainId === claim.def.id && (
                  <div style={{ fontFamily: "monospace", fontSize: 10, opacity: 0.85 }}>
                    {explainCheckInputs(claim.def.id)}
                  </div>
                )}
              </div>
            ))}
            {!claimRows.length && <div style={{ fontSize: 11, opacity: 0.7 }}>No claims yet.</div>}
          </div>
        </div>
      )}

      {workspaceTab === "script" && (
        <div
          data-testid="construction-script-workspace"
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: 6,
            boxSizing: "border-box",
            display: "grid",
            gridTemplateRows:
              scriptSurfaceTab === "construction"
                ? scriptTemplatesOpen
                  ? "auto auto minmax(0, 1fr) auto auto"
                  : "auto auto minmax(0, 1fr) auto"
                : "auto auto minmax(0, 1fr) auto",
            gap: 4,
            minWidth: 0,
            maxWidth: "100%",
            height: "min(960px, max(760px, calc(100vh - 150px)))",
            minHeight: 0,
            position: "relative",
          }}
        >
          {scriptSurfaceTab === "construction" && (
            <div
              data-testid="construction-script-editor"
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            />
          )}
          <div
            data-testid="scene-language-tabs"
            style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", minWidth: 0, maxWidth: "100%" }}
          >
            {([
              { id: "script" as const, label: "Script" },
              { id: "construction" as const, label: "Construction" },
              { id: "automation" as const, label: "Automation" },
            ]).map((entry) => {
              const active = scriptSurfaceTab === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setScriptSurfaceTab(entry.id)}
                  aria-pressed={active}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid " + (active ? "#0a66c2" : "#d1d5db"),
                    background: active ? "#e6f0ff" : "#fff",
                    fontSize: 10.5,
                    fontWeight: active ? 800 : 600,
                  }}
                >
                  {entry.label}
                </button>
              );
            })}
            {scriptSurfaceTab === "construction" && (
              <span
                style={{
                  fontSize: 10.5,
                  lineHeight: 1.15,
                  color: scriptParsePreview.error ? "#b42318" : "#166534",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                }}
              >
                {scriptParsePreview.error ? `Parse error: ${scriptParsePreview.error}` : "Parse OK"} ·{" "}
                {scriptParsePreview.nodes.length} objects · {scriptParsePreview.checks.length} claims
              </span>
            )}
            {scriptSurfaceTab === "construction" && scriptError && (
              <span style={{ fontSize: 10.5, lineHeight: 1.15, color: "#b42318", minWidth: 0, overflowWrap: "anywhere" }}>
                {scriptError}
              </span>
            )}
          </div>
          {scriptSurfaceTab === "construction" && (
            <>
              <div
                data-testid="construction-script-context"
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 8,
                  padding: "5px 7px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800 }}>Context</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 5,
                    fontSize: 10.5,
                    lineHeight: 1.2,
                  }}
                >
                  <div><strong>Pack:</strong> {sceneType === "task" ? "Olympiad constructions" : sceneType === "demo" ? "Demo constructions" : "Custom constructions"}</div>
                  <div><strong>Theorem:</strong> {sceneName.trim() || "Untitled construction"}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => selectAdjacentScriptStage(-1)}
                      disabled={!scriptStageSections.length || displayedScriptStageIndex <= 0}
                      style={{ padding: "1px 5px", fontSize: 10, lineHeight: 1.15 }}
                    >
                      {"<"} Prev Stage
                    </button>
                    <strong>Stage:</strong>{" "}
                    <span>{scriptStageSections.length ? `${displayedScriptStageIndex + 1} / ${scriptStageSections.length}` : "0 / 0"}</span>
                    <button
                      type="button"
                      onClick={() => selectAdjacentScriptStage(1)}
                      disabled={!scriptStageSections.length || displayedScriptStageIndex >= scriptStageSections.length - 1}
                      style={{ padding: "1px 5px", fontSize: 10, lineHeight: 1.15 }}
                    >
                      Next Stage {">"}
                    </button>
                  </div>
                  <div><strong>Objects:</strong> {scriptDiagnostics.objectCount}</div>
                  <div><strong>Claims:</strong> {passedClaimCount} passed</div>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
                  gap: 6,
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: "minmax(0, 1fr) auto",
                    gap: 5,
                    minHeight: 0,
                    minWidth: 0,
                  }}
                >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px minmax(0, 1fr)",
                    minHeight: 0,
                    minWidth: 0,
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div
                    ref={scriptLineGutterRef}
                    aria-hidden="true"
                    style={{
                      overflow: "hidden",
                      padding: "6px 6px 6px 0",
                      borderRight: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      color: "#64748b",
                      fontFamily: "monospace",
                      fontSize: 11,
                      lineHeight: "16px",
                      textAlign: "right",
                      userSelect: "none",
                    }}
                  >
                    {scriptLineNumbers.map((lineNumber) => (
                      <div key={lineNumber} style={{ height: 16 }}>
                        {lineNumber}
                      </div>
                    ))}
                  </div>
                  <textarea
                    ref={scriptEditorRef}
                    value={scriptText}
                    onChange={(e) => {
                      setScriptText(e.target.value);
                      setScriptCursorLine(Math.max(1, e.target.value.slice(0, e.target.selectionStart).split(/\r?\n/).length));
                    }}
                    onScroll={syncScriptLineGutterScroll}
                    onSelect={updateScriptCursorLine}
                    onKeyUp={updateScriptCursorLine}
                    onClick={handleScriptEditorClick}
                    aria-label="Scene script editor"
                    wrap="off"
                    spellCheck={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      minHeight: 0,
                      minWidth: 0,
                      resize: "vertical",
                      border: 0,
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "monospace",
                      fontSize: 11,
                      lineHeight: "16px",
                      padding: "6px 8px",
                      whiteSpace: "pre",
                      overflow: "auto",
                    }}
                  />
                </div>
                <div
                  data-testid="construction-script-language-services"
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "5px 6px",
                    background: "#fff",
                    display: "grid",
                    gap: 4,
                    fontSize: 10.5,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                    <strong>Language</strong>
                    {selectedScriptSymbol ? (
                      <>
                        <span style={{ fontFamily: "monospace" }}>{selectedScriptSymbol.id}</span>
                        <span>{scriptSymbolKindLabel(selectedScriptSymbol.kind)}</span>
                        <span style={{ color: "#64748b" }}>Line {selectedScriptSymbol.line}</span>
                        <span style={{ color: "#64748b" }}>Used by {selectedScriptSymbol.usedBy.length}</span>
                      </>
                    ) : (
                      <span style={{ color: "#64748b" }}>No symbol on this line</span>
                    )}
                  </div>
                  <div style={{ color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedScriptSymbol?.summary ?? (currentScriptLineText.trim() || "Move the cursor over a construction command.")}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "#64748b" }}>Suggest</span>
                    {activeCommandSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => applyCommandSuggestion(suggestion)}
                        style={{ padding: "1px 6px", fontSize: 10, lineHeight: 1.2 }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
                </div>
                {renderScriptInspector(
                <div
                  data-testid="construction-script-inspector"
                  style={{
                    border: "1px solid #dbe4f0",
                    borderRadius: 8,
                    background: "#fff",
                    display: "grid",
                    gridTemplateRows: "auto auto minmax(0, 1fr)",
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "6px 7px 4px", borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 11, fontWeight: 800 }}>Inspector</div>
                    <div style={{ marginTop: 3, display: "flex", gap: 5, flexWrap: "wrap", fontSize: 10, color: "#64748b" }}>
                      <span>{scriptObjectStats.points} points</span>
                      <span>{scriptObjectStats.lines} lines</span>
                      <span>{scriptObjectStats.circles} circles</span>
                      <span>{scriptObjectStats.claims} claims</span>
                    </div>
                  </div>
                  <div
                    role="tablist"
                    aria-label="Script inspector"
                    style={{
                      display: "flex",
                      gap: 3,
                      flexWrap: "wrap",
                      padding: "5px 6px",
                      borderBottom: "1px solid #e5e7eb",
                      background: "#f8fafc",
                    }}
                  >
                    {SCRIPT_INSPECTOR_TABS.map((tab) => {
                      const active = scriptInspectorTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setScriptInspectorTab(tab.id)}
                          style={{
                            border: "1px solid " + (active ? "#0a66c2" : "#d1d5db"),
                            borderRadius: 6,
                            background: active ? "#e6f0ff" : "#fff",
                            color: active ? "#0a66c2" : "#334155",
                            padding: "2px 6px",
                            fontSize: 10,
                            lineHeight: 1.2,
                            fontWeight: active ? 800 : 600,
                            cursor: "pointer",
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ minHeight: 0, overflow: "auto", padding: 7 }}>
                    {scriptInspectorTab === "present" && (
                      <div data-testid="construction-presentation-scenes" style={{ display: "grid", gap: 6 }}>
                        <div
                          style={{
                            border: "1px solid #bfdbfe",
                            borderRadius: 6,
                            background: "#eff6ff",
                            color: "#1e3a8a",
                            padding: "6px 7px",
                            fontSize: 10.5,
                            lineHeight: 1.3,
                          }}
                        >
                          <strong>Presentation scenes</strong>
                          <div style={{ marginTop: 2 }}>Load a ready-made construction into the scratch editor.</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 5 }}>
                          {PRESENTATION_SCENE_PRESETS.map((preset) => {
                            const active = sceneName === preset.label && scriptText === preset.script;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                aria-pressed={active}
                                title={preset.summary}
                                onClick={() => loadPresentationScene(preset)}
                                style={{
                                  minWidth: 0,
                                  minHeight: 52,
                                  display: "grid",
                                  alignContent: "center",
                                  gap: 3,
                                  border: `1px solid ${active ? "#2563eb" : "#d1d5db"}`,
                                  borderRadius: 6,
                                  background: active ? "#dbeafe" : "#fff",
                                  color: active ? "#1e40af" : "#0f172a",
                                  padding: "6px 7px",
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                              >
                                <span style={{ fontSize: 10.5, fontWeight: 800, overflowWrap: "anywhere" }}>
                                  {preset.label}
                                </span>
                                <span style={{ color: active ? "#1d4ed8" : "#64748b", fontSize: 9.5, lineHeight: 1.2 }}>
                                  {active ? "Loaded" : "Load scene"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {scriptInspectorTab === "outline" && (
                      <div data-testid="construction-script-outline" style={{ display: "grid", gap: 5 }}>
                        <div
                          style={{
                            border: "1px solid #dbe4f0",
                            borderRadius: 6,
                            background: "#f8fafc",
                            padding: "5px 6px",
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                            fontSize: 10.5,
                          }}
                        >
                          <strong>Scene complexity</strong>
                          <span>Dependencies: {scriptObjectStats.dependencies}</span>
                          <span>Claims: {scriptObjectStats.claims}</span>
                        </div>
                        <div style={{ display: "grid", gap: 2, marginBottom: 4 }}>
                          {scriptOutline.map((entry, index) => {
                            const active = index === displayedScriptStageIndex;
                            return (
                              <button
                                key={`minimap-${entry.line}-${entry.label}`}
                                type="button"
                                aria-label={`Jump to ${entry.label}`}
                                onClick={() => focusScriptLine(entry.line)}
                                title={entry.label}
                                style={{
                                  height: 8,
                                  border: 0,
                                  borderRadius: 999,
                                  background: active ? "#2563eb" : index % 2 === 0 ? "#bae6fd" : "#c7d2fe",
                                  cursor: "pointer",
                                }}
                              />
                            );
                          })}
                        </div>
                        {scriptStageSections.map((stage) => {
                          const active = stage.index === displayedScriptStageIndex;
                          const folded = foldedScriptStageKeys.has(stage.index);
                          const stageStats = scriptStageStatsByIndex.get(stage.index) ?? {
                            points: 0,
                            lines: 0,
                            circles: 0,
                            objects: 0,
                            dependencies: 0,
                            claims: 0,
                          };
                          const stageStatChips = [
                            stageStats.points ? formatCountLabel(stageStats.points, "point") : null,
                            stageStats.lines ? formatCountLabel(stageStats.lines, "line") : null,
                            stageStats.circles ? formatCountLabel(stageStats.circles, "circle") : null,
                            stageStats.objects ? formatCountLabel(stageStats.objects, "object") : null,
                            `Dependencies: ${stageStats.dependencies}`,
                            `Claims: ${stageStats.claims}`,
                          ].filter(Boolean) as string[];
                          const groupedStageSymbols = ([
                            ["point", "Points", stage.symbols.filter((symbol) => symbol.kind === "point")],
                            ["line", "Lines", stage.symbols.filter((symbol) => symbol.kind === "line")],
                            ["circle", "Circles", stage.symbols.filter((symbol) => symbol.kind === "circle")],
                            ["claim", "Claims", stage.symbols.filter((symbol) => symbol.kind === "claim")],
                            ["object", "Objects", stage.symbols.filter((symbol) => symbol.kind === "object")],
                          ] as Array<[ScriptSymbolKind, string, ScriptSymbol[]]>).filter(([, , group]) => group.length > 0);
                          return (
                            <div
                              key={`${stage.line}:${stage.label}`}
                              style={{
                                border: "1px solid " + (active ? "#93c5fd" : "#e5e7eb"),
                                background: active ? "#eff6ff" : "#fff",
                                borderRadius: 6,
                                padding: 5,
                              }}
                            >
                              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={() => toggleScriptStageFold(stage.index)}
                                  aria-label={folded ? `Expand ${stage.label}` : `Collapse ${stage.label}`}
                                  style={{ border: "none", background: "transparent", padding: 0, width: 14, cursor: "pointer" }}
                                >
                                  {folded ? "\u25b6" : "\u25bc"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => selectScriptStage(stage.index)}
                                  style={{
                                    flex: 1,
                                    textAlign: "left",
                                    border: "none",
                                    background: "transparent",
                                    padding: 0,
                                    fontSize: 10.5,
                                    lineHeight: 1.2,
                                    cursor: "pointer",
                                    fontWeight: active ? 800 : 600,
                                  }}
                                >
                                  {stage.label}
                                </button>
                                <span style={{ fontSize: 10, color: "#64748b" }}>[{stage.symbols.length}]</span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5, paddingLeft: 18 }}>
                                {stageStatChips.map((chip) => (
                                  <span
                                    key={`${stage.index}-${chip}`}
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      borderRadius: 999,
                                      background: "#f8fafc",
                                      color: "#475569",
                                      fontSize: 10,
                                      lineHeight: 1.1,
                                      padding: "2px 6px",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {chip}
                                  </span>
                                ))}
                              </div>
                              {!folded && (
                                <div style={{ display: "grid", gap: 4, marginTop: 5, paddingLeft: 18 }}>
                                  {groupedStageSymbols.map(([kind, label, group]) => (
                                    <div key={`${stage.index}-${kind}`}>
                                      <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b" }}>{label}</div>
                                      {group.map((symbol) => (
                                        <button
                                          key={`${stage.index}-${symbol.id}`}
                                          type="button"
                                          onClick={() => focusScriptSymbol(symbol.id)}
                                          style={{
                                            display: "block",
                                            width: "100%",
                                            textAlign: "left",
                                            border: "none",
                                            background: "transparent",
                                            padding: "1px 0",
                                            fontFamily: symbol.kind === "claim" ? undefined : "monospace",
                                            fontSize: 10.5,
                                            cursor: "pointer",
                                          }}
                                        >
                                          {symbol.kind === "claim" ? symbol.label : symbol.id}
                                        </button>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {!scriptStageSections.length && <div style={{ fontSize: 10.5, opacity: 0.7 }}>No sections yet.</div>}
                      </div>
                    )}
                    {scriptInspectorTab === "scene" && (
                      <div data-testid="construction-script-scene-outline" style={{ display: "grid", gap: 2, fontFamily: "monospace", fontSize: 10.5 }}>
                        {scriptSymbols
                          .filter((symbol) => symbol.kind !== "constraint")
                          .map((symbol, index, list) => {
                            const last = index === list.length - 1;
                            const active = selectedScriptSymbol?.id === symbol.id;
                            return (
                              <button
                                key={`scene-${symbol.id}`}
                                type="button"
                                onClick={() => focusScriptSymbol(symbol.id)}
                                style={{
                                  border: "none",
                                  borderRadius: 5,
                                  background: active ? "#eff6ff" : "transparent",
                                  textAlign: "left",
                                  padding: "3px 4px",
                                  cursor: "pointer",
                                  fontFamily: "monospace",
                                  fontSize: 10.5,
                                }}
                              >
                                {last ? "\u2514\u2500 " : "\u251c\u2500 "}
                                {symbol.kind === "claim" ? `Claim: ${symbol.label}` : symbol.id}
                              </button>
                            );
                          })}
                      </div>
                    )}
                    {scriptInspectorTab === "symbols" && (
                      <div data-testid="construction-script-symbol-explorer">
                        {([
                          ["point", "POINTS"],
                          ["line", "LINES"],
                          ["circle", "CIRCLES"],
                          ["claim", "CLAIMS"],
                          ["constraint", "CONSTRAINTS"],
                          ["object", "OBJECTS"],
                        ] as Array<[ScriptSymbolKind, string]>).map(([kind, label]) => {
                          const group = scriptSymbolsByKind[kind];
                          if (!group.length) return null;
                          return (
                            <div key={kind} style={{ marginBottom: 9 }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>{label}</div>
                              <div style={{ display: "grid", gap: 4 }}>
                                {group.map((symbol) => {
                                  const active = selectedScriptSymbol?.id === symbol.id;
                                  return (
                                    <button
                                      key={symbol.id}
                                      type="button"
                                      onClick={() => focusScriptSymbol(symbol.id)}
                                      title={`${scriptSymbolKindLabel(symbol.kind)} ${symbol.id}\n${symbol.summary}\nUsed by ${symbol.usedBy.length} objects`}
                                      style={{
                                        textAlign: "left",
                                        border: "1px solid " + (active ? "#93c5fd" : "#e5e7eb"),
                                        background: active ? "#eff6ff" : "#fff",
                                        borderRadius: 6,
                                        padding: "4px 6px",
                                        fontSize: 10.5,
                                        lineHeight: 1.15,
                                        cursor: "pointer",
                                        fontFamily: symbol.kind === "claim" ? undefined : "monospace",
                                      }}
                                    >
                                      {symbol.kind === "claim" ? symbol.label : symbol.id}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {scriptInspectorTab === "definition" && (
                      <div data-testid="construction-script-definition-view">
                        {selectedScriptSymbol ? (
                          <div style={{ display: "grid", gap: 10 }}>
                            <div
                              style={{
                                border: "1px solid #bfdbfe",
                                borderRadius: 8,
                                background: "#f8fbff",
                                padding: "8px 9px",
                                display: "grid",
                                gap: 8,
                              }}
                            >
                              <strong style={{ fontFamily: "monospace", fontSize: 13, overflowWrap: "anywhere" }}>
                                {selectedScriptSymbol.id}
                              </strong>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "auto minmax(0, 1fr)",
                                  gap: "5px 9px",
                                  alignItems: "baseline",
                                  fontSize: 10.5,
                                }}
                              >
                                <span style={{ color: "#64748b", fontWeight: 800 }}>Type</span>
                                <strong>
                                  {selectedScriptNode
                                    ? constructionNodeTypeLabel(selectedScriptNode)
                                    : scriptSymbolKindLabel(selectedScriptSymbol.kind)}
                                </strong>
                                <span style={{ color: "#64748b", fontWeight: 800 }}>Definition</span>
                                <code style={{ color: "#1d4ed8", fontWeight: 800, overflowWrap: "anywhere" }}>
                                  {selectedScriptNode ? constructionNodeExpression(selectedScriptNode) : selectedScriptSymbol.summary}
                                </code>
                                <span style={{ color: "#64748b", fontWeight: 800 }}>Inputs</span>
                                <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {selectedScriptSymbol.dependencies.map((id) => (
                                    <button
                                      key={`definition-input-${id}`}
                                      type="button"
                                      onClick={() => focusScriptSymbol(id)}
                                      disabled={!scriptSymbolById.has(id)}
                                      style={{ padding: "2px 6px", fontSize: 10.5, fontFamily: "monospace" }}
                                    >
                                      {id}
                                    </button>
                                  ))}
                                  {!selectedScriptSymbol.dependencies.length && <span style={{ color: "#64748b" }}>None</span>}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 5 }}>
                              {[
                                ["Dependencies", selectedScriptSymbol.dependencies.length],
                                ["Dependents", selectedScriptDependents.length],
                                ["Claims", selectedScriptClaims.length],
                              ].map(([label, value]) => (
                                <div
                                  key={label}
                                  style={{
                                    minWidth: 0,
                                    border: "1px solid #e2e8f0",
                                    borderRadius: 7,
                                    background: "#fff",
                                    padding: "6px 5px",
                                    textAlign: "center",
                                  }}
                                >
                                  <div style={{ color: "#64748b", fontSize: 9.5, fontWeight: 800, overflowWrap: "anywhere" }}>
                                    {label}
                                  </div>
                                  <strong style={{ display: "block", marginTop: 2, fontSize: 14 }}>{value}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, opacity: 0.7 }}>Select an object to inspect its definition.</div>
                        )}
                      </div>
                    )}
                    {scriptInspectorTab === "dependencies" && (
                      <div data-testid="construction-script-dependency-view" style={{ display: "grid", gap: 10 }}>
                        {selectedScriptSymbol ? (
                          <>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 800 }}>Selected Object</div>
                              <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "4px 8px", fontSize: 10.5 }}>
                                <span style={{ color: "#64748b" }}>Name</span>
                                <strong style={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>{selectedScriptSymbol.id}</strong>
                                <span style={{ color: "#64748b" }}>Type</span>
                                <span>
                                  {nodes.find((node) => node.id === selectedScriptSymbol.id)
                                    ? constructionNodeTypeLabel(nodes.find((node) => node.id === selectedScriptSymbol.id)!)
                                    : scriptSymbolKindLabel(selectedScriptSymbol.kind)}
                                </span>
                                <span style={{ color: "#64748b" }}>Script Line</span>
                                <span>Line {selectedScriptSymbol.line}</span>
                              </div>
                            </div>
                            {(() => {
                              const node = nodes.find((entry) => entry.id === selectedScriptSymbol.id) ?? null;
                              return node && node.type !== "freePoint" ? renderConstructionFormulaPanel(node) : null;
                            })()}
                            {(() => {
                              const node = nodes.find((entry) => entry.id === selectedScriptSymbol.id) ?? null;
                              return node ? renderObjectMetadataPanel(node) : null;
                            })()}
                            {(() => {
                              const node = nodes.find((entry) => entry.id === selectedScriptSymbol.id) ?? null;
                              return node ? renderDependencyImpactPanel(node) : null;
                            })()}
                            {solved.points[selectedScriptSymbol.id] && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>POSITION</div>
                                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 8px", fontFamily: "monospace", fontSize: 10.5 }}>
                                  <span>X</span><strong>{formatInspectorNumber(solved.points[selectedScriptSymbol.id].x)}</strong>
                                  <span>Y</span><strong>{formatInspectorNumber(solved.points[selectedScriptSymbol.id].y)}</strong>
                                  <span>Z</span><strong>{formatInspectorNumber(solved.points[selectedScriptSymbol.id].z)}</strong>
                                </div>
                              </div>
                            )}
                            {solved.lines[selectedScriptSymbol.id] && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>LINE</div>
                                <div style={{ display: "grid", gap: 3, fontFamily: "monospace", fontSize: 10.5, overflowWrap: "anywhere" }}>
                                  <span>
                                    Origin ({formatInspectorNumber(solved.lines[selectedScriptSymbol.id].origin.x)}, {formatInspectorNumber(solved.lines[selectedScriptSymbol.id].origin.y)}, {formatInspectorNumber(solved.lines[selectedScriptSymbol.id].origin.z)})
                                  </span>
                                  <span>
                                    Direction ({formatInspectorNumber(solved.lines[selectedScriptSymbol.id].direction.x)}, {formatInspectorNumber(solved.lines[selectedScriptSymbol.id].direction.y)}, {formatInspectorNumber(solved.lines[selectedScriptSymbol.id].direction.z)})
                                  </span>
                                </div>
                              </div>
                            )}
                            {solved.circles[selectedScriptSymbol.id] && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>CIRCLE</div>
                                <div style={{ display: "grid", gap: 3, fontFamily: "monospace", fontSize: 10.5, overflowWrap: "anywhere" }}>
                                  <span>
                                    Center ({formatInspectorNumber(solved.circles[selectedScriptSymbol.id].center.x)}, {formatInspectorNumber(solved.circles[selectedScriptSymbol.id].center.y)}, {formatInspectorNumber(solved.circles[selectedScriptSymbol.id].center.z)})
                                  </span>
                                  <span>Radius {formatInspectorNumber(solved.circles[selectedScriptSymbol.id].radius)}</span>
                                </div>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>DEPENDS ON</div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {selectedScriptSymbol.dependencies.map((id) => (
                                  <button
                                    key={`selected-dep-${id}`}
                                    type="button"
                                    onClick={() => focusScriptSymbol(id)}
                                    disabled={!scriptSymbolById.has(id)}
                                    style={{ padding: "2px 6px", fontSize: 10.5, fontFamily: "monospace" }}
                                  >
                                    {id}
                                  </button>
                                ))}
                                {!selectedScriptSymbol.dependencies.length && <span style={{ fontSize: 10.5, color: "#64748b" }}>None</span>}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>USED BY</div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {selectedScriptSymbol.usedBy.map((id) => {
                                  const usedBySymbol = scriptSymbolById.get(id);
                                  return (
                                    <button
                                      key={`selected-used-by-${id}`}
                                      type="button"
                                      onClick={() => focusScriptSymbol(id)}
                                      style={{ padding: "2px 6px", fontSize: 10.5, fontFamily: usedBySymbol?.kind === "claim" ? undefined : "monospace" }}
                                    >
                                      {usedBySymbol?.kind === "claim" ? usedBySymbol.label : id}
                                    </button>
                                  );
                                })}
                                {!selectedScriptSymbol.usedBy.length && <span style={{ fontSize: 10.5, color: "#64748b" }}>None</span>}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>DEPENDENT TREE</div>
                              {renderScriptDependentTree(selectedScriptSymbol)}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>DEPENDS ON TREE</div>
                              {renderScriptDependencyTree(selectedScriptSymbol)}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 10.5, opacity: 0.7 }}>Select a symbol.</div>
                        )}
                      </div>
                    )}
                    {scriptInspectorTab === "claims" && (
                      <div data-testid="construction-script-claims" style={{ display: "grid", gap: 5 }}>
                        {claimRows.map((claim) => (
                          <div
                            key={claim.def.id}
                            role="button"
                            tabIndex={checkFocusRefs(claim.def.id).length ? 0 : -1}
                            onMouseEnter={() => hoverConstructionObjects(checkReferencedIds(claim.def))}
                            onMouseLeave={clearConstructionHover}
                            onClick={() => {
                              focusScriptSymbol(claim.def.id);
                              focusClaimInputs(claim.def.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              focusScriptSymbol(claim.def.id);
                              focusClaimInputs(claim.def.id);
                            }}
                            style={{
                              textAlign: "left",
                              border: "1px solid #e5e7eb",
                              borderRadius: 6,
                              padding: "5px 6px",
                              background: claim.status === "ok" ? "#ecfdf3" : claim.status === "fail" ? "#fef2f2" : "#f8fafc",
                              color: claim.status === "ok" ? "#166534" : claim.status === "fail" ? "#b42318" : "#475569",
                              fontSize: 10.5,
                              lineHeight: 1.2,
                              cursor: checkFocusRefs(claim.def.id).length ? "pointer" : "default",
                            }}
                          >
                            <div style={{ display: "flex", gap: 4, alignItems: "center", fontWeight: 800 }}>
                              <span aria-hidden="true">{claim.status === "ok" ? "\u2713" : claim.status === "fail" ? "\u2716" : "\u2022"}</span>
                              <span>{renderClaimStatement(claim.def)}</span>
                            </div>
                            <div style={{ marginTop: 3, display: "grid", gap: 1, color: "#475569" }}>
                              <span>Status: {claim.status === "ok" ? "Proven" : claim.status === "fail" ? "Failed" : "Unknown"}</span>
                              <span style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                                Objects: {checkReferencedIds(claim.def).map((id, index) => renderConstructionObjectToken(id, `script-claim-${claim.def.id}-${id}-${index}`))}
                              </span>
                              <span>Tolerance: {claim.tolerance.toExponential(1)} {claim.unit}</span>
                              <span>
                                {claim.def.type === "perpendicular"
                                  ? `Computed angle: ${(90 + (claim.residual ?? 0)).toFixed(4)} deg`
                                  : claim.def.type === "parallel"
                                    ? `Computed angle: ${(claim.residual ?? 0).toFixed(4)} deg`
                                    : `Distance error: ${claim.residual == null ? "n/a" : claim.residual.toExponential(2)}`}
                              </span>
                            </div>
                          </div>
                        ))}
                        {!claimRows.length && <div style={{ fontSize: 10.5, opacity: 0.7 }}>No claims yet.</div>}
                      </div>
                    )}
                    {scriptInspectorTab === "history" && (
                      <div data-testid="construction-history-timeline" style={{ display: "grid", gap: 5 }}>
                        <div
                          style={{
                            border: "1px solid #dbe4f0",
                            borderRadius: 6,
                            background: "#f8fafc",
                            padding: "5px 6px",
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                            fontSize: 10.5,
                          }}
                        >
                          <strong>History</strong>
                          <span>{constructionHistoryRows.length} steps</span>
                          <span>{scriptObjectStats.dependencies} dependencies</span>
                          <span>{scriptObjectStats.claims} claims</span>
                        </div>
                        {constructionHistoryRows.map((row) => {
                          const active = selectedScriptSymbol?.id === row.symbol.id;
                          return (
                            <button
                              key={`history-${row.step}-${row.symbol.id}`}
                              type="button"
                              onClick={() => focusScriptSymbol(row.symbol.id)}
                              onMouseEnter={() => hoverConstructionObjects(row.objectIds)}
                              onMouseLeave={clearConstructionHover}
                              onFocus={() => hoverConstructionObjects(row.objectIds)}
                              onBlur={clearConstructionHover}
                              title={`Line ${row.symbol.line}: ${row.symbol.summary}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "2.4ch minmax(0, 1fr) auto",
                                gap: 7,
                                alignItems: "center",
                                textAlign: "left",
                                border: "1px solid " + (active ? "#93c5fd" : "#e5e7eb"),
                                borderRadius: 7,
                                background: active ? "#eff6ff" : "#fff",
                                padding: "5px 7px",
                                cursor: "pointer",
                                fontSize: 10.5,
                              }}
                            >
                              <span style={{ color: "#64748b", fontFamily: "monospace", fontWeight: 800 }}>{row.step}</span>
                              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                                {row.action}
                              </span>
                              <span style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", fontWeight: 800 }}>
                                {scriptSymbolKindLabel(row.symbol.kind)}
                              </span>
                            </button>
                          );
                        })}
                        {!constructionHistoryRows.length && (
                          <div style={{ fontSize: 10.5, opacity: 0.7 }}>No construction history yet.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" onClick={rebuildFromScript} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Run</button>
                  <button
                    type="button"
                    onClick={stepScript}
                    disabled={!executableScriptLines.length || scriptRunStepIndex >= executableScriptLines.length}
                    style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}
                  >
                    Step
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptDebugMode((debug) => !debug)}
                    aria-pressed={scriptDebugMode}
                    style={{
                      padding: "2px 7px",
                      fontSize: 10.5,
                      lineHeight: 1.15,
                      border: "1px solid " + (scriptDebugMode ? "#0a66c2" : "#d1d5db"),
                      background: scriptDebugMode ? "#e6f0ff" : "#fff",
                    }}
                  >
                    Debug
                  </button>
                  <button
                    type="button"
                    onClick={animateScript}
                    disabled={!executableScriptLines.length}
                    style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}
                  >
                    {scriptAnimating ? "Stop" : "Animate"}
                  </button>
                  <button type="button" onClick={resetScriptStepper} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Reset</button>
                  <span style={{ fontSize: 10.5, color: "#64748b" }}>
                    {Math.min(scriptRunStepIndex, executableScriptLines.length)} / {executableScriptLines.length}
                  </span>
                  <button type="button" onClick={regenerateScriptFromScene} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Generate</button>
                  <button
                    type="button"
                    data-testid="construction-script-templates-toggle"
                    onClick={() => setScriptTemplatesOpen((open) => !open)}
                    aria-expanded={scriptTemplatesOpen}
                    style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}
                  >
                    Templates
                  </button>
                  <button type="button" onClick={() => importSceneInputRef.current?.click()} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Import</button>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" onClick={runSelectedScript} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Selection</button>
                  <button type="button" onClick={runScriptFromCursor} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Cursor</button>
                  <button type="button" onClick={() => setPaletteOpen(true)} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Palette</button>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <details style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "2px 6px", minWidth: 0 }}>
                    <summary style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 700, lineHeight: 1.1 }}>Export</summary>
                    <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button type="button" onClick={exportSceneBundle} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>JSON</button>
                      <button type="button" onClick={exportSceneScript} style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}>Script</button>
                    </div>
                  </details>
                  <details
                    id="construction-script-diagnostics"
                    data-testid="construction-script-diagnostics"
                    style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "2px 6px", minWidth: 0 }}
                  >
                    <summary style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 700, lineHeight: 1.1 }}>
                      Diagnostics
                    </summary>
                    <div style={{ marginTop: 7, display: "grid", gap: 6 }}>
                      <div
                        data-testid="construction-script-diagnostic-badges"
                        style={{
                          display: "flex",
                          gap: 5,
                          flexWrap: "nowrap",
                          alignItems: "center",
                          overflowX: "auto",
                          paddingBottom: 1,
                          fontSize: 10.5,
                          fontFamily: "monospace",
                        }}
                      >
                        {[
                          { label: `${scriptDiagnostics.parsedSteps} steps`, color: "#334155", background: "#f8fafc" },
                          { label: `${scriptDiagnostics.objectCount} objects`, color: "#334155", background: "#f8fafc" },
                          { label: `${scriptDiagnostics.claimCount} claim${scriptDiagnostics.claimCount === 1 ? "" : "s"}`, color: "#334155", background: "#f8fafc" },
                          { label: `Errors (${upgradedDiagnosticCounts.errors})`, color: "#b42318", background: "#fef2f2" },
                          { label: `Warnings (${upgradedDiagnosticCounts.warnings})`, color: "#b45309", background: "#fff7ed" },
                          { label: `Hints (${upgradedDiagnosticCounts.hints})`, color: "#1d4ed8", background: "#eff6ff" },
                        ].map((badge) => (
                          <span
                            key={badge.label}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              border: "1px solid #e5e7eb",
                              borderRadius: 999,
                              padding: "1px 6px",
                              color: badge.color,
                              background: badge.background,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      {upgradedScriptDiagnostics.map((diag, idx) => (
                        <button
                          key={`${diag.level}:${diag.line ?? "global"}:${idx}`}
                          type="button"
                          onClick={() => {
                            if (diag.symbolId) focusScriptSymbol(diag.symbolId);
                            else if (diag.line != null) focusScriptLine(diag.line);
                          }}
                          style={{
                            textAlign: "left",
                            border:
                              "1px solid " +
                              (diag.level === "error" ? "#fca5a5" : diag.level === "warning" ? "#fde68a" : "#bfdbfe"),
                            background: diag.level === "error" ? "#fef2f2" : diag.level === "warning" ? "#fffbeb" : "#eff6ff",
                            borderRadius: 6,
                            padding: "4px 6px",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          <strong>{diag.title}</strong>
                          {diag.line != null ? ` - Line ${diag.line}` : ""}: {diag.message}
                        </button>
                      ))}
                      {!upgradedScriptDiagnostics.length && (
                        <div style={{ fontSize: 10.5, color: "#166534" }}>No diagnostics.</div>
                      )}
                      {scriptDebugMode && selectedScriptSymbol && (
                        <div
                          data-testid="construction-script-debug-readout"
                          style={{
                            border: "1px dashed #93c5fd",
                            borderRadius: 6,
                            padding: "4px 6px",
                            background: "#f8fbff",
                            fontFamily: "monospace",
                            fontSize: 10.5,
                          }}
                        >
                          Debug {selectedScriptSymbol.id}: deps [{selectedScriptSymbol.dependencies.join(", ") || "-"}], used by [
                          {selectedScriptSymbol.usedBy.join(", ") || "-"}]
                        </div>
                      )}
                      <div style={{ fontSize: 10, opacity: 0.72 }}>
                        Failed run keeps previous valid scene; fix diagnostics then rerun.
                      </div>
                    </div>
                  </details>
                  <details
                    data-testid="construction-script-sync"
                    style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "2px 6px", minWidth: 0 }}
                  >
                    <summary style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 700, lineHeight: 1.1 }}>Sync</summary>
                    <div style={{ marginTop: 7, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                      <select value={scriptSyncMode} onChange={(e) => setScriptSyncMode(e.target.value as ScriptSyncMode)} style={{ minWidth: 0, flex: "1 1 220px" }}>
                        <option value="overwrite">Overwrite script from scene</option>
                        <option value="appendNew">Append new steps only</option>
                        <option value="keepComments">Keep manual comments</option>
                      </select>
                      <button type="button" onClick={regenerateScriptFromScene}>Apply sync</button>
                    </div>
                  </details>
                </div>
              </div>
          {scriptTemplatesOpen && (
            <div
              data-testid="construction-script-templates"
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "3px 6px" }}
            >
              <div style={{ fontSize: 11, fontWeight: 700 }}>Templates</div>
              <div style={{ marginTop: 7, display: "grid", gap: 7 }}>
                <div style={{ fontSize: 10, opacity: 0.78, display: "grid", gap: 2, overflowWrap: "anywhere" }}>
                  <code style={{ whiteSpace: "pre-wrap" }}>point A -0.2 1.35 0</code>
                  <code style={{ whiteSpace: "pre-wrap" }}>line A B as AB</code>
                  <code style={{ whiteSpace: "pre-wrap" }}>circumcircle A B C as Omega</code>
                  <code style={{ whiteSpace: "pre-wrap" }}>check point-on-circle X Omega</code>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                  <select value={selectedScriptTemplate} onChange={(e) => setSelectedScriptTemplate(e.target.value)} style={{ minWidth: 0, flex: "1 1 220px" }}>
                    {SCRIPT_TEMPLATES.map((entry) => (
                      <option key={entry.label} value={entry.command}>
                        {entry.label}: {entry.command}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={insertScriptTemplate}>Insert template</button>
                </div>
              </div>
            </div>
          )}
            </>
          )}
          {scriptSurfaceTab === "script" && (
            <>
              <div
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 10,
                  padding: "4px 7px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>Procedural Scene Script</div>
                  <button
                    type="button"
                    data-testid="procedural-scene-script-run"
                    onClick={() => onRunProceduralSceneScript?.(proceduralSceneScriptText)}
                    disabled={proceduralScriptPreview.diagnostics.length > 0 || !onRunProceduralSceneScript}
                    style={{ padding: "3px 12px", fontSize: 10.5, lineHeight: 1.15, fontWeight: 800 }}
                  >
                    Run script
                  </button>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.15, color: proceduralScriptPreview.diagnostics.length ? "#b42318" : "#166534" }}>
                  {proceduralScriptPreview.diagnostics.length ? `${proceduralScriptPreview.diagnostics.length} parser errors` : "Parse OK"}
                </div>
                <div style={{ fontSize: 10.5, lineHeight: 1.15, color: "#475569" }}>
                  {formatCountLabel(proceduralScriptPreview.commands.length, "command")} &middot; object/material/visibility language
                </div>
              </div>
              <textarea
                data-testid="procedural-scene-script-editor"
                value={proceduralSceneScriptText}
                onChange={(e) => setProceduralSceneScriptText(e.target.value)}
                aria-label="Procedural scene script editor"
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: 0,
                  minWidth: 0,
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setProceduralSceneScriptText(PROCEDURAL_SCENE_SCRIPT_STARTER)}
                  style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}
                >
                  Starter
                </button>
                <span style={{ fontSize: 10.5, color: "#475569" }}>
                  Run updates the procedural scene and opens it in the viewer.
                </span>
              </div>
              {(proceduralSceneScriptError || proceduralSceneScriptStatus) && (
                <div style={{ fontSize: 10.5, color: proceduralSceneScriptError ? "#b42318" : "#166534" }}>
                  {proceduralSceneScriptError ?? proceduralSceneScriptStatus}
                </div>
              )}
            </>
          )}
          {scriptSurfaceTab === "automation" && (
            <>
              <div
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 10,
                  padding: "4px 7px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 1,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>Automation Timeline</div>
                <div style={{ fontSize: 11, lineHeight: 1.15, color: automationScriptPreview.diagnostics.length ? "#b42318" : "#166534" }}>
                  {automationScriptPreview.diagnostics.length ? `${automationScriptPreview.diagnostics.length} timeline errors` : "Parse OK"}
                </div>
                <div style={{ fontSize: 10.5, lineHeight: 1.15, color: "#475569" }}>
                  {formatCountLabel(automationScriptPreview.frameCount, "frame")} &middot; {formatCountLabel(automationScriptPreview.actionCount, "action")} &middot; Gallery Timelines bridge
                </div>
              </div>
              <textarea
                data-testid="automation-script-editor"
                value={automationScriptText}
                onChange={(e) => setAutomationScriptText(e.target.value)}
                aria-label="Automation timeline script editor"
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: 0,
                  minWidth: 0,
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  fontSize: 11,
                }}
              />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setAutomationScriptText(AUTOMATION_SCRIPT_STARTER)}
                  style={{ padding: "2px 7px", fontSize: 10.5, lineHeight: 1.15 }}
                >
                  Starter
                </button>
                {automationScriptPreview.diagnostics.length > 0 ? (
                  <span style={{ fontSize: 10.5, color: "#b42318" }}>
                    line {automationScriptPreview.diagnostics[0]?.line}: {automationScriptPreview.diagnostics[0]?.message}
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, color: "#475569" }}>
                    Draft commands: frame, show, hide, move.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {workspaceTab === "scene" && (
        <div style={{ display: "grid", gap: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Scene card</div>
          <label style={{ fontSize: 11 }}>
            Scene name
            <input
              type="text"
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 11 }}>
            Scene type
            <select
              value={sceneType}
              onChange={(e) => setSceneType(e.target.value as SceneType)}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="task">Task</option>
              <option value="free">Free scene</option>
              <option value="demo">Demo</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" checked={sceneMode === "plane2d"} onChange={() => setSceneMode("plane2d")} />
              plane2d
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="radio" checked={sceneMode === "space3d"} onChange={() => setSceneMode("space3d")} />
              space3d
            </label>
          </div>
          <label style={{ fontSize: 11 }}>
            Embedded task metadata
            <textarea
              value={sceneMetadata}
              onChange={(e) => setSceneMetadata(e.target.value)}
              rows={3}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minWidth: 0 }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="preset name"
              style={{ flex: "1 1 140px" }}
            />
            <button type="button" onClick={saveCurrentScriptPreset}>Save as preset</button>
            <select value={selectedPresetName} onChange={(e) => setSelectedPresetName(e.target.value)} style={{ flex: "1 1 140px" }}>
              <option value="">Preset...</option>
              {presetOptions.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name === BUILTIN_TASK_PRESET_NAME ? BUILTIN_TASK_PRESET_LABEL : preset.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={loadSelectedPreset} disabled={!selectedPresetName}>Load</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={deleteSelectedPreset} disabled={!selectedPresetName || selectedPresetIsBuiltin}>
              Delete preset
            </button>
            <button type="button" onClick={resetToEmbeddedTask}>Restore embedded task</button>
            <button type="button" onClick={cloneSceneToPreset}>Duplicate</button>
            <button type="button" onClick={() => importSceneInputRef.current?.click()}>Import</button>
            <button type="button" onClick={exportSceneBundle}>Export scene JSON</button>
            <button type="button" onClick={exportSceneScript}>Export scene script</button>
            <button type="button" onClick={cloneIntoGeometry3D}>Clone into Geometry 3D</button>
          </div>
          <input
            ref={importSceneInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importSceneBundle(file);
              e.currentTarget.value = "";
            }}
          />
        </div>
      )}

      {paletteOpen && (
        <div
          onClick={() => setPaletteOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            zIndex: 70,
            display: "grid",
            placeItems: "start center",
            paddingTop: 80,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(700px, calc(100vw - 32px))",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(15,23,42,0.2)",
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700 }}>Command palette</div>
            <input
              autoFocus
              type="text"
              value={paletteInput}
              onChange={(e) => setPaletteInput(e.target.value)}
              placeholder="Type geometry command..."
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Preview:{" "}
              {palettePreview.ok ? (
                <span style={{ color: "#166534" }}>{palettePreview.summary}</span>
              ) : (
                <span style={{ color: "#b42318" }}>{palettePreview.error}</span>
              )}
            </div>
            {paletteError && <div style={{ fontSize: 11, color: "#b42318" }}>{paletteError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button type="button" onClick={() => setPaletteOpen(false)}>Close</button>
              <button type="button" onClick={executePalette}>Execute</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
