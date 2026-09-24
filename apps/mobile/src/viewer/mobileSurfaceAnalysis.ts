import type { SurfaceDefinition } from "@math3d/core";
import { summarizeMobileMesh, type MobileMeshSummaryResult } from "../models/mobileMeshSummary";
import { buildSurfacePreviewGeometry, type MobileMeshPayload, type MobileRenderQuality } from "./mobileSurfacePreview";

export const buildMobileSurfaceAnalysis = (
  surface: SurfaceDefinition,
  quality: MobileRenderQuality,
  implicitMesh?: MobileMeshPayload
): MobileMeshSummaryResult => {
  if (surface.kind === "mesh") {
    return { status: "unavailable", reason: "This scene stores a mesh source reference without embedded triangle data." };
  }
  if (surface.kind === "implicit" && !implicitMesh) {
    return { status: "unavailable", reason: "Compute the implicit mesh before analysis." };
  }
  if (surface.kind === "implicit" && implicitMesh) {
    return summarizeMobileMesh({
      positions: implicitMesh.positions,
      indices: implicitMesh.indices,
      source: "Computed worker mesh",
    });
  }

  const preview = buildSurfacePreviewGeometry(surface, quality);
  const geometry = preview.geometry;
  if (!geometry) return { status: "unavailable", reason: "No rendered triangle data is available." };
  try {
    const positions = geometry.getAttribute("position")?.array as ArrayLike<number> | undefined;
    const indices = geometry.getIndex()?.array as ArrayLike<number> | undefined;
    if (!positions) return { status: "unavailable", reason: "Rendered geometry has no positions." };
    return summarizeMobileMesh({
      positions,
      indices,
      source: `Sampled ${quality} preview`,
    });
  } finally {
    geometry.dispose();
  }
};
