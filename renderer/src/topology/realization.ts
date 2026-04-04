import type { QuotientComplex, Realization3D, Vec3 } from "./types";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const normalize = (v: Vec3): Vec3 => {
  const length = norm(v);
  if (length <= 1e-9) return [0, 0, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
};

const average = (points: Vec3[]): Vec3 => {
  if (points.length === 0) return [0, 0, 0];
  let sum: Vec3 = [0, 0, 0];
  for (const point of points) sum = add(sum, point);
  return scale(sum, 1 / points.length);
};

const reverseIfNeeded = (points: Vec3[], reverse: boolean): Vec3[] => (reverse ? [...points].reverse() : points);

const vertexLayout = (count: number): Vec3[] => {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0, 0]];
  const radius = Math.max(1.2, 0.85 + 0.3 * count);
  const points: Vec3[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), 0.25 * Math.sin(2 * angle)]);
  }
  return points;
};

const makeLoopCurve = (center: Vec3, loopIndex: number): Vec3[] => {
  const points: Vec3[] = [];
  const radius = 0.45 + loopIndex * 0.22;
  const zAmplitude = 0.14 + loopIndex * 0.03;
  for (let index = 0; index <= 28; index += 1) {
    const theta = (Math.PI * 2 * index) / 28;
    points.push([
      center[0] + radius * Math.cos(theta),
      center[1] + 0.75 * radius * Math.sin(theta),
      center[2] + zAmplitude * Math.sin(2 * theta),
    ]);
  }
  return points;
};

const makeArcCurve = (from: Vec3, to: Vec3, edgeIndex: number): Vec3[] => {
  const direction = sub(to, from);
  const length = Math.max(0.3, norm(direction));
  const tangent = normalize(direction);
  const up: Vec3 = [0, 0, 1];
  const side = normalize([
    tangent[1] * up[2] - tangent[2] * up[1],
    tangent[2] * up[0] - tangent[0] * up[2],
    tangent[0] * up[1] - tangent[1] * up[0],
  ]);
  const offsetSize = 0.18 + 0.06 * (edgeIndex % 5);
  const offset: Vec3 = norm(side) <= 1e-9 ? [0.12, 0.04, 0.18] : scale(side, offsetSize * Math.min(1.5, length));
  const midpoint = scale(add(from, to), 0.5);
  const lift = [0, 0, 0.12 + 0.05 * ((edgeIndex % 3) + 1)] as Vec3;
  const p1 = add(midpoint, add(offset, lift));
  return [from, p1, to];
};

const buildFaceMesh = (
  quotient: QuotientComplex,
  edgeCurves: Record<string, Vec3[]>
): Realization3D["faceRealizationMesh"] => {
  const result: Realization3D["faceRealizationMesh"] = [];
  for (const face of quotient.faces) {
    const attachment = quotient.attachmentMap[face.attachmentId];
    if (!attachment || attachment.boundary.length === 0) continue;

    const polygon: Vec3[] = [];
    for (const edgeRef of attachment.boundary) {
      const curve = edgeCurves[edgeRef.edgeId];
      if (!curve || curve.length === 0) continue;
      const oriented = reverseIfNeeded(curve, edgeRef.direction < 0);
      const point = oriented[0];
      polygon.push(point);
    }
    if (polygon.length < 3) continue;

    const center = average(polygon);
    const vertices = [...polygon, center];
    const centerIndex = vertices.length - 1;
    const triangles: Array<[number, number, number]> = [];
    for (let index = 0; index < polygon.length; index += 1) {
      triangles.push([index, (index + 1) % polygon.length, centerIndex]);
    }
    result.push({ faceId: face.id, vertices, triangles });
  }
  return result;
};

const TORUS_MAJOR_RADIUS = 1.78;
const TORUS_MINOR_RADIUS = 0.62;

const isTorusLikeQuotient = (quotient: QuotientComplex): boolean => {
  if (quotient.edges.length < 2) return false;
  const hasA = quotient.edges.some(
    (edge) => edge.sourceEdgeIds.length >= 2 && edgePrimaryLabel(edge.label) === "a"
  );
  const hasB = quotient.edges.some(
    (edge) => edge.sourceEdgeIds.length >= 2 && edgePrimaryLabel(edge.label) === "b"
  );
  return hasA && hasB;
};

const edgePrimaryLabel = (label: string): string => {
  const head = label
    .trim()
    .toLowerCase()
    .split(/[\/\s]+/)[0] ?? "";
  return head.replace(/[^a-z0-9]/g, "");
};

