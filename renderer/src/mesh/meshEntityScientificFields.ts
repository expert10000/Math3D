import type { SurfaceScalarField, SurfaceVectorField } from "../scene/datasets";
import type { AnalysisDomain, AnalysisFieldMetadata, AnalysisProbe } from "../analysis/contracts";
import {
  describeMeshCurvatureWarnings,
  type MeshDifferentialGeometryResult,
} from "./meshDifferentialGeometry";
import type { MeshQualityReport } from "./meshQualityReport";
import type { SurfaceFeatureClass, SurfaceFeatureExtractionResult } from "./surfaceFeatureExtraction";
import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshScientificEntityTarget =
  | { kind: "vertex"; vertexIndex: number }
  | { kind: "edge"; edge: readonly [number, number] }
  | { kind: "face"; faceIndex: number };

export type MeshScientificScalarValue = {
  name: string;
  value: number;
  domain: "vertex" | "edge-mapped" | "face-mapped" | "face" | "edge";
};

export type MeshScientificVectorValue = {
  name: string;
  value: readonly [number, number, number];
  magnitude: number;
  domain: "vertex" | "edge-mapped" | "face-mapped";
};

export type MeshEntityScientificFields = {
  target: MeshScientificEntityTarget;
  vertexIndices: number[];
  scalars: MeshScientificScalarValue[];
  vectors: MeshScientificVectorValue[];
  quality: MeshScientificScalarValue[];
  featureMembership: SurfaceFeatureClass[];
  principalDirectionsValidated: boolean;
  warnings: string[];
  probe: AnalysisProbe;
};

type MeshEntityScientificFieldsInput = {
  mesh: SurfaceMeshData;
  target: MeshScientificEntityTarget;
  scalarFields: Iterable<SurfaceScalarField>;
  vectorFields: Iterable<SurfaceVectorField>;
  differential?: MeshDifferentialGeometryResult | null;
  quality?: MeshQualityReport | null;
  features?: SurfaceFeatureExtractionResult | null;
};

const validVertex = (vertex: number, vertexCount: number): boolean =>
  Number.isInteger(vertex) && vertex >= 0 && vertex < vertexCount;

const faceVertices = (mesh: SurfaceMeshData, faceIndex: number, vertexCount: number): number[] => {
  const offset = Math.round(faceIndex) * 3;
  const source = mesh.indices;
  if (offset < 0 || offset + 2 >= (source?.length ?? mesh.positions.length / 3)) return [];
  const vertices = source
    ? [Number(source[offset]), Number(source[offset + 1]), Number(source[offset + 2])]
    : [offset, offset + 1, offset + 2];
  return vertices.every((vertex) => validVertex(vertex, vertexCount)) ? vertices : [];
};

const targetVertices = (
  mesh: SurfaceMeshData,
  target: MeshScientificEntityTarget,
  vertexCount: number
): number[] => {
  if (target.kind === "vertex") return validVertex(target.vertexIndex, vertexCount) ? [target.vertexIndex] : [];
  if (target.kind === "edge") {
    return target.edge.every((vertex) => validVertex(vertex, vertexCount)) ? [...target.edge] : [];
  }
  return faceVertices(mesh, target.faceIndex, vertexCount);
};

const meanScalar = (values: ArrayLike<number>, vertices: readonly number[]): number | null => {
  let total = 0;
  let count = 0;
  for (const vertex of vertices) {
    const value = Number(values[vertex]);
    if (!Number.isFinite(value)) continue;
    total += value;
    count += 1;
  }
  return count ? total / count : null;
};

const meanVector = (
  values: ArrayLike<number>,
  itemSize: number,
  vertices: readonly number[]
): readonly [number, number, number] | null => {
  if (itemSize < 2) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (const vertex of vertices) {
    const offset = vertex * itemSize;
    const vx = Number(values[offset]);
    const vy = Number(values[offset + 1]);
    const vz = itemSize >= 3 ? Number(values[offset + 2]) : 0;
    if (![vx, vy, vz].every(Number.isFinite)) continue;
    x += vx;
    y += vy;
    z += vz;
    count += 1;
  }
  return count ? [x / count, y / count, z / count] : null;
};

const hasEdge = (edges: readonly (readonly [number, number])[], a: number, b: number): boolean =>
  edges.some(([left, right]) => (left === a && right === b) || (left === b && right === a));

