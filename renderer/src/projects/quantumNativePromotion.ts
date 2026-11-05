import { createCurveDocument, createGeometryDocument, createGraph2DDocument, createMeshDocument,
  createSurfaceDocument, encodeMeshBuffers, sha256Checksum,
  type CurveDocument, type GeometryDocument, type Graph2DDocument, type Graph2DPointRow,
  type Graph2DPointTableReference, type MeshDocument, type SurfaceDocument } from "@math3d/core";
import type { QuantumSceneOpenResponse } from "../components/QuantumScenePreview";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;
export type QuantumNativeTarget = "geometry" | "curve" | "graph2d" | "mesh" | "surface";
export type QuantumNativeDocument = GeometryDocument | CurveDocument | Graph2DDocument | MeshDocument | SurfaceDocument;
export type QuantumNativePromotion = { documents: QuantumNativeDocument[]; meshBytes?: { id: string; bytes: Uint8Array } };

function source(opened: Opened) {
  const extension = opened.document.extensions["quantum-scene/v2"] ?? opened.document.extensions["quantum-scene/v1"];
  if (!extension || typeof extension !== "object") throw new Error("Verified quantum scene metadata is missing");
  const scene = (extension as { scene: { objects: { id: string; kind: string; label: string }[];
    coordinates: { axes: [string, string, string]; units: [string, string, string]; handedness: string };
    provenance: { runId: string; resultSha256: string } } }).scene;
  return scene;
}
function pointsOf(opened: Opened) {
  const object = source(opened).objects.find(item => item.kind === "polyline");
  if (!object) throw new Error("This scene has no supplied polyline to promote");
  const segments = (opened.document.geometry.segments ?? []).filter(segment =>
    segment.a.id?.startsWith(`${object.id}:link:`)).sort((a, b) =>
    Number(a.a.id?.split(":").at(-2)) - Number(b.a.id?.split(":").at(-2)));
  if (!segments.length || segments.length > 2048) throw new Error("Polyline promotion requires 1–2048 mapped segments");
  const points = [segments[0].a, ...segments.map(segment => segment.b)].map(point => [point.x, point.y, point.z]);
  if (points.some(point => point.some(value => !Number.isFinite(value)))) throw new Error("Invalid supplied polyline coordinates");
  return { object, points };
}
function trianglesOf(opened: Opened) {
  const object = source(opened).objects.find(item => item.kind === "mesh");
  if (!object) throw new Error("This scene has no mapped mesh to promote");
  const triangles = (opened.document.geometry.triangles ?? []).filter(triangle =>
    triangle.a.id?.startsWith(`${object.id}:`));
  if (!triangles.length || triangles.length > 5000) throw new Error("Mesh promotion requires 1–5000 mapped triangles");
  const positions = new Float32Array(triangles.length * 9);
  triangles.forEach((triangle, index) => [triangle.a, triangle.b, triangle.c].forEach((point, vertex) => {
    const offset = index * 9 + vertex * 3;
    positions[offset] = point.x; positions[offset + 1] = point.y; positions[offset + 2] = point.z;
  }));
  return { object, positions };
}