const pickTorusCycleEdgeIds = (quotient: QuotientComplex): { major: string; minor: string } => {
  const labeled = quotient.edges.map((edge) => ({
    id: edge.id,
    label: edgePrimaryLabel(edge.label),
  }));
  const major = labeled.find((entry) => entry.label === "a")?.id ?? labeled[0]?.id ?? "qE0";
  const minorFallback = labeled.find((entry) => entry.id !== major)?.id ?? major;
  const minor = labeled.find((entry) => entry.label === "b")?.id ?? minorFallback;
  return { major, minor };
};

const torusPoint = (u: number, v: number, major = TORUS_MAJOR_RADIUS, minor = TORUS_MINOR_RADIUS): Vec3 => {
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosV = Math.cos(v);
  const sinV = Math.sin(v);
  return [(major + minor * cosV) * cosU, (major + minor * cosV) * sinU, minor * sinV];
};

const sampleCurve = (builder: (t: number) => Vec3, segments: number, closed = true): Vec3[] => {
  const count = Math.max(8, segments);
  const pts: Vec3[] = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    pts.push(builder(t));
  }
  return closed ? pts : pts.slice(0, Math.max(2, pts.length - 1));
};

const buildTorusFaceMesh = (faceId: string): Realization3D["faceRealizationMesh"] => {
  const uSegments = 56;
  const vSegments = 32;
  const vertices: Vec3[] = [];
  for (let iu = 0; iu <= uSegments; iu += 1) {
    const u = (Math.PI * 2 * iu) / uSegments;
    for (let iv = 0; iv <= vSegments; iv += 1) {
      const v = (Math.PI * 2 * iv) / vSegments;
      vertices.push(torusPoint(u, v));
    }
  }
  const row = vSegments + 1;
  const triangles: Array<[number, number, number]> = [];
  for (let iu = 0; iu < uSegments; iu += 1) {
    for (let iv = 0; iv < vSegments; iv += 1) {
      const a = iu * row + iv;
      const b = (iu + 1) * row + iv;
      const c = (iu + 1) * row + iv + 1;
      const d = iu * row + iv + 1;
      triangles.push([a, b, c], [a, c, d]);
    }
  }
  return [{ faceId, vertices, triangles }];
};

const buildTorusRealizationBase = (
  quotient: QuotientComplex,
  kind: "smooth" | "cut-open"
): Realization3D | null => {
  if (!isTorusLikeQuotient(quotient)) return null;
  const faceId = quotient.faces[0]?.id ?? "qF0";
  const { major, minor } = pickTorusCycleEdgeIds(quotient);
  const edgeCurves: Record<string, Vec3[]> = {};
  const phaseOffset = new Map<string, number>();
  let offsetCounter = 0;
  for (const edge of quotient.edges) {
    const phi = (Math.PI * 2 * offsetCounter) / Math.max(3, quotient.edges.length + 1);
    phaseOffset.set(edge.id, phi);
    offsetCounter += 1;
  }

  for (const edge of quotient.edges) {
    if (edge.id === major) {
      edgeCurves[edge.id] = sampleCurve((t) => torusPoint(t * Math.PI * 2, 0), 180, true);
      continue;
    }
    if (edge.id === minor) {
      edgeCurves[edge.id] = sampleCurve((t) => torusPoint(0, t * Math.PI * 2), 160, true);
      continue;
    }
    const shift = phaseOffset.get(edge.id) ?? 0;
    edgeCurves[edge.id] = sampleCurve((t) => torusPoint(t * Math.PI * 2, shift), 120, true);
  }

  if (kind === "cut-open") {
    edgeCurves.cut_u = sampleCurve((t) => torusPoint(t * Math.PI * 2, 0), 150, false);
    edgeCurves.cut_v = sampleCurve((t) => torusPoint(0, t * Math.PI * 2), 130, false);
  }

  const cornerPoint = torusPoint(0, 0);
  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    if (index === 0) {
      vertexPositions[vertex.id] = cornerPoint;
      return;
    }
    const theta = (Math.PI * 2 * index) / Math.max(2, quotient.vertices.length);
    vertexPositions[vertex.id] = torusPoint(theta, 0.26 * Math.sin(theta));
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/torus-${kind}`,
    name: kind === "smooth" ? "Smooth torus realization" : "Cut-open torus model",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildTorusFaceMesh(faceId),
    seams,
    singularityMarkers,
    style: {
      faceFill: kind === "smooth" ? "#dbeafe" : "#ede9fe",
      edgeStroke: "#0f172a",
      seamStroke: kind === "smooth" ? "#be123c" : "#92400e",
      singularityColor: "#b45309",
    },
  };
};

export const buildDefaultRealization = (quotient: QuotientComplex): Realization3D => {
  const layout = vertexLayout(quotient.vertices.length);
  const vertexPositions: Record<string, Vec3> = {};
  quotient.vertices.forEach((vertex, index) => {
    vertexPositions[vertex.id] = layout[index] ?? [0, 0, 0];
  });

  const loopCountByVertex: Record<string, number> = {};
  const edgeCurves: Record<string, Vec3[]> = {};
  quotient.edges.forEach((edge, index) => {
    const from = vertexPositions[edge.endpointVertexIds[0]] ?? [0, 0, 0];
    const to = vertexPositions[edge.endpointVertexIds[1]] ?? [0, 0, 0];
    if (edge.endpointVertexIds[0] === edge.endpointVertexIds[1]) {
      const loopIndex = loopCountByVertex[edge.endpointVertexIds[0]] ?? 0;
      loopCountByVertex[edge.endpointVertexIds[0]] = loopIndex + 1;
      edgeCurves[edge.id] = makeLoopCurve(from, loopIndex);
      return;
    }
    edgeCurves[edge.id] = makeArcCurve(from, to, index);
  });

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/default`,
    name: "Default immersed realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildFaceMesh(quotient, edgeCurves),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#dbeafe",
      edgeStroke: "#0f172a",
      seamStroke: "#be123c",
      singularityColor: "#b45309",
    },
  };
};

