import type { GeometryScene, Line3, Point3, Vec3 } from "./types";
import {
  angleBisectorLine,
  buildCircleSegments,
  lineFromPointDir,
  lineLineIntersectionCoplanar,
  lineThroughPoints,
} from "./construct";
import {
  EPS,
  addVec3,
  crossVec3,
  distanceVec3,
  dotVec3,
  lengthSqVec3,
  lengthVec3,
  normalizeVec3,
  planeBasis,
  scaleVec3,
  subVec3,
} from "./vec";
import { distancePointToLine } from "./analysis";

export type Circle3 = {
  center: Point3;
  radius: number;
  normal: Vec3;
  color?: number;
  opacity?: number;
  radiusScale?: number;
  segments?: number;
  label?: string;
};

type NodeStyle = {
  color?: number;
  opacity?: number;
  size?: number;
  length?: number;
  radiusScale?: number;
  segments?: number;
};

type NodeBase = {
  id: string;
  label?: string;
  hidden?: boolean;
  style?: NodeStyle;
};

type PointChoice =
  | { mode: "first" }
  | { mode: "second" }
  | { mode: "nearest"; point: string }
  | { mode: "farthest"; point: string }
  | { mode: "otherThan"; point: string; tolerance?: number };

export type ConstructionNode =
  | (NodeBase & { type: "freePoint"; point: Point3 })
  | (NodeBase & { type: "midpoint"; a: string; b: string })
  | (NodeBase & { type: "circumcenter"; a: string; b: string; c: string })
  | (NodeBase & { type: "lineThroughPoints"; a: string; b: string })
  | (NodeBase & { type: "lineFromPointDir"; point: string; direction: Vec3 })
  | (NodeBase & { type: "parallelLine"; point: string; line: string })
  | (NodeBase & {
      type: "perpendicularLine";
      point: string;
      line: string;
      planeNormal?: Vec3;
      planeNormalRef?: string;
    })
  | (NodeBase & {
      type: "perpendicularBisector";
      a: string;
      b: string;
      planeNormal?: Vec3;
      planeNormalRef?: string;
    })
  | (NodeBase & { type: "angleBisector"; vertex: string; a: string; c: string })
  | (NodeBase & { type: "lineLineIntersection"; lineA: string; lineB: string })
  | (NodeBase & { type: "lineCircleIntersection"; line: string; circle: string; choice?: PointChoice })
  | (NodeBase & {
      type: "circleCircleIntersection";
      circleA: string;
      circleB: string;
      choice?: PointChoice;
    })
  | (NodeBase & {
      type: "circleCenterRadius";
      center: string;
      radius: number;
      normal?: Vec3;
      normalRef?: string;
    })
  | (NodeBase & {
      type: "circleCenterPoint";
      center: string;
      point: string;
      normal?: Vec3;
      normalRef?: string;
    })
  | (NodeBase & { type: "circleThrough3Points"; a: string; b: string; c: string })
  | (NodeBase & {
      type: "arcMidpointOnCircle";
      circle: string;
      b: string;
      c: string;
      excludePoint?: string;
    });

type ConstructionValue =
  | { kind: "point"; value: Point3 }
  | { kind: "line"; value: Line3 }
  | { kind: "circle"; value: Circle3 };

export type ConstructionObjectSummary = {
  id: string;
  label: string;
  type: "point" | "line" | "circle";
  summary: string;
  valid: boolean;
  hidden: boolean;
  error?: string;
};

export type ConstructionGraphResult = {
  scene: GeometryScene;
  points: Record<string, Point3>;
  lines: Record<string, Line3>;
  circles: Record<string, Circle3>;
  objects: ConstructionObjectSummary[];
  errors: string[];
};

const DEFAULT_NORMAL: Vec3 = { x: 0, y: 0, z: 1 };
const RAD2DEG = 180 / Math.PI;

const clonePoint = (p: Point3): Point3 => ({ x: p.x, y: p.y, z: p.z });

const toPoint = (id: string, p: Point3, node: NodeBase): Point3 => ({
  ...clonePoint(p),
  id,
  label: node.label ?? id,
  color: node.style?.color,
  size: node.style?.size,
  opacity: node.style?.opacity,
});

