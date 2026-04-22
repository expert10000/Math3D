import type { FundamentalDiagram, Orientation } from "./types";

export type PolygonWordEdge = {
  label: string;
  orientation: Orientation;
};

export type PolygonWordClassification =
  | { kind: "torus"; label: string; comparisonId: "torus" }
  | { kind: "projective"; label: string; comparisonId: "projective" }
  | { kind: "klein"; label: string; comparisonId: "klein" }
  | { kind: "orientable-genus"; label: string; genus: number; comparisonId: "torus" | null }
  | { kind: "nonorientable-genus"; label: string; genus: number; comparisonId: "projective" | "klein" | null }
  | { kind: "mixed"; label: string; comparisonId: null };

const clampInteger = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeLabelToken = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

const stripInverseSuffix = (raw: string): { base: string; orientation: Orientation } => {
  const token = raw.trim().toLowerCase();
  if (token.endsWith("⁻¹")) {
    return { base: token.slice(0, -2), orientation: -1 };
  }
  if (/\^\s*-?1$/i.test(token)) {
    return { base: token.replace(/\^\s*-?1$/i, ""), orientation: -1 };
  }
  if (/\{\s*-?1\s*\}$/i.test(token)) {
    return { base: token.replace(/\{\s*-?1\s*\}$/i, ""), orientation: -1 };
  }
  return { base: token, orientation: 1 };
};

const splitBoundaryWord = (raw: string): string[] =>
  raw
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const parsePolygonWordEdge = (raw: string, fallbackIndex = 0): PolygonWordEdge => {
  const { base, orientation } = stripInverseSuffix(raw);
  const normalized = normalizeLabelToken(base);
  return {
    label: normalized.length > 0 ? normalized : `e${fallbackIndex + 1}`,
    orientation,
  };
};

export const parsePolygonWord = (raw: string): PolygonWordEdge[] =>
  splitBoundaryWord(raw).map((token, index) => parsePolygonWordEdge(token, index));

export const formatPolygonWordToken = (edge: PolygonWordEdge): string =>
  `${normalizeLabelToken(edge.label) || "e"}${edge.orientation < 0 ? "^-1" : ""}`;

export const formatPolygonWord = (edges: PolygonWordEdge[]): string =>
  edges.map((edge) => formatPolygonWordToken(edge)).join(" ");

export const buildOrientableGenusWord = (genus: number): PolygonWordEdge[] => {
  const g = clampInteger(genus, 1, 8);
  const edges: PolygonWordEdge[] = [];
  for (let i = 1; i <= g; i += 1) {
    const a = g === 1 ? "a" : `a${i}`;
    const b = g === 1 ? "b" : `b${i}`;
    edges.push({ label: a, orientation: 1 });
    edges.push({ label: b, orientation: 1 });
    edges.push({ label: a, orientation: -1 });
    edges.push({ label: b, orientation: -1 });
  }
  return edges;
};

export const buildNonOrientableGenusWord = (genus: number): PolygonWordEdge[] => {
  const g = clampInteger(genus, 1, 8);
  const edges: PolygonWordEdge[] = [];
  for (let i = 1; i <= g; i += 1) {
    const label = g === 1 ? "a" : `a${i}`;
    edges.push({ label, orientation: 1 });
    edges.push({ label, orientation: 1 });
  }
  return edges;
};

const equalsWord = (edges: PolygonWordEdge[], expected: Array<{ label: string; orientation: Orientation }>): boolean =>
  edges.length === expected.length &&
  edges.every(
    (edge, index) =>
      normalizeLabelToken(edge.label) === normalizeLabelToken(expected[index]?.label ?? "") &&
      edge.orientation === expected[index]?.orientation
  );

