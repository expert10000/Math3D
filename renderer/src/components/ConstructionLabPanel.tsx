import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OverlayLabelSet } from "./SurfaceViewer";
import type { GeometryScene } from "../geometry/types";
import {
  createSceneProjectDocument,
  deserializeSceneProject,
  serializeSceneProject,
  type SceneDocument,
} from "@math3d/core";
import {
  buildPointLabelSet,
  evaluateConstructionGraph,
  evaluateProblemChecks,
  type ConstructionNode,
  type ConstructionObjectSummary,
  type ProblemCheckDef,
  type ProblemCheckResult,
} from "../geometry/problemGraph";
import { formatConstraintValue } from "../geometry/analysis";

type BuildMode = "select" | "create" | "check";
export type ConstructionWorkspaceTab = "task" | "build" | "inspect" | "claims" | "script" | "scene";

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
  | { ok: true; summary: string; node?: ConstructionNode; check?: ProblemCheckDef }
  | { ok: false; error: string };

type ScriptPreset = {
  name: string;
  script: string;
  savedAt: number;
};

type SceneMode = "plane2d" | "space3d";
type SceneType = "task" | "free" | "demo";
type ScriptSyncMode = "overwrite" | "appendNew" | "keepComments";
type ClaimsSortMode = "status" | "name" | "residual";

type SceneBundle = {
  version: number;
  sceneName: string;
  sceneType: SceneType;
  sceneMode: SceneMode;
  metadata: string;
  script: string;
  nodes: ConstructionNode[];
  checks: ProblemCheckDef[];
};

type ConstructionLabExtension = {
  sceneType: SceneType;
  sceneMode: SceneMode;
  metadata: string;
  script: string;
  nodes: ConstructionNode[];
  checks: ProblemCheckDef[];
};

export type ConstructionLabState = {
  scene: GeometryScene;
  labels: OverlayLabelSet[] | null;
  checks: ProblemCheckResult[];
  graphObjects: ConstructionObjectSummary[];
  errors: string[];
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
  selectedNodeId: string;
  scriptText: string;
};

export type ConstructionLabSeed = {
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
  selectedNodeId?: string | null;
  scriptText?: string;
};

type ConstructionLabPanelProps = {
  onChange: (next: ConstructionLabState) => void;
  onPointPlacementModeChange?: (enabled: boolean) => void;
  viewportPickPoint?: { x: number; y: number; z: number } | null;
  onViewportPickConsumed?: () => void;
  onFocusObjectInScene?: (focus: { target: { x: number; y: number; z: number }; radius?: number }) => void;
  seed?: ConstructionLabSeed | null;
  workspaceTab?: ConstructionWorkspaceTab;
  onWorkspaceTabChange?: (tab: ConstructionWorkspaceTab) => void;
  hideWorkspaceTabs?: boolean;
};

type ConstructionHistoryState = {
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
  selectedNodeId: string;
  lockedNodeIds: string[];
  helperNodeIds: string[];
  disabledCheckIds: string[];
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
  { label: "Claim point on circle", command: "check point-on-circle X Omega" },
];

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

const checkReferencedIds = (check: ProblemCheckDef): string[] => {
  if (check.type === "pointOnCircle") return [check.point, check.circle];
  if (check.type === "collinear" || check.type === "concyclic") return [...check.points];
  if (check.type === "perpendicular" || check.type === "parallel") return [...check.lines];
  if (check.type === "equalLength") return [...check.segments[0], ...check.segments[1]];
  if (check.type === "equalAngle") return [...check.angles[0], ...check.angles[1]];
  if (check.type === "samePower") return [check.point, ...check.circles];
  return [];
};

const buildScriptFromState = (nodes: ConstructionNode[], checks: ProblemCheckDef[]) => {
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

  return [...nodeLines, ...checkLines].join("\n");
};

const parseCommandLine = (
  line: string,
  existingNodeIds: Set<string>,
  nextCheckIndex: number
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

  return { ok: false, error: `Unsupported command: ${trimmed}` };
};