const toLine = (line: Line3, node: NodeBase): Line3 => ({
  ...line,
  color: node.style?.color ?? line.color,
  opacity: node.style?.opacity ?? line.opacity,
  length: node.style?.length ?? line.length,
  radiusScale: node.style?.radiusScale ?? line.radiusScale,
});

const toCircle = (circle: Circle3, node: NodeBase): Circle3 => ({
  ...circle,
  color: node.style?.color ?? circle.color,
  opacity: node.style?.opacity ?? circle.opacity,
  radiusScale: node.style?.radiusScale ?? circle.radiusScale,
  segments: node.style?.segments ?? circle.segments,
  label: node.label ?? node.id,
});

const formatNum = (v: number) => (Number.isFinite(v) ? (Math.abs(v) < 1e-3 ? v.toExponential(2) : v.toFixed(3)) : "-");
const fmtPoint = (p: Point3) => `(${formatNum(p.x)}, ${formatNum(p.y)}, ${formatNum(p.z)})`;
const fmtVec = (v: Vec3) => `(${formatNum(v.x)}, ${formatNum(v.y)}, ${formatNum(v.z)})`;

const summarizePoint = (p: Point3) => fmtPoint(p);
const summarizeLine = (line: Line3) => `p=${fmtPoint(line.origin)}, d=${fmtVec(line.direction)}`;
const summarizeCircle = (circle: Circle3) =>
  `c=${fmtPoint(circle.center)}, r=${formatNum(circle.radius)}, n=${fmtVec(circle.normal)}`;

const angleAtPoint = (a: Point3, vertex: Point3, c: Point3): number | null => {
  const va = subVec3(a, vertex);
  const vc = subVec3(c, vertex);
  const na = normalizeVec3(va);
  const nc = normalizeVec3(vc);
  if (!na || !nc) return null;
  const cos = Math.max(-1, Math.min(1, dotVec3(na, nc)));
  return Math.acos(cos);
};

const rotateAroundAxis = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  const n = normalizeVec3(axis);
  if (!n) return v;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const term1 = scaleVec3(v, c);
  const term2 = scaleVec3(crossVec3(n, v), s);
  const term3 = scaleVec3(n, dotVec3(n, v) * (1 - c));
  return addVec3(addVec3(term1, term2), term3);
};

const circleThrough3Points = (a: Point3, b: Point3, c: Point3): Circle3 | null => {
  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  const n = crossVec3(ab, ac);
  const nSq = lengthSqVec3(n);
  if (!Number.isFinite(nSq) || nSq <= EPS) return null;
  const abSq = lengthSqVec3(ab);
  const acSq = lengthSqVec3(ac);
  const term1 = crossVec3(ac, n);
  const term2 = crossVec3(n, ab);
  const centerOffset = scaleVec3(addVec3(scaleVec3(term1, abSq), scaleVec3(term2, acSq)), 1 / (2 * nSq));
  const center = addVec3(a, centerOffset);
  const normal = normalizeVec3(n);
  if (!normal) return null;
  const radius = distanceVec3(center, a);
  if (!Number.isFinite(radius) || radius <= EPS) return null;
  return { center, radius, normal };
};

const resolveChoice = (
  points: Point3[],
  choice: PointChoice | undefined,
  getPoint: (id: string) => Point3 | null
): Point3 | null => {
  if (!points.length) return null;
  if (!choice || choice.mode === "first") return points[0];
  if (choice.mode === "second") return points[1] ?? points[0];
  const ref = getPoint(choice.point);
  if (!ref) return null;
  if (choice.mode === "nearest") {
    return [...points].sort((a, b) => distanceVec3(a, ref) - distanceVec3(b, ref))[0] ?? null;
  }
  if (choice.mode === "farthest") {
    return [...points].sort((a, b) => distanceVec3(b, ref) - distanceVec3(a, ref))[0] ?? null;
  }
  const tol = Math.max(1e-6, Math.abs(choice.tolerance ?? 1e-5));
  const filtered = points.filter((p) => distanceVec3(p, ref) > tol);
  if (filtered.length) return filtered[0];
  return points[0];
};