/** Derive editable native copies; the source scene and its f64 datasets are never modified. */
export function promoteQuantumNative(opened: Opened, target: QuantumNativeTarget,
  publishRows: (rows: readonly Graph2DPointRow[]) => Graph2DPointTableReference): QuantumNativePromotion {
  const scene = source(opened), fingerprint = opened.reference.sceneFingerprint;
  const provenance = { sceneFingerprint: fingerprint, runId: scene.provenance.runId,
    resultSha256: scene.provenance.resultSha256, conversion: target };
  const coordinates = scene.coordinates;
  const frame = Array.isArray(coordinates.axes) && coordinates.axes.length === 3 &&
    Array.isArray(coordinates.units) && coordinates.units.length === 3 &&
    coordinates.units.every(unit => unit === coordinates.units[0]) &&
    new Set(coordinates.axes).size === 3 && ["left", "right"].includes(coordinates.handedness) ? {
      format: "math3d.coordinate-frame/v1", frame: `quantum:${fingerprint}`,
      unit: coordinates.units[0], axes: coordinates.axes, handedness: coordinates.handedness,
    } : null;
  if (target === "geometry") {
    const geometry = opened.document.geometry;
    const count = (geometry.points?.length ?? 0) + (geometry.segments?.length ?? 0) + (geometry.triangles?.length ?? 0);
    if (!count || count > 5000) throw new Error("Geometry promotion requires 1–5000 mapped primitives");
    return { documents: [createGeometryDocument({ stableKey: provenance,
      source: { geometry: geometry as GeometryDocument["source"]["geometry"], objects: [], surfaces: [],
        constructions: [], relationships: [], parameters: {}, extensions: { "quantum.promotion/v1": provenance,
          ...(frame ? { math3dCoordinateFrame: frame } : {}) } },
      metadata: { title: `${opened.document.title} · geometry copy` } })] };
  }
  if (target === "curve" || target === "graph2d") {
    const { object, points } = pointsOf(opened);
    if (target === "curve") return { documents: [createCurveDocument({ stableKey: { ...provenance, objectId: object.id },
      source: { representation: "polyline", dimension: 3,
        domain: { parameter: "sample", min: 0, max: points.length - 1, closed: false, periodic: false },
        units: { position: scene.coordinates.units[0], parameter: "sample", angle: "rad" },
        orientation: { direction: "stored" }, derivatives: {},
        definition: { familyId: "quantum-polyline-copy", pointCount: points.length, points },
        dependencies: [] }, metadata: { title: `${object.label} · curve copy` } })] };
    const vertical = Math.max(...points.map(p => p[2])) - Math.min(...points.map(p => p[2])) > 1e-10 ? 2 : 1;
    const xs = points.map(p => p[0]), min = Math.min(...xs), max = Math.max(...xs);
    if (!(max > min)) throw new Error("Graph promotion needs a varying first coordinate");
    const rows = points.map((p, index) => ({ id: `row_${index + 1}`, x: p[0], y: p[vertical] }));
    const table = publishRows(rows);
    return { documents: [createGraph2DDocument({ stableKey: { ...provenance, objectId: object.id },
      title: `${object.label} · graph copy`, source: { objects: [{ id: "quantum-profile", kind: "point-series",
        label: object.label, table, mode: "line", missing: "gap",
        domain: { min, max, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } })] };
  }
  const { object, positions } = trianglesOf(opened);
  const bytes = encodeMeshBuffers({ positions, indices: null });
  const checksum = sha256Checksum(bytes), id = `mesh-resource:${checksum.slice(7, 39)}`;
  const mesh = createMeshDocument({ stableKey: { ...provenance, objectId: object.id }, label: `${object.label} · mesh copy`,
    source: { objectId: `mesh-object:${checksum.slice(7, 39)}`,
      resource: { id, checksum, vertexCount: positions.length / 3, indexCount: 0,
        hasNormals: false, hasUvs: false, encoding: "math3d.mesh-buffers.v1" },
      origin: { kind: "quantum-promotion", ...provenance, objectId: object.id, precision: "float32-display-copy",
        ...(frame ? { math3dCoordinateFrame: frame } : {}) } } });
  if (target === "mesh") return { documents: [mesh], meshBytes: { id, bytes } };
  const surface = createSurfaceDocument({ stableKey: { ...provenance, objectId: object.id },
    metadata: { title: `${object.label} · surface copy` },
    source: { representation: "mesh-backed", domain: { kind: "mesh" },
      units: { length: scene.coordinates.units[0] }, orientation: { sign: 1 },
      definition: { familyId: "quantum-mesh-copy", meshId: mesh.identity.id },
      parameters: { ...provenance, objectId: object.id }, branchPolicy: null } });
  return { documents: [mesh, surface], meshBytes: { id, bytes } };
}