const parseSceneScript = (script: string) => {
  const draftNodes: ConstructionNode[] = [];
  const draftChecks: ProblemCheckDef[] = [];
  const ids = new Set<string>();

  const lines = script.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const parsed = parseCommandLine(line, ids, draftChecks.length + 1);
    if (!parsed.ok) {
      return { nodes: draftNodes, checks: draftChecks, error: `Line ${i + 1}: ${parsed.error}` };
    }
    if (parsed.node) {
      draftNodes.push(parsed.node);
      ids.add(parsed.node.id);
    }
    if (parsed.check) {
      draftChecks.push(parsed.check);
    }
  }
  return { nodes: draftNodes, checks: draftChecks, error: null as string | null };
};

const DEFAULT_INITIAL_SCENE = (() => {
  const parsed = parseSceneScript(DEFAULT_OLYMPIAD_ARC_SCRIPT);
  if (!parsed.error && parsed.nodes.length > 0) {
    return {
      nodes: parsed.nodes,
      checks: parsed.checks,
      script: DEFAULT_OLYMPIAD_ARC_SCRIPT,
    };
  }
  return {
    nodes: DEFAULT_FREE_POINTS,
    checks: [] as ProblemCheckDef[],
    script: buildScriptFromState(DEFAULT_FREE_POINTS, []),
  };
})();