const lineCircleIntersections = (line: Line3, circle: Circle3): Point3[] => {
  const n = normalizeVec3(circle.normal);
  const d = normalizeVec3(line.direction);
  if (!n || !d) return [];
  const oc = subVec3(line.origin, circle.center);
  const denom = dotVec3(d, n);
  const planeDist = dotVec3(oc, n);
  if (Math.abs(denom) > 1e-9) {
    const t = -planeDist / denom;
    if (!Number.isFinite(t)) return [];
    const p = addVec3(line.origin, scaleVec3(d, t));
    const r = distanceVec3(p, circle.center);
    return Math.abs(r - circle.radius) <= 1e-6 ? [p] : [];
  }

  if (Math.abs(planeDist) > 1e-6) return [];
  const m = oc;
  const a = dotVec3(d, d);
  const b = 2 * dotVec3(m, d);
  const c = dotVec3(m, m) - circle.radius * circle.radius;
  const disc = b * b - 4 * a * c;
  if (!Number.isFinite(disc) || disc < -1e-9) return [];
  if (Math.abs(disc) <= 1e-9) {
    const t = -b / (2 * a);
    return [addVec3(line.origin, scaleVec3(d, t))];
  }
  const sqrtDisc = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);
  const p1 = addVec3(line.origin, scaleVec3(d, t1));
  const p2 = addVec3(line.origin, scaleVec3(d, t2));
  return [p1, p2];
};

const circleCircleIntersections = (a: Circle3, b: Circle3): Point3[] => {
  const na = normalizeVec3(a.normal);
  const nb = normalizeVec3(b.normal);
  if (!na || !nb) return [];
  const cross = crossVec3(na, nb);
  if (lengthVec3(cross) > 1e-5) return [];
  const c0 = a.center;
  const c1 = b.center;
  const delta = subVec3(c1, c0);
  const d = lengthVec3(delta);
  if (!Number.isFinite(d) || d <= EPS) return [];
  if (d > a.radius + b.radius + 1e-6) return [];
  if (d < Math.abs(a.radius - b.radius) - 1e-6) return [];
  const ex = normalizeVec3(delta);
  if (!ex) return [];
  const x = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d);
  const hSq = a.radius * a.radius - x * x;
  if (hSq < -1e-6) return [];
  const p2 = addVec3(c0, scaleVec3(ex, x));
  if (Math.abs(hSq) <= 1e-6) return [p2];
  const h = Math.sqrt(Math.max(0, hSq));
  const ey = normalizeVec3(crossVec3(na, ex));
  if (!ey) return [];
  return [addVec3(p2, scaleVec3(ey, h)), addVec3(p2, scaleVec3(ey, -h))];
};

const arcMidpointOnCircle = (circle: Circle3, b: Point3, c: Point3, excludePoint: Point3 | null): Point3 | null => {
  const n = normalizeVec3(circle.normal);
  if (!n) return null;
  const vb = normalizeVec3(subVec3(b, circle.center));
  const vc = normalizeVec3(subVec3(c, circle.center));
  if (!vb || !vc) return null;
  const thetaMinor = Math.atan2(dotVec3(n, crossVec3(vb, vc)), dotVec3(vb, vc));
  const minorMidDir = normalizeVec3(rotateAroundAxis(vb, n, thetaMinor * 0.5));
  if (!minorMidDir) return null;

  const containsExcludeOnMinor = (() => {
    if (!excludePoint) return false;
    const ve = normalizeVec3(subVec3(excludePoint, circle.center));
    if (!ve) return false;
    const alpha = Math.atan2(dotVec3(n, crossVec3(vb, ve)), dotVec3(vb, ve));
    if (thetaMinor >= 0) return alpha >= -1e-6 && alpha <= thetaMinor + 1e-6;
    return alpha <= 1e-6 && alpha >= thetaMinor - 1e-6;
  })();

  const thetaMajor = thetaMinor > 0 ? thetaMinor - Math.PI * 2 : thetaMinor + Math.PI * 2;
  const majorMidDir = normalizeVec3(rotateAroundAxis(vb, n, thetaMajor * 0.5));
  if (!majorMidDir) return null;
  const chosen = containsExcludeOnMinor ? majorMidDir : minorMidDir;
  return addVec3(circle.center, scaleVec3(chosen, circle.radius));
};

const pointPowerOnCircle = (p: Point3, circle: Circle3): number =>
  distanceVec3(p, circle.center) ** 2 - circle.radius ** 2;

const clampAbs = (v: number) => Math.abs(v);