export const classifyPolygonWord = (edges: PolygonWordEdge[]): PolygonWordClassification => {
  if (equalsWord(edges, [{ label: "a", orientation: 1 }, { label: "b", orientation: 1 }, { label: "a", orientation: -1 }, { label: "b", orientation: -1 }])) {
    return { kind: "torus", label: "Torus from aba^-1b^-1", comparisonId: "torus" };
  }
  if (equalsWord(edges, [{ label: "a", orientation: 1 }, { label: "a", orientation: 1 }])) {
    return { kind: "projective", label: "Projective plane from aa", comparisonId: "projective" };
  }
  if (
    equalsWord(edges, [
      { label: "a", orientation: 1 },
      { label: "b", orientation: 1 },
      { label: "a", orientation: -1 },
      { label: "b", orientation: 1 },
    ]) ||
    equalsWord(edges, [
      { label: "a", orientation: 1 },
      { label: "b", orientation: 1 },
      { label: "a", orientation: 1 },
      { label: "b", orientation: 1 },
    ])
  ) {
    return { kind: "klein", label: "Klein bottle model", comparisonId: "klein" };
  }

  const byLabel = new Map<
    string,
    {
      plus: number;
      minus: number;
      count: number;
    }
  >();
  for (const edge of edges) {
    const label = normalizeLabelToken(edge.label);
    if (!label) continue;
    const bucket = byLabel.get(label) ?? { plus: 0, minus: 0, count: 0 };
    bucket.count += 1;
    if (edge.orientation > 0) bucket.plus += 1;
    else bucket.minus += 1;
    byLabel.set(label, bucket);
  }

  const buckets = [...byLabel.values()];
  const twiceEach = buckets.length > 0 && buckets.every((bucket) => bucket.count === 2);
  const orientablePattern = twiceEach && buckets.every((bucket) => bucket.plus === 1 && bucket.minus === 1);
  if (orientablePattern && buckets.length % 2 === 0) {
    const genus = Math.max(1, Math.floor(buckets.length / 2));
    return {
      kind: "orientable-genus",
      label: `Orientable genus g = ${genus} (4g-gon pattern)`,
      genus,
      comparisonId: genus === 1 ? "torus" : null,
    };
  }

  const nonOrientablePattern = twiceEach && buckets.every((bucket) => bucket.plus === 2 || bucket.minus === 2);
  if (nonOrientablePattern) {
    const genus = buckets.length;
    return {
      kind: "nonorientable-genus",
      label: `Nonorientable genus n = ${genus} (2n-gon pattern)`,
      genus,
      comparisonId: genus === 1 ? "projective" : genus === 2 ? "klein" : null,
    };
  }

  return { kind: "mixed", label: "Custom polygon word", comparisonId: null };
};

const regularPolygonVertices = (edgeCount: number): Array<{ x: number; y: number }> => {
  if (edgeCount <= 2) {
    return [
      { x: -1.1, y: 0 },
      { x: 1.1, y: 0 },
    ];
  }
  const radius = 1.2;
  const vertices: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const angle = Math.PI * 0.5 - (Math.PI * 2 * index) / edgeCount;
    vertices.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return vertices;
};

export const buildDiagramFromPolygonWord = (
  edges: PolygonWordEdge[],
  opts: { id?: string; name?: string; description?: string } = {}
): FundamentalDiagram => {
  const safeEdges = edges.length > 0 ? edges : [{ label: "a", orientation: 1 }];
  const edgeCount = safeEdges.length;
  const vertices2d = regularPolygonVertices(edgeCount);
  const vertexCount = vertices2d.length;
  const vertices = Array.from({ length: vertexCount }, (_, index) => ({
    id: `v${index}`,
    x: vertices2d[index]?.x ?? 0,
    y: vertices2d[index]?.y ?? 0,
  }));
  const boundaryEdges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `e${index}`,
    from: `v${index % vertexCount}`,
    to: `v${(index + 1) % vertexCount}`,
  }));

  const labelGroups = new Map<string, string[]>();
  boundaryEdges.forEach((edge, index) => {
    const label = normalizeLabelToken(safeEdges[index]?.label ?? `e${index + 1}`) || `e${index + 1}`;
    const list = labelGroups.get(label) ?? [];
    list.push(edge.id);
    labelGroups.set(label, list);
  });

  const edgeOrientations: Record<string, Orientation> = {};
  const edgeLabels: Record<string, string> = {};
  const edgePairings: Record<string, string[]> = {};
  boundaryEdges.forEach((edge, index) => {
    const parsedLabel = normalizeLabelToken(safeEdges[index]?.label ?? "");
    const label = parsedLabel || `e${index + 1}`;
    edgeOrientations[edge.id] = safeEdges[index]?.orientation === -1 ? -1 : 1;
    edgeLabels[edge.id] = label;
    const peers = (labelGroups.get(label) ?? []).filter((peerId) => peerId !== edge.id);
    edgePairings[edge.id] = peers;
  });

  const vertexLabels = Object.fromEntries(vertices.map((vertex, index) => [vertex.id, String(index)]));
  const faceId = "f0";
  const faceBoundaryWords = {
    [faceId]: formatPolygonWord(
      boundaryEdges.map((edge, index) => ({
        label: edgeLabels[edge.id] ?? `e${index + 1}`,
        orientation: edgeOrientations[edge.id] ?? 1,
      }))
    ),
  };

  return {
    id: opts.id ?? "custom/polygon-word",
    name: opts.name ?? "Custom polygon word",
    vertices,
    edges: boundaryEdges,
    faces: [
      {
        id: faceId,
        boundary: boundaryEdges.map((edge) => ({ edgeId: edge.id, direction: 1 })),
      },
    ],
    edgeOrientations,
    edgeLabels,
    edgePairings,
    vertexLabels,
    faceBoundaryWords,
    metadata: {
      description: opts.description ?? "Generated from polygon word editor.",
    },
  };
};