export const inspectMeshEntityScientificFields = ({
  mesh,
  target,
  scalarFields,
  vectorFields,
  differential = null,
  quality = null,
  features = null,
}: MeshEntityScientificFieldsInput): MeshEntityScientificFields => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const vertices = targetVertices(mesh, target, vertexCount);
  const mappedDomain = target.kind === "vertex" ? "vertex" : target.kind === "edge" ? "edge-mapped" : "face-mapped";
  const scalars: MeshScientificScalarValue[] = [];
  for (const field of scalarFields) {
    const value = meanScalar(field.values, vertices);
    if (value != null) scalars.push({ name: field.name, value, domain: mappedDomain });
  }
  scalars.sort((left, right) => left.name.localeCompare(right.name));

  const vectors: MeshScientificVectorValue[] = [];
  for (const field of vectorFields) {
    const value = meanVector(field.values, Math.max(1, Math.round(field.itemSize ?? 3)), vertices);
    if (!value) continue;
    vectors.push({ name: field.name, value, magnitude: Math.hypot(...value), domain: mappedDomain });
  }
  vectors.sort((left, right) => left.name.localeCompare(right.name));

  const qualityValues: MeshScientificScalarValue[] = [];
  if (target.kind === "face" && quality && target.faceIndex >= 0 && target.faceIndex < quality.faceCount) {
    for (const [name, values] of Object.entries(quality.fields.face)) {
      const value = Number(values[target.faceIndex]);
      if (Number.isFinite(value)) qualityValues.push({ name, value, domain: "face" });
    }
  }
  if (target.kind === "edge" && vertices.length === 2) {
    const first = vertices[0] * 3;
    const second = vertices[1] * 3;
    const value = Math.hypot(
      mesh.positions[second] - mesh.positions[first],
      mesh.positions[second + 1] - mesh.positions[first + 1],
      mesh.positions[second + 2] - mesh.positions[first + 2]
    );
    if (Number.isFinite(value)) qualityValues.push({ name: "edgeLength", value, domain: "edge" });
  }
  qualityValues.sort((left, right) => left.name.localeCompare(right.name));

  const featureMembership: SurfaceFeatureClass[] = [];
  if (features && vertices.length) {
    const classes = Object.keys(features.vertexMasks) as SurfaceFeatureClass[];
    for (const featureClass of classes) {
      const member = target.kind === "face"
        ? features.faceRegionMasks[featureClass]?.[target.faceIndex] === 1
        : vertices.every((vertex) => features.vertexMasks[featureClass]?.[vertex] === 1);
      if (member) featureMembership.push(featureClass);
    }
    if (target.kind === "edge" && hasEdge(features.edgeSets.feature, vertices[0], vertices[1])) {
      featureMembership.push("high-curvature");
    }
  }

  const warnings = new Set<string>();
  let principalDirectionsValidated = vertices.length > 0;
  if (differential) {
    for (const vertex of vertices) {
      principalDirectionsValidated &&= differential.directionValidMask[vertex] === 1;
      for (const warning of describeMeshCurvatureWarnings(differential.warningMask[vertex])) warnings.add(warning);
    }
  } else {
    principalDirectionsValidated = false;
  }

  return {
    target,
    vertexIndices: vertices,
    scalars,
    vectors,
    quality: qualityValues,
    featureMembership: [...new Set(featureMembership)],
    principalDirectionsValidated,
    warnings: [...warnings],
    probe: {
      targetId: target.kind === "vertex"
        ? `vertex:${target.vertexIndex}`
        : target.kind === "face"
          ? `face:${target.faceIndex}`
          : `edge:${target.edge[0]}-${target.edge[1]}`,
      domain: target.kind as AnalysisDomain,
      values: [
        ...scalars.map((entry) => ({
          field: { id: entry.name, label: entry.name, domain: target.kind as AnalysisDomain, valueType: "scalar" as const, source: entry.domain } satisfies AnalysisFieldMetadata,
          value: entry.value,
          valid: Number.isFinite(entry.value),
        })),
        ...vectors.map((entry) => ({
          field: { id: entry.name, label: entry.name, domain: target.kind as AnalysisDomain, valueType: "vector" as const, components: ["x", "y", "z"], source: entry.domain } satisfies AnalysisFieldMetadata,
          value: entry.value,
          valid: entry.value.every(Number.isFinite),
        })),
        ...qualityValues.map((entry) => ({
          field: { id: entry.name, label: entry.name, domain: target.kind as AnalysisDomain, valueType: "scalar" as const, source: "mesh-quality" } satisfies AnalysisFieldMetadata,
          value: entry.value,
          valid: Number.isFinite(entry.value),
        })),
      ],
      warnings: [...warnings],
    },
  };
};