const tryResolveNormal = (
  normal: Vec3 | undefined,
  normalRef: string | undefined,
  getLine: (id: string) => Line3 | null,
  getCircle: (id: string) => Circle3 | null
): Vec3 | null => {
  if (normal) return normalizeVec3(normal) ?? null;
  if (!normalRef) return DEFAULT_NORMAL;
  const line = getLine(normalRef);
  if (line) return normalizeVec3(line.direction);
  const circle = getCircle(normalRef);
  if (circle) return normalizeVec3(circle.normal);
  return DEFAULT_NORMAL;
};

export const evaluateConstructionGraph = (nodes: ConstructionNode[]): ConstructionGraphResult => {
  const values = new Map<string, ConstructionValue>();
  const points: Record<string, Point3> = {};
  const lines: Record<string, Line3> = {};
  const circles: Record<string, Circle3> = {};
  const objects: ConstructionObjectSummary[] = [];
  const errors: string[] = [];

  const getPoint = (id: string): Point3 | null => {
    const v = values.get(id);
    return v?.kind === "point" ? v.value : null;
  };
  const getLine = (id: string): Line3 | null => {
    const v = values.get(id);
    return v?.kind === "line" ? v.value : null;
  };
  const getCircle = (id: string): Circle3 | null => {
    const v = values.get(id);
    return v?.kind === "circle" ? v.value : null;
  };
  const pushError = (node: NodeBase, message: string) => {
    const full = `[${node.id}] ${message}`;
    errors.push(full);
    objects.push({
      id: node.id,
      label: node.label ?? node.id,
      type: "point",
      summary: "invalid",
      valid: false,
      hidden: Boolean(node.hidden),
      error: full,
    });
  };

  for (const node of nodes) {
    let value: ConstructionValue | null = null;
    switch (node.type) {
      case "freePoint": {
        value = { kind: "point", value: toPoint(node.id, node.point, node) };
        break;
      }
      case "midpoint": {
        const a = getPoint(node.a);
        const b = getPoint(node.b);
        if (!a || !b) {
          pushError(node, "Missing point dependency for midpoint.");
          continue;
        }
        const p: Point3 = {
          x: 0.5 * (a.x + b.x),
          y: 0.5 * (a.y + b.y),
          z: 0.5 * (a.z + b.z),
        };
        value = { kind: "point", value: toPoint(node.id, p, node) };
        break;
      }
      case "circumcenter": {
        const a = getPoint(node.a);
        const b = getPoint(node.b);
        const c = getPoint(node.c);
        if (!a || !b || !c) {
          pushError(node, "Missing point dependency for circumcenter.");
          continue;
        }
        const circle = circleThrough3Points(a, b, c);
        if (!circle) {
          pushError(node, "Failed circumcenter: points are close to collinear.");
          continue;
        }
        value = { kind: "point", value: toPoint(node.id, circle.center, node) };
        break;
      }
      case "lineThroughPoints": {
        const a = getPoint(node.a);
        const b = getPoint(node.b);
        if (!a || !b) {
          pushError(node, "Missing point dependency for line.");
          continue;
        }
        const line = lineThroughPoints(a, b);
        if (!line) {
          pushError(node, "Degenerate line through coincident points.");
          continue;
        }
        value = { kind: "line", value: toLine(line, node) };
        break;
      }
      case "lineFromPointDir": {
        const point = getPoint(node.point);
        if (!point) {
          pushError(node, "Missing point dependency for lineFromPointDir.");
          continue;
        }
        const line = lineFromPointDir(point, node.direction);
        if (!line) {
          pushError(node, "Invalid direction for lineFromPointDir.");
          continue;
        }
        value = { kind: "line", value: toLine(line, node) };
        break;
      }
      case "parallelLine": {
        const point = getPoint(node.point);
        const lineRef = getLine(node.line);
        if (!point || !lineRef) {
          pushError(node, "Missing dependency for parallel line.");
          continue;
        }
        const line = lineFromPointDir(point, lineRef.direction);
        if (!line) {
          pushError(node, "Failed to build parallel line.");
          continue;
        }
        value = { kind: "line", value: toLine(line, node) };
        break;
      }
      case "perpendicularLine": {
        const point = getPoint(node.point);
        const lineRef = getLine(node.line);
        if (!point || !lineRef) {
          pushError(node, "Missing dependency for perpendicular line.");
          continue;
        }
        const normal = tryResolveNormal(node.planeNormal, node.planeNormalRef, getLine, getCircle);
        if (!normal) {
          pushError(node, "Invalid plane normal for perpendicular line.");
          continue;
        }
        const dir = crossVec3(normal, lineRef.direction);
        const line = lineFromPointDir(point, dir);
        if (!line) {
          pushError(node, "Failed to build perpendicular line.");
          continue;
        }
        value = { kind: "line", value: toLine(line, node) };
        break;
      }
      case "perpendicularBisector": {
        const a = getPoint(node.a);
        const b = getPoint(node.b);
        if (!a || !b) {
          pushError(node, "Missing dependency for perpendicular bisector.");
          continue;
        }
        const normal = tryResolveNormal(node.planeNormal, node.planeNormalRef, getLine, getCircle);
        if (!normal) {
          pushError(node, "Invalid normal for perpendicular bisector.");
          continue;
        }
        const ab = subVec3(b, a);
        const dir = crossVec3(normal, ab);
        const mid: Point3 = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, z: (a.z + b.z) * 0.5 };
        const line = lineFromPointDir(mid, dir);
        if (!line) {
          pushError(node, "Failed to build perpendicular bisector.");
          continue;
        }
        value = { kind: "line", value: toLine(line, node) };
        break;
      }
      case "angleBisector": {
        const vertex = getPoint(node.vertex);
        const a = getPoint(node.a);
        const c = getPoint(node.c);
        if (!vertex || !a || !c) {
          pushError(node, "Missing dependency for angle bisector.");
          continue;
        }
        const line = angleBisectorLine(vertex, a, c);
        if (!line) {
          pushError(node, "Failed to build angle bisector.");
          continue;
        }
        value = { kind: "line", value: toLine(line, node) };
        break;
      }
      case "lineLineIntersection": {
        const lineA = getLine(node.lineA);
        const lineB = getLine(node.lineB);
        if (!lineA || !lineB) {
          pushError(node, "Missing dependency for line intersection.");
          continue;
        }
        const hit = lineLineIntersectionCoplanar(lineA, lineB, 1e-6);
        if (!hit) {
          pushError(node, "Lines do not intersect (parallel/skew).");
          continue;
        }
        value = { kind: "point", value: toPoint(node.id, hit.point, node) };
        break;
      }
      case "lineCircleIntersection": {
        const line = getLine(node.line);
        const circle = getCircle(node.circle);
        if (!line || !circle) {
          pushError(node, "Missing dependency for line-circle intersection.");
          continue;
        }
        const hits = lineCircleIntersections(line, circle);
        if (!hits.length) {
          pushError(node, "Line-circle intersection has no real solution.");
          continue;
        }
        const picked = resolveChoice(hits, node.choice, getPoint);
        if (!picked) {
          pushError(node, "Failed to choose a line-circle intersection point.");
          continue;
        }
        value = { kind: "point", value: toPoint(node.id, picked, node) };
        break;
      }
      case "circleCircleIntersection": {
        const circleA = getCircle(node.circleA);
        const circleB = getCircle(node.circleB);
        if (!circleA || !circleB) {
          pushError(node, "Missing dependency for circle-circle intersection.");
          continue;
        }
        const hits = circleCircleIntersections(circleA, circleB);
        if (!hits.length) {
          pushError(node, "Circle-circle intersection has no real solution.");
          continue;
        }
        const picked = resolveChoice(hits, node.choice, getPoint);
        if (!picked) {
          pushError(node, "Failed to choose a circle-circle intersection point.");
          continue;
        }
        value = { kind: "point", value: toPoint(node.id, picked, node) };
        break;
      }
      case "circleCenterRadius": {
        const center = getPoint(node.center);
        if (!center) {
          pushError(node, "Missing center point for circleCenterRadius.");
          continue;
        }
        const normal = tryResolveNormal(node.normal, node.normalRef, getLine, getCircle);
        if (!normal || !Number.isFinite(node.radius) || node.radius <= EPS) {
          pushError(node, "Invalid radius/normal for circleCenterRadius.");
          continue;
        }
        value = {
          kind: "circle",
          value: toCircle(
            {
              center,
              radius: node.radius,
              normal,
            },
            node
          ),
        };
        break;
      }
      case "circleCenterPoint": {
        const center = getPoint(node.center);
        const p = getPoint(node.point);
        if (!center || !p) {
          pushError(node, "Missing dependency for circleCenterPoint.");
          continue;
        }
        const normal = tryResolveNormal(node.normal, node.normalRef, getLine, getCircle);
        const radius = distanceVec3(center, p);
        if (!normal || !Number.isFinite(radius) || radius <= EPS) {
          pushError(node, "Invalid center-point circle.");
          continue;
        }
        value = {
          kind: "circle",
          value: toCircle(
            {
              center,
              radius,
              normal,
            },
            node
          ),
        };
        break;
      }
      case "circleThrough3Points": {
        const a = getPoint(node.a);
        const b = getPoint(node.b);
        const c = getPoint(node.c);
        if (!a || !b || !c) {
          pushError(node, "Missing dependency for circleThrough3Points.");
          continue;
        }
        const circle = circleThrough3Points(a, b, c);
        if (!circle) {
          pushError(node, "Failed circleThrough3Points: points nearly collinear.");
          continue;
        }
        value = { kind: "circle", value: toCircle(circle, node) };
        break;
      }
      case "arcMidpointOnCircle": {
        const circle = getCircle(node.circle);
        const b = getPoint(node.b);
        const c = getPoint(node.c);
        if (!circle || !b || !c) {
          pushError(node, "Missing dependency for arc midpoint.");
          continue;
        }
        const exclude = node.excludePoint ? getPoint(node.excludePoint) : null;
        const p = arcMidpointOnCircle(circle, b, c, exclude);
        if (!p) {
          pushError(node, "Failed to compute arc midpoint.");
          continue;
        }
        value = { kind: "point", value: toPoint(node.id, p, node) };
        break;
      }
      default: {
        pushError(node, "Unsupported node type.");
      }
    }

    if (!value) continue;
    values.set(node.id, value);
    if (value.kind === "point") points[node.id] = value.value;
    if (value.kind === "line") lines[node.id] = value.value;
    if (value.kind === "circle") circles[node.id] = value.value;

    const type: "point" | "line" | "circle" = value.kind;
    const summary =
      value.kind === "point"
        ? summarizePoint(value.value)
        : value.kind === "line"
          ? summarizeLine(value.value)
          : summarizeCircle(value.value);
    objects.push({
      id: node.id,
      label: node.label ?? node.id,
      type,
      summary,
      valid: true,
      hidden: Boolean(node.hidden),
    });
  }

  const hiddenIds = new Set(nodes.filter((node) => node.hidden).map((node) => node.id));
  const visiblePoints = Object.entries(points)
    .filter(([id]) => !hiddenIds.has(id))
    .map(([, point]) => point);
  const visibleLines = Object.entries(lines)
    .filter(([id]) => !hiddenIds.has(id))
    .map(([, line]) => line);
  const visibleCircles = Object.entries(circles).filter(([id]) => !hiddenIds.has(id));
  const circleSegments = visibleCircles.flatMap(([, circle]) =>
    buildCircleSegments(circle.center, circle.normal, circle.radius, {
      color: circle.color,
      opacity: circle.opacity,
      radiusScale: circle.radiusScale,
      segments: circle.segments,
    })
  );

  const scene: GeometryScene = {
    points: visiblePoints,
    lines: visibleLines,
    segments: circleSegments,
  };

  return { scene, points, lines, circles, objects, errors };
};

