import { readQuantumSceneBundle } from "./bundle";
import { type QuantumScene, type ScenePayload, verifyScenePayload } from "./index";
import { createHash } from "node:crypto";

export interface ImportedQuantumScene {
  /** A regular Math3D SceneDocument; no worker or executable expression is added. */
  document: Math3DQuantumDocument;
  /** Exact validated QVIS metadata and decoded arrays for later field adapters. */
  source: QuantumScene;
  arrays: Map<string, Float64Array>;
  mappedObjectIds: string[];
  deferredObjectIds: string[];
  deferredFieldIds: string[];
}

// Structural subset of @math3d/core's SceneDocument. The Node build cannot
// import package source outside its rootDir; parity is checked in acceptance.
type Point3 = { x: number; y: number; z: number; id?: string; label?: string; color?: number; size?: number; opacity?: number };
type GeometryScene = {
  points?: Point3[];
  segments?: { a: Point3; b: Point3; color?: number; opacity?: number }[];
  triangles?: { a: Point3; b: Point3; c: Point3; color?: number; opacity?: number }[];
};
export type Math3DQuantumDocument = {
  id: string; title: string; createdAt: number; updatedAt: number;
  geometry: GeometryScene;
  cameras: { id: string; name: string; position: Point3; target: Point3; up: Point3 }[];
  activeCameraId: string;
  metadata: Record<string, string | number | boolean | null>;
  extensions: Record<string, unknown>;
};

const digest = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const point = (values: Float64Array, i: number): Point3 => ({ x: values[i * 3], y: values[i * 3 + 1], z: values[i * 3 + 2] });
const MAX_MAPPED_PRIMITIVES = 20_000;

/** Preserve source coordinates exactly; never treat scalar, phase or vector units as positions. */
export async function adaptQuantumScene(payload: ScenePayload): Promise<ImportedQuantumScene> {
  const arrays = await verifyScenePayload(payload, digest);
  const scene = payload.scene;
  const geometry: GeometryScene = { points: [], segments: [], triangles: [] };
  const mappedObjectIds: string[] = [], deferredObjectIds: string[] = [];
  for (const object of scene.objects) {
    if (!object.visible) { deferredObjectIds.push(object.id); continue; }
    const positions = arrays.get(object.positions)!;
    const count = positions.length / 3;
    const color = parseInt(object.style.color.slice(1), 16);
    const proposed = object.kind === "point-cloud" ? count : object.kind === "polyline" ? count - 1 :
      object.kind === "segments" ? count / 2 : object.kind === "mesh" ? arrays.get(object.indices!)!.length / 3 : 0;
    const mapped = geometry.points!.length + geometry.segments!.length + geometry.triangles!.length;
    if (mapped + proposed > MAX_MAPPED_PRIMITIVES) { deferredObjectIds.push(object.id); continue; }
    if (object.kind === "point-cloud") {
      for (let i = 0; i < count; i++) geometry.points!.push({ ...point(positions, i), id: `${object.id}:site:${i}`, label: object.label,
        color, size: object.style.size, opacity: object.style.opacity });
    } else if (object.kind === "polyline" || object.kind === "segments") {
      const step = object.kind === "segments" ? 2 : 1;
      for (let i = 0; i + 1 < count; i += step) {
        const segment = i / step;
        geometry.segments!.push({
          a: { ...point(positions, i), id: `${object.id}:link:${segment}:a`, label: object.label },
          b: { ...point(positions, i + 1), id: `${object.id}:link:${segment}:b`, label: object.label },
          color, opacity: object.style.opacity,
        });
      }
    } else if (object.kind === "mesh") {
      const indices = arrays.get(object.indices!)!;
      for (let i = 0; i < indices.length; i += 3)
        geometry.triangles!.push({
          a: { ...point(positions, indices[i]), id: `${object.id}:${indices[i]}` },
          b: { ...point(positions, indices[i + 1]), id: `${object.id}:${indices[i + 1]}` },
          c: { ...point(positions, indices[i + 2]), id: `${object.id}:${indices[i + 2]}` },
          color, opacity: object.style.opacity,
        });
    } else {
      // Vectors require an explicit value-to-coordinate scale and are not silently converted.
      deferredObjectIds.push(object.id);
      continue;
    }
    mappedObjectIds.push(object.id);
  }
  const importedAt = Date.now();
  const document: Math3DQuantumDocument = {
    id: `quantum-${scene.id}`,
    title: scene.title,
    createdAt: importedAt,
    updatedAt: importedAt,
    geometry,
    cameras: [{ id: "quantum-source-camera", name: "Source scene camera",
      position: point(Float64Array.from(scene.camera.position), 0),
      target: point(Float64Array.from(scene.camera.target), 0),
      up: point(Float64Array.from(scene.camera.up), 0) }],
    activeCameraId: "quantum-source-camera",
    metadata: {
      sourceFormat: "quantum-scene/v1", sourceRunId: scene.provenance.runId,
      sourceResultSha256: scene.provenance.resultSha256, sourceModel: scene.provenance.model,
      sourceEngine: scene.provenance.engine, sourceComputedAt: scene.provenance.computedAt,
    },
    extensions: {
      "quantum-scene/v1": {
        scene,
        mappedObjectIds,
        deferredObjectIds,
        deferredFieldIds: (scene.fields ?? []).map(field => field.id),
        selectionTransferred: false,
      },
    },
  };
  return { document, source: scene, arrays, mappedObjectIds, deferredObjectIds,
    deferredFieldIds: (scene.fields ?? []).map(field => field.id) };
}

export async function importQuantumSceneBundle(directory: string): Promise<ImportedQuantumScene> {
  return adaptQuantumScene(await readQuantumSceneBundle(directory));
}
