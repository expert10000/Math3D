import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { OverlayLabelSet } from "./SurfaceViewer";
import type { GeometryScene } from "../geometry/types";
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
type PowerTab = "palette" | "script";

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

export type ConstructionLabState = {
  scene: GeometryScene;
  labels: OverlayLabelSet[] | null;
  checks: ProblemCheckResult[];
  graphObjects: ConstructionObjectSummary[];
  errors: string[];
  nodes: ConstructionNode[];
  checkDefs: ProblemCheckDef[];
};

type ConstructionLabPanelProps = {
  onChange: (next: ConstructionLabState) => void;
  onPointPlacementModeChange?: (enabled: boolean) => void;
  viewportPickPoint?: { x: number; y: number; z: number } | null;
  onViewportPickConsumed?: () => void;
};

const PRESET_STORAGE_KEY = "math3d.geometry.sceneScriptPresets.v1";

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
}) => {
  const [nodes, setNodes] = useState<ConstructionNode[]>(() => DEFAULT_INITIAL_SCENE.nodes.map((node) => ({ ...node })));
  const [checkDefs, setCheckDefs] = useState<ProblemCheckDef[]>(() => DEFAULT_INITIAL_SCENE.checks.map((check) => ({ ...check })));
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => DEFAULT_INITIAL_SCENE.nodes[0]?.id ?? "");

  const [buildMode, setBuildMode] = useState<BuildMode>("create");
  const [tool, setTool] = useState<ToolKind>("point");
  const [toolForm, setToolForm] = useState<Record<string, string>>({});
  const [toolError, setToolError] = useState<string | null>(null);

  const [checkKind, setCheckKind] = useState<CheckKind>("pointOnCircle");
  const [checkForm, setCheckForm] = useState<Record<string, string>>({});
  const [checkError, setCheckError] = useState<string | null>(null);

  const [powerTab, setPowerTab] = useState<PowerTab>("palette");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInput, setPaletteInput] = useState("");
  const [paletteError, setPaletteError] = useState<string | null>(null);

  const [scriptText, setScriptText] = useState<string>(() => DEFAULT_INITIAL_SCENE.script);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("my-scene");
  const [presets, setPresets] = useState<ScriptPreset[]>(() => loadPresets());
  const [selectedPresetName, setSelectedPresetName] = useState("");

  const solved = useMemo(() => evaluateConstructionGraph(nodes), [nodes]);
  const checkResults = useMemo(() => evaluateProblemChecks(solved, checkDefs), [solved, checkDefs]);
  const labels = useMemo(() => buildPointLabelSet(solved.points), [solved.points]);

  useEffect(() => {
    onChange({
      scene: solved.scene,
      labels,
      checks: checkResults,
      graphObjects: solved.objects,
      errors: solved.errors,
      nodes,
      checkDefs,
    });
  }, [onChange, solved, labels, checkResults, nodes, checkDefs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!isPaletteShortcut) return;
      event.preventDefault();
      setPowerTab("palette");
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

  const updateToolField = (key: string, value: string) => {
    setToolForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateCheckField = (key: string, value: string) => {
    setCheckForm((prev) => ({ ...prev, [key]: value }));
  };
  const toolValue = (key: string) => toolForm[key] ?? "";
  const checkValue = (key: string) => checkForm[key] ?? "";
  const pointPlacementMode = buildMode === "create" && tool === "point";

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

  const rebuildFromScript = () => {
    setScriptError(null);
    const parsed = parseSceneScript(scriptText);
    const draftNodes = parsed.nodes;
    const draftChecks = parsed.checks;
    if (parsed.error) {
      setScriptError(parsed.error);
      return;
    }
    if (!draftNodes.length) {
      setScriptError("Script produced no construction objects.");
      return;
    }
    setNodes(draftNodes);
    setCheckDefs(draftChecks);
    setSelectedNodeId(draftNodes[0].id);
    setBuildMode("select");
  };

  const regenerateScriptFromScene = () => {
    setScriptText(buildScriptFromState(nodes, checkDefs));
    setScriptError(null);
  };

  const saveCurrentScriptPreset = () => {
    const name = cleanId(presetName) || `preset_${Date.now()}`;
    const next: ScriptPreset[] = [
      { name, script: scriptText, savedAt: Date.now() },
      ...presets.filter((preset) => preset.name !== name),
    ].slice(0, 30);
    setPresets(next);
    setSelectedPresetName(name);
    savePresets(next);
  };

  const loadSelectedPreset = () => {
    const preset = presets.find((entry) => entry.name === selectedPresetName);
    if (!preset) return;
    setScriptText(preset.script);
  };

  const deleteSelectedPreset = () => {
    if (!selectedPresetName) return;
    const next = presets.filter((preset) => preset.name !== selectedPresetName);
    setPresets(next);
    setSelectedPresetName("");
    savePresets(next);
  };

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
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
            <button type="button" onClick={handleAddFromCreateTool}>
              Add object
            </button>
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

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Power layer</div>
          <button type="button" onClick={() => { setPowerTab("palette"); setPaletteOpen(true); }}>
            Command palette (Ctrl/Cmd+K)
          </button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["palette", "script"] as PowerTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPowerTab(tab)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid " + (powerTab === tab ? "#0a66c2" : "#d1d5db"),
                background: powerTab === tab ? "#e6f0ff" : "#fff",
                fontSize: 11,
                fontWeight: powerTab === tab ? 700 : 500,
              }}
            >
              {tab === "palette" ? "Command Palette" : "Scene Script"}
            </button>
          ))}
        </div>

        {powerTab === "palette" && (
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Use keyboard shortcut <code>Ctrl+K</code> or <code>Cmd+K</code> to open quick command execution with parse preview.
          </div>
        )}

        {powerTab === "script" && (
          <div style={{ display: "grid", gap: 6 }}>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              rows={10}
              style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={regenerateScriptFromScene}>Generate from scene</button>
              <button type="button" onClick={rebuildFromScript}>Rerun / rebuild scene</button>
            </div>
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
                {presets.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={loadSelectedPreset} disabled={!selectedPresetName}>Load</button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={deleteSelectedPreset} disabled={!selectedPresetName}>Delete preset</button>
            </div>
            {scriptError && <div style={{ fontSize: 11, color: "#b42318" }}>{scriptError}</div>}
          </div>
        )}
      </div>

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