export type ProblemCheckStatus = "ok" | "fail" | "invalid";
export type ProblemCheckUnit = "unit" | "deg" | "unit2";

export type ProblemCheckDef =
  | {
      id: string;
      label: string;
      type: "collinear";
      points: [string, string, string];
      tolerance?: number;
    }
  | {
      id: string;
      label: string;
      type: "concyclic";
      points: [string, string, string, string];
      tolerance?: number;
    }
  | {
      id: string;
      label: string;
      type: "perpendicular";
      lines: [string, string];
      toleranceDeg?: number;
    }
  | {
      id: string;
      label: string;
      type: "parallel";
      lines: [string, string];
      toleranceDeg?: number;
    }
  | {
      id: string;
      label: string;
      type: "pointOnCircle";
      point: string;
      circle: string;
      tolerance?: number;
    }
  | {
      id: string;
      label: string;
      type: "equalLength";
      segments: [[string, string], [string, string]];
      tolerance?: number;
    }
  | {
      id: string;
      label: string;
      type: "equalAngle";
      angles: [[string, string, string], [string, string, string]];
      toleranceDeg?: number;
    }
  | {
      id: string;
      label: string;
      type: "samePower";
      point: string;
      circles: [string, string];
      tolerance?: number;
    };

export type ProblemCheckResult = {
  id: string;
  label: string;
  type: ProblemCheckDef["type"];
  residual: number | null;
  tolerance: number;
  unit: ProblemCheckUnit;
  status: ProblemCheckStatus;
};