export const buildFlatSchematicRealization = (quotient: QuotientComplex): Realization3D => {
  const vertexPositions: Record<string, Vec3> = {};
  const count = quotient.vertices.length;
  quotient.vertices.forEach((vertex, index) => {
    if (count <= 1) {
      vertexPositions[vertex.id] = [0, 0, 0];
      return;
    }
    const angle = (Math.PI * 2 * index) / count;
    vertexPositions[vertex.id] = [1.7 * Math.cos(angle), 1.25 * Math.sin(angle), 0];
  });

  const edgeCurves: Record<string, Vec3[]> = {};
  let loopIndex = 0;
  for (const edge of quotient.edges) {
    const from = vertexPositions[edge.endpointVertexIds[0]] ?? [0, 0, 0];
    const to = vertexPositions[edge.endpointVertexIds[1]] ?? [0, 0, 0];
    if (edge.endpointVertexIds[0] === edge.endpointVertexIds[1]) {
      edgeCurves[edge.id] = makeLoopCurve(from, loopIndex);
      loopIndex += 1;
      continue;
    }
    edgeCurves[edge.id] = [from, to];
  }

  const seams = quotient.edges
    .filter((edge) => edge.sourceEdgeIds.length > 1)
    .map((edge) => ({
      edgeId: edge.id,
      sourceEdgeIds: [...edge.sourceEdgeIds],
      kind: edge.endpointVertexIds[0] === edge.endpointVertexIds[1] ? "self-identified" : "identified",
    })) satisfies Realization3D["seams"];

  const singularityMarkers = quotient.vertices
    .filter((vertex) => vertex.sourceVertexIds.length > 1)
    .map((vertex) => ({
      vertexId: vertex.id,
      kind: "identified-vertex",
      degree: quotient.incidences.vertexToEdges[vertex.id]?.length ?? 0,
    })) satisfies Realization3D["singularityMarkers"];

  return {
    id: `${quotient.id}/realization/flat`,
    name: "Flat schematic realization",
    quotientComplexId: quotient.id,
    vertexPositions,
    edgeCurves,
    faceRealizationMesh: buildFaceMesh(quotient, edgeCurves),
    seams,
    singularityMarkers,
    style: {
      faceFill: "#ede9fe",
      edgeStroke: "#312e81",
      seamStroke: "#be123c",
      singularityColor: "#a16207",
    },
  };
};

export const buildRealizationChoices = (quotient: QuotientComplex): Realization3D[] => {
  const smooth = buildTorusRealizationBase(quotient, "smooth");
  const cutOpen = buildTorusRealizationBase(quotient, "cut-open");
  return [
    ...(smooth ? [smooth] : []),
    ...(cutOpen ? [cutOpen] : []),
    buildDefaultRealization(quotient),
    buildFlatSchematicRealization(quotient),
  ];
};
