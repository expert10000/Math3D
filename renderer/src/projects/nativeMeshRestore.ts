import type { MeshDocument } from "@math3d/core";
import type { MeshReplayBundle } from "../mesh/meshReplay";

const kinds = new Set(["import", "bakedFromImplicit", "bakedFromExplicit", "bakedFromParam", "bakedFromWeierstrass", "detachedMesh", "geometryObject", "polyhedronPreset", "halfspaceIntersection", "convexHull", "csg", "proceduralObjects", "derivedSurface", "derivedCurve", "derivedVolume", "surface-tessellation"]);
/** The resource-backed viewer consumes the saved buffers, never regenerating their originating recipe. */
export const meshDocumentEditable = (document: MeshDocument): boolean => {
  const origin = document.source.origin as Record<string, unknown> | null;
  if (!origin || typeof origin !== "object" || Array.isArray(origin) || typeof origin.kind !== "string" || !kinds.has(origin.kind)) return false;
  const textFields = ["filename", "objectId", "objectName", "id", "label", "fromKind", "fromLabel", "meshId", "sourceSurfaceId", "sourceSurfaceLabel", "sourceCurveId", "sourceVolumeId", "role", "state", "algorithm", "variant"];
  if (textFields.some((field) => origin[field] !== undefined && typeof origin[field] !== "string")) return false;
  if (origin.kind === "import" && origin.format !== undefined && !["stl", "obj", "ply", "gltf", "glb"].includes(String(origin.format))) return false;
  const transform = (value: unknown) => {
    if (value === undefined) return true;
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return ["position", "rotation", "scale"].every((field) => {
      const vector = (value as Record<string, unknown>)[field] as Record<string, unknown> | undefined;
      return !!vector && ["x", "y", "z"].every((axis) => typeof vector[axis] === "number" && Number.isFinite(vector[axis]));
    });
  };
  if (origin.kind === "geometryObject") {
    if (!transform(origin.transform)) return false;
    if (origin.objects !== undefined && (!Array.isArray(origin.objects) || !origin.objects.every((item) => item && typeof item === "object" && !Array.isArray(item) &&
      ["objectId", "objectName"].every((field) => item[field] === undefined || typeof item[field] === "string") && transform(item.transform)))) return false;
  }
  if (origin.kind === "derivedSurface") {
    const units = origin.units as Record<string, unknown> | undefined;
    if (!units || ["length", "area", "gaussianCurvature", "meanCurvature"].some((field) => typeof units[field] !== "string")) return false;
  }
  return true;
};

/** Undo/redo must not activate an origin the host cannot consume. */
export const meshReplayEditable = (document: MeshDocument, replay?: MeshReplayBundle): boolean => {
  if (!meshDocumentEditable(document) || replay && !meshDocumentEditable(replay.checkpoint.document)) return false;
  for (const transaction of replay?.transactions ?? []) for (const command of [...transaction.commands, ...transaction.inverseCommands]) if (command.command.type === "mesh.resource.commit") {
    const source = (command.command.payload as unknown as { source: MeshDocument["source"] }).source;
    if (!meshDocumentEditable({ ...document, source })) return false;
  }
  return true;
};