export type ProblemDistanceDef = {
  id: string;
  label: string;
  a: string;
  b: string;
};

export type ProblemDistanceResult = ProblemDistanceDef & {
  value: number | null;
};

export type ProblemAngleDef = {
  id: string;
  label: string;
  a: string;
  vertex: string;
  c: string;
};

export type ProblemAngleResult = ProblemAngleDef & {
  valueDeg: number | null;
};

const angleBetweenLinesDeg = (a: Line3, b: Line3): number | null => {
  const na = normalizeVec3(a.direction);
  const nb = normalizeVec3(b.direction);
  if (!na || !nb) return null;
  const cos = Math.max(-1, Math.min(1, dotVec3(na, nb)));
  const rad = Math.acos(cos);
  return Math.min(rad, Math.PI - rad) * RAD2DEG;
};

const statusFromResidual = (residual: number | null, tolerance: number): ProblemCheckStatus => {
  if (residual == null || !Number.isFinite(residual)) return "invalid";
  return clampAbs(residual) <= Math.abs(tolerance) ? "ok" : "fail";
};

export const evaluateProblemChecks = (
  graph: ConstructionGraphResult,
  checks: ProblemCheckDef[]
): ProblemCheckResult[] => {
  const getPoint = (id: string) => graph.points[id] ?? null;
  const getLine = (id: string) => graph.lines[id] ?? null;
  const getCircle = (id: string) => graph.circles[id] ?? null;

  return checks.map((check) => {
    if (check.type === "collinear") {
      const [aId, bId, cId] = check.points;
      const a = getPoint(aId);
      const b = getPoint(bId);
      const c = getPoint(cId);
      const line = a && b ? lineThroughPoints(a, b) : null;
      const residual = line && c ? distancePointToLine(c, line) : null;
      const tolerance = Math.abs(check.tolerance ?? 1e-3);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "unit",
        status: statusFromResidual(residual, tolerance),
      };
    }
    if (check.type === "concyclic") {
      const [aId, bId, cId, dId] = check.points;
      const a = getPoint(aId);
      const b = getPoint(bId);
      const c = getPoint(cId);
      const d = getPoint(dId);
      const circle = a && b && c ? circleThrough3Points(a, b, c) : null;
      const residual = circle && d ? Math.abs(distanceVec3(d, circle.center) - circle.radius) : null;
      const tolerance = Math.abs(check.tolerance ?? 1e-3);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "unit",
        status: statusFromResidual(residual, tolerance),
      };
    }
    if (check.type === "perpendicular") {
      const [aId, bId] = check.lines;
      const a = getLine(aId);
      const b = getLine(bId);
      const ang = a && b ? angleBetweenLinesDeg(a, b) : null;
      const residual = ang == null ? null : Math.abs(90 - ang);
      const tolerance = Math.abs(check.toleranceDeg ?? 0.5);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "deg",
        status: statusFromResidual(residual, tolerance),
      };
    }
    if (check.type === "parallel") {
      const [aId, bId] = check.lines;
      const a = getLine(aId);
      const b = getLine(bId);
      const residual = a && b ? angleBetweenLinesDeg(a, b) : null;
      const tolerance = Math.abs(check.toleranceDeg ?? 0.5);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "deg",
        status: statusFromResidual(residual, tolerance),
      };
    }
    if (check.type === "pointOnCircle") {
      const p = getPoint(check.point);
      const circle = getCircle(check.circle);
      const residual = p && circle ? Math.abs(distanceVec3(p, circle.center) - circle.radius) : null;
      const tolerance = Math.abs(check.tolerance ?? 1e-3);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "unit",
        status: statusFromResidual(residual, tolerance),
      };
    }
    if (check.type === "equalLength") {
      const [[aId, bId], [cId, dId]] = check.segments;
      const a = getPoint(aId);
      const b = getPoint(bId);
      const c = getPoint(cId);
      const d = getPoint(dId);
      const residual =
        a && b && c && d ? Math.abs(distanceVec3(a, b) - distanceVec3(c, d)) : null;
      const tolerance = Math.abs(check.tolerance ?? 1e-3);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "unit",
        status: statusFromResidual(residual, tolerance),
      };
    }
    if (check.type === "equalAngle") {
      const [[a1, v1, c1], [a2, v2, c2]] = check.angles;
      const pA1 = getPoint(a1);
      const pV1 = getPoint(v1);
      const pC1 = getPoint(c1);
      const pA2 = getPoint(a2);
      const pV2 = getPoint(v2);
      const pC2 = getPoint(c2);
      const ang1 = pA1 && pV1 && pC1 ? angleAtPoint(pA1, pV1, pC1) : null;
      const ang2 = pA2 && pV2 && pC2 ? angleAtPoint(pA2, pV2, pC2) : null;
      const residual = ang1 != null && ang2 != null ? Math.abs((ang1 - ang2) * RAD2DEG) : null;
      const tolerance = Math.abs(check.toleranceDeg ?? 0.5);
      return {
        id: check.id,
        label: check.label,
        type: check.type,
        residual,
        tolerance,
        unit: "deg",
        status: statusFromResidual(residual, tolerance),
      };
    }
    const p = getPoint(check.point);
    const c1 = getCircle(check.circles[0]);
    const c2 = getCircle(check.circles[1]);
    const residual = p && c1 && c2 ? Math.abs(pointPowerOnCircle(p, c1) - pointPowerOnCircle(p, c2)) : null;
    const tolerance = Math.abs(check.tolerance ?? 1e-3);
    return {
      id: check.id,
      label: check.label,
      type: check.type,
      residual,
      tolerance,
      unit: "unit2",
      status: statusFromResidual(residual, tolerance),
    };
  });
};

