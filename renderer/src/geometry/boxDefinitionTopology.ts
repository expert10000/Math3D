import type { GeometryObject } from "./proceduralObjects";

export type BoxDefinitionBoundaryTopology = {
  readonly method: "parametric-box-boundary";
  readonly widthSegments: number;
  readonly heightSegments: number;
  readonly depthSegments: number;
  readonly vertexCount: number;
  readonly edgeCount: number;
  readonly faceCount: number;
  readonly eulerCharacteristic: 2;
  readonly connectedComponentCount: 1;
  readonly boundaryEdgeCount: 0;
};

/** Combinatorics of a positive-size box definition after triangulating each face grid. */
export const boxDefinitionBoundaryTopology = (
  object: Pick<GeometryObject, "type" | "params">
): BoxDefinitionBoundaryTopology | null => {
  if (object.type !== "box") return null;
  const width = Number(object.params.width ?? 1);
  const height = Number(object.params.height ?? 1);
  const depth = Number(object.params.depth ?? 1);
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0)) return null;
  const segments = [object.params.widthSegments, object.params.heightSegments, object.params.depthSegments]
    .map((value) => Number(value ?? 1));
  if (!segments.every(Number.isFinite)) return null;
  const [widthSegments, heightSegments, depthSegments] = segments.map((value) => Math.max(1, Math.round(value)));
  const faceGridCount = widthSegments * heightSegments + widthSegments * depthSegments + heightSegments * depthSegments;
  if (!Number.isSafeInteger(faceGridCount) || faceGridCount < 3 || faceGridCount > Number.MAX_SAFE_INTEGER / 6) return null;
  return {
    method: "parametric-box-boundary",
    widthSegments,
    heightSegments,
    depthSegments,
    vertexCount: 2 * faceGridCount + 2,
    edgeCount: 6 * faceGridCount,
    faceCount: 4 * faceGridCount,
    eulerCharacteristic: 2,
    connectedComponentCount: 1,
    boundaryEdgeCount: 0,
  };
};