const normalizeConstructionSeed = (seed: ConstructionLabSeed | null | undefined) => {
  if (!seed || !Array.isArray(seed.nodes) || !Array.isArray(seed.checkDefs) || !seed.nodes.length) return null;
  const nodes = seed.nodes.map((node) => ({ ...node }));
  const checks = seed.checkDefs.map((check) => ({ ...check }));
  const selectedNodeId =
    typeof seed.selectedNodeId === "string" && nodes.some((node) => node.id === seed.selectedNodeId)
      ? seed.selectedNodeId
      : nodes[0].id;
  const scriptText =
    typeof seed.scriptText === "string" && seed.scriptText.trim().length
      ? seed.scriptText
      : buildScriptFromState(nodes, checks);
  return { nodes, checks, selectedNodeId, scriptText };
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
  onPointPlacementModeChange,
  viewportPickPoint = null,
  onViewportPickConsumed,
  onFocusObjectInScene,
  seed = null,
  workspaceTab: controlledWorkspaceTab,
  onWorkspaceTabChange,
  hideWorkspaceTabs = false,
}) => {
  const seededState = normalizeConstructionSeed(seed);
  const [nodes, setNodes] = useState<ConstructionNode[]>(() =>
    seededState?.nodes ?? DEFAULT_INITIAL_SCENE.nodes.map((node) => ({ ...node }))
  );
  const [checkDefs, setCheckDefs] = useState<ProblemCheckDef[]>(() =>
    seededState?.checks ?? DEFAULT_INITIAL_SCENE.checks.map((check) => ({ ...check }))
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => seededState?.selectedNodeId ?? DEFAULT_INITIAL_SCENE.nodes[0]?.id ?? "");

  const [buildMode, setBuildMode] = useState<BuildMode>("create");
  const [workspaceTabState, setWorkspaceTabState] = useState<ConstructionWorkspaceTab>("build");
  const [tool, setTool] = useState<ToolKind>("point");
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
  const [selectedScriptTemplate, setSelectedScriptTemplate] = useState(SCRIPT_TEMPLATES[0]?.command ?? "");
  const [lockedNodeIds, setLockedNodeIds] = useState<Set<string>>(() => new Set());
  const [helperNodeIds, setHelperNodeIds] = useState<Set<string>>(() => new Set());
  const [claimExplainId, setClaimExplainId] = useState<string | null>(null);
  const importSceneInputRef = useRef<HTMLInputElement | null>(null);
  const scriptEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<{ stack: ConstructionHistoryState[]; index: number; applying: boolean }>({
    stack: [],
    index: -1,
    applying: false,
  });

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInput, setPaletteInput] = useState("");
  const [paletteError, setPaletteError] = useState<string | null>(null);

  const [scriptText, setScriptText] = useState<string>(() => seededState?.scriptText ?? DEFAULT_INITIAL_SCENE.script);
  const [scriptError, setScriptError] = useState<string | null>(null);
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
      helpersVisible
        ? nodes
        : nodes.map((node) => (helperNodeIds.has(node.id) ? { ...node, hidden: true } : node)),
    [helperNodeIds, helpersVisible, nodes]
  );
  const solved = useMemo(() => evaluateConstructionGraph(nodesForSolve), [nodesForSolve]);
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
      errors: solved.errors,
      nodes,
      checkDefs,
      selectedNodeId,
      scriptText,
    });
  }, [onChange, solved, labels, checkResults, nodes, checkDefs, selectedNodeId, scriptText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!isPaletteShortcut) return;
      event.preventDefault();
      setWorkspaceTab("script");
      setPaletteOpen(true);
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, []);

  const pointIds = useMemo(() => nodes.filter(isPointNode).map((node) => node.id), [nodes]);
  const lineIds = useMemo(() => nodes.filter(isLineNode).map((node) => node.id), [nodes]);
  const circleIds = useMemo(() => nodes.filter(isCircleNode).map((node) => node.id), [nodes]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
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

  const graphObjectById = useMemo(() => {
    const map = new Map<string, ConstructionObjectSummary>();
    for (const obj of solved.objects) map.set(obj.id, obj);
    return map;
  }, [solved.objects]);

  const checkDefById = useMemo(() => {
    const map = new Map<string, ProblemCheckDef>();
    for (const check of checkDefs) map.set(check.id, check);
    return map;
  }, [checkDefs]);

  const scriptParsePreview = useMemo(() => parseSceneScript(scriptText), [scriptText]);
  const scriptDiagnostics = useMemo(() => {
    const diagnostics: Array<{ line: number; kind: "error" | "warning"; message: string }> = [];
    const ids = new Set<string>();
    let objectCount = 0;
    let claimCount = 0;
    const lines = scriptText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parsed = parseCommandLine(trimmed, ids, claimCount + 1);
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
    }
    return {
      parsedSteps: objectCount + claimCount,
      objectCount,
      claimCount,
      warnings: diagnostics.filter((d) => d.kind === "warning"),
      errors: diagnostics.filter((d) => d.kind === "error"),
      diagnostics,
    };
  }, [scriptText]);

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
          : Math.abs(def.tolerance ?? 1e-3);
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

  const snapshotCurrent = useCallback((): ConstructionHistoryState => ({
    nodes: nodes.map((node) => ({ ...node, style: node.style ? { ...node.style } : undefined })),
    checkDefs: checkDefs.map((check) => ({ ...check })),
    selectedNodeId,
    lockedNodeIds: Array.from(lockedNodeIds).sort(),
    helperNodeIds: Array.from(helperNodeIds).sort(),
    disabledCheckIds: Array.from(disabledCheckIds).sort(),
  }), [checkDefs, disabledCheckIds, helperNodeIds, lockedNodeIds, nodes, selectedNodeId]);

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
    setSelectedNodeId(state.selectedNodeId);
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
  const pointPlacementMode = workspaceTab === "build" && buildMode === "create" && tool === "point";

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
    setBuildMode(nextMode);
  }, []);

  useEffect(() => {
    onPointPlacementModeChange?.(pointPlacementMode);
  }, [onPointPlacementModeChange, pointPlacementMode]);

  useEffect(() => {
    if (!pointPlacementMode || !viewportPickPoint) return;
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
    setToolForm((prev) => ({
      ...prev,
      x: viewportPickPoint.x.toFixed(3),
      y: viewportPickPoint.y.toFixed(3),
      z: viewportPickPoint.z.toFixed(3),
    }));
    onViewportPickConsumed?.();
  }, [addNode, nodes, onViewportPickConsumed, pointPlacementMode, toolForm, viewportPickPoint]);

  useEffect(() => {
    const ids = new Set(nodes.map((node) => node.id));
    if (!ids.size) {
      if (selectedNodeId) setSelectedNodeId("");
      return;
    }
    if (!selectedNodeId || !ids.has(selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.id ?? "");
    }
  }, [nodes, selectedNodeId]);

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
      return parseCommandLine(command, ids, checkDefs.length + 1);
    },
    [nodes, checkDefs.length]
  );

  const palettePreview = useMemo(() => parseWithCurrentState(paletteInput), [parseWithCurrentState, paletteInput]);

  const executeParsedCommand = (parsed: ParseResult) => {
    if (!parsed.ok) return;
    if (parsed.node) addNode(parsed.node);
    if (parsed.check) {
      setCheckDefs((prev) => [...prev, parsed.check!]);
      setBuildMode("check");
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
  };

  const focusScriptLine = useCallback((lineNumber: number) => {
    const textarea = scriptEditorRef.current;
    if (!textarea || lineNumber < 1) return;
    const lines = scriptText.split(/\r?\n/);
    let start = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) start += lines[i].length + 1;
    const end = start + (lines[lineNumber - 1]?.length ?? 0);
    textarea.focus();
    textarea.setSelectionRange(start, end);
  }, [scriptText]);

  const runScriptFragment = useCallback((fragment: string, startLine = 1) => {
    const lines = fragment.split(/\r?\n/);
    const ids = new Set(nodes.map((node) => node.id));
    const nextNodes = nodes.slice();
    const nextChecks = checkDefs.slice();
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parsed = parseCommandLine(line, ids, nextChecks.length + 1);
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
    }
    setNodes(nextNodes);
    setCheckDefs(nextChecks);
    setScriptError(null);
  }, [checkDefs, focusScriptLine, nodes]);

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
    const generated = buildScriptFromState(nodes, checkDefs);
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
    const cloneScript = buildScriptFromState(nodes, checkDefs);
    setScriptText(cloneScript);
    const suggestedName = `${cleanId(sceneName) || "scene"}_copy`;
    setPresetName(suggestedName);
    saveScriptPreset(suggestedName, cloneScript);
  }, [checkDefs, nodes, saveScriptPreset, sceneName]);

  const exportSceneBundle = useCallback(() => {
    const extension: ConstructionLabExtension = {
      sceneType,
      sceneMode,
      metadata: sceneMetadata,
      script: scriptText,
      nodes,
      checks: checkDefs,
    };
    const doc: SceneDocument = {
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
  }, [checkDefs, nodes, sceneMetadata, sceneMode, sceneName, sceneType, scriptText, solved.scene]);

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
        let nextScript: string | null = null;
        let nextSceneName: string | null = null;
        let nextSceneType: SceneType = "task";
        let nextSceneMode: SceneMode = "plane2d";
        let nextMetadata = "";

        if (parsedProject.ok) {
          const ext = parsedProject.value.scene.extensions?.[CONSTRUCTION_LAB_EXTENSION_KEY];
          const extObj = ext && typeof ext === "object" ? (ext as Partial<ConstructionLabExtension>) : null;
          if (extObj && Array.isArray(extObj.nodes) && Array.isArray(extObj.checks)) {
            nextNodes = extObj.nodes as ConstructionNode[];
            nextChecks = extObj.checks as ProblemCheckDef[];
            nextScript = typeof extObj.script === "string" ? extObj.script : null;
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
          nextScript = typeof parsedLegacy.script === "string" ? parsedLegacy.script : null;
          nextSceneName = typeof parsedLegacy.sceneName === "string" && parsedLegacy.sceneName.trim() ? parsedLegacy.sceneName : "Imported scene";
          nextSceneType = parsedLegacy.sceneType === "demo" || parsedLegacy.sceneType === "free" ? parsedLegacy.sceneType : "task";
          nextSceneMode = parsedLegacy.sceneMode === "space3d" ? "space3d" : "plane2d";
          nextMetadata = typeof parsedLegacy.metadata === "string" ? parsedLegacy.metadata : "";
        }

        if (!nextNodes.length) throw new Error("Imported scene has no nodes.");
        setNodes(nextNodes);
        setCheckDefs(nextChecks);
        setLockedNodeIds(new Set());
        setHelperNodeIds(new Set());
        setDisabledCheckIds(new Set());
        setSelectedNodeId(nextNodes[0].id);
        setScriptText(
          typeof nextScript === "string" && nextScript.trim().length
            ? nextScript
            : buildScriptFromState(nextNodes, nextChecks)
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

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
              {sceneObjectStats.visible}/{sceneObjectStats.total} visible
            </div>
            <button type="button" onClick={() => setHelpersVisible((v) => !v)} style={{ fontSize: 10, padding: "2px 6px" }}>
              {helpersVisible ? "Hide helpers" : "Show helpers"}
            </button>
          </div>
        </div>
        {sceneObjectStats.total > 0 ? (
          <>
            <div style={{ fontSize: 10, opacity: 0.72 }}>
              Points {sceneObjectStats.point} · Lines {sceneObjectStats.line} · Circles {sceneObjectStats.circle}
              {sceneObjectStats.invalid > 0 ? ` · Invalid ${sceneObjectStats.invalid}` : ""}
            </div>
            <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
              {solved.objects.map((obj) => (
                <div
                  key={obj.id}
                  onClick={() => {
                    setSelectedNodeId(obj.id);
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
                    onClick={() => setTool(kind)}
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
          {selectedNode ? (
            <div style={{ display: "grid", gap: 6, fontSize: 11 }}>
              <div>Selected object type: <b>{selectedNode.type}</b></div>
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
              <div>Dependencies: {nodeDependencies(selectedNode).join(", ") || "-"}</div>
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
              {nodes.map((node, idx) => (
                <div
                  key={node.id}
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
                  <button type="button" onClick={() => setNodes((prev) => prev.filter((entry) => entry.id !== node.id))}>
                    Delete
                  </button>
                </div>
              ))}
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
              <div>Type: <b>{selectedNode.type}</b></div>
              <div>Alias: <code>{selectedNode.id}</code></div>
              <div>Role: <b>{selectedNode.type === "freePoint" ? "free" : "derived"}</b></div>
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
              <div>Dependencies: {nodeDependencies(selectedNode).join(", ") || "-"}</div>
              <div>Used by: {selectedNodeUsedBy.join(", ") || "-"}</div>
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
                  onClick={() => setNodes((prev) => prev.filter((node) => node.id !== selectedNode.id))}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
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
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={handleAddCheck}>Add claim</button>
              <button type="button" onClick={createClaimFromSelection}>Create claim from selection</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 6, alignItems: "center" }}>
              <select value={selectionAId} onChange={(e) => setSelectionAId(e.target.value)}>
                <option value="">Selection A</option>
                {solved.objects.map((obj) => (
                  <option key={`claims-a-${obj.id}`} value={obj.id}>{obj.id}</option>
                ))}
              </select>
              <button type="button" onClick={() => useSelectedAsSelectionSlot("a")}>Use selected</button>
              <select value={selectionBId} onChange={(e) => setSelectionBId(e.target.value)}>
                <option value="">Selection B</option>
                {solved.objects.map((obj) => (
                  <option key={`claims-b-${obj.id}`} value={obj.id}>{obj.id}</option>
                ))}
              </select>
              <button type="button" onClick={() => useSelectedAsSelectionSlot("b")}>Use selected</button>
            </div>
            {checkError && <div style={{ fontSize: 11, color: "#b42318" }}>{checkError}</div>}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {claimRows.map((claim) => (
              <div
                key={claim.def.id}
                onClick={() => focusClaimInputs(claim.def.id)}
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
                  <span>{claim.def.label}</span>
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
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Scene script</div>
            <button type="button" onClick={() => setPaletteOpen(true)}>
              Command palette (Ctrl/Cmd+K)
            </button>
          </div>
          <div style={{ fontSize: 11, opacity: 0.78, display: "grid", gap: 2 }}>
            <div><code>point A -0.2 1.35 0</code></div>
            <div><code>line A B as AB</code></div>
            <div><code>circumcircle A B C as Omega</code></div>
            <div><code>check point-on-circle X Omega</code></div>
          </div>
          <div style={{ fontSize: 11, color: scriptParsePreview.error ? "#b42318" : "#166534" }}>
            {scriptParsePreview.error
              ? `Parse error: ${scriptParsePreview.error}`
              : `Parse OK: ${scriptParsePreview.nodes.length} objects, ${scriptParsePreview.checks.length} claims`}
          </div>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 11,
              fontFamily: "monospace",
              display: "grid",
              gap: 2,
            }}
          >
            <div>parsed steps: {scriptDiagnostics.parsedSteps}</div>
            <div>objects created: {scriptDiagnostics.objectCount}</div>
            <div>claims created: {scriptDiagnostics.claimCount}</div>
            <div>warnings: {scriptDiagnostics.warnings.length}</div>
            <div>errors: {scriptDiagnostics.errors.length}</div>
          </div>
          <textarea
            ref={scriptEditorRef}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={10}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
          />
          {scriptDiagnostics.diagnostics.length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              {scriptDiagnostics.diagnostics.map((diag, idx) => (
                <button
                  key={`${diag.line}:${idx}`}
                  type="button"
                  onClick={() => focusScriptLine(diag.line)}
                  style={{
                    textAlign: "left",
                    border: "1px solid " + (diag.kind === "error" ? "#fca5a5" : "#fde68a"),
                    background: diag.kind === "error" ? "#fef2f2" : "#fffbeb",
                    borderRadius: 6,
                    padding: "4px 6px",
                    fontSize: 11,
                    fontFamily: "monospace",
                    cursor: "pointer",
                  }}
                >
                  line {diag.line}: {diag.message}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
            <select value={selectedScriptTemplate} onChange={(e) => setSelectedScriptTemplate(e.target.value)}>
              {SCRIPT_TEMPLATES.map((entry) => (
                <option key={entry.label} value={entry.command}>
                  {entry.label}: {entry.command}
                </option>
              ))}
            </select>
            <button type="button" onClick={insertScriptTemplate}>Insert command template</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={regenerateScriptFromScene}>Generate from scene</button>
            <button type="button" onClick={rebuildFromScript}>Run / rerun</button>
            <button type="button" onClick={runSelectedScript}>Run selected</button>
            <button type="button" onClick={runScriptFromCursor}>Run from cursor</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
            <select value={scriptSyncMode} onChange={(e) => setScriptSyncMode(e.target.value as ScriptSyncMode)}>
              <option value="overwrite">Sync mode: overwrite script from scene</option>
              <option value="appendNew">Sync mode: append new steps only</option>
              <option value="keepComments">Sync mode: keep manual comments</option>
            </select>
            <button type="button" onClick={regenerateScriptFromScene}>Apply sync mode</button>
          </div>
          <div style={{ fontSize: 10, opacity: 0.72 }}>
            Failed run keeps previous valid scene; fix diagnostics then rerun.
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            Preview:{" "}
            {palettePreview.ok ? (
              <span style={{ color: "#166534" }}>{palettePreview.summary}</span>
            ) : (
              <span style={{ color: "#b42318" }}>{palettePreview.error}</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              list="construction-command-suggestions"
              value={paletteInput}
              onChange={(e) => setPaletteInput(e.target.value)}
              placeholder="Quick command autocomplete"
              style={{ fontFamily: "monospace", fontSize: 11 }}
            />
            <button type="button" onClick={executePalette}>Execute command</button>
            <datalist id="construction-command-suggestions">
              {SCRIPT_TEMPLATES.map((entry) => (
                <option key={entry.label} value={entry.command} />
              ))}
            </datalist>
          </div>
          {scriptError && <div style={{ fontSize: 11, color: "#b42318" }}>{scriptError}</div>}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="preset name"
            />
            <button type="button" onClick={saveCurrentScriptPreset}>Save as preset</button>
            <select value={selectedPresetName} onChange={(e) => setSelectedPresetName(e.target.value)}>
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