export const evaluateProblemDistances = (
  graph: ConstructionGraphResult,
  defs: ProblemDistanceDef[]
): ProblemDistanceResult[] =>
  defs.map((def) => {
    const a = graph.points[def.a];
    const b = graph.points[def.b];
    return {
      ...def,
      value: a && b ? distanceVec3(a, b) : null,
    };
  });

export const evaluateProblemAngles = (
  graph: ConstructionGraphResult,
  defs: ProblemAngleDef[]
): ProblemAngleResult[] =>
  defs.map((def) => {
    const a = graph.points[def.a];
    const v = graph.points[def.vertex];
    const c = graph.points[def.c];
    const ang = a && v && c ? angleAtPoint(a, v, c) : null;
    return {
      ...def,
      valueDeg: ang == null ? null : ang * RAD2DEG,
    };
  });

export const buildPointLabelSet = (points: Record<string, Point3>) => {
  const labels = Object.entries(points)
    .filter(([, p]) => !!p.label)
    .map(([, p]) => ({
      text: p.label ?? "",
      position: { x: p.x, y: p.y, z: p.z },
      color: p.color,
      size: 1,
      opacity: 0.95,
    }));
  return labels.length ? [{ labels }] : null;
};

export const estimateCircleNormalFromPoints = (a: Point3, b: Point3, c: Point3): Vec3 => {
  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  return normalizeVec3(crossVec3(ab, ac)) ?? DEFAULT_NORMAL;
};

export const projectPointToCirclePlane = (p: Point3, circle: Circle3): Point3 => {
  const n = normalizeVec3(circle.normal);
  if (!n) return p;
  const rel = subVec3(p, circle.center);
  const height = dotVec3(rel, n);
  return subVec3(p, scaleVec3(n, height));
};

export const pointPolarAngleOnCircle = (p: Point3, circle: Circle3): number | null => {
  const basis = planeBasis(circle.normal);
  if (!basis) return null;
  const rel = subVec3(p, circle.center);
  return Math.atan2(dotVec3(rel, basis.v), dotVec3(rel, basis.u));
};
