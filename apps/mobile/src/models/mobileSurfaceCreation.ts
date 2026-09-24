import type { SceneDocument, SurfaceDefinition } from "@math3d/core";
import { createUniqueMobileSceneObjectId } from "./mobileSceneObjectOperations";

export type MobilePrimitiveKind = "plane" | "sphere" | "cylinder" | "torus";

const primitiveBaseId: Record<MobilePrimitiveKind, string> = {
  plane: "plane",
  sphere: "sphere",
  cylinder: "cylinder",
  torus: "torus",
};

export const createMobilePrimitiveSurface = (
  kind: MobilePrimitiveKind,
  scene: SceneDocument | null
): SurfaceDefinition => {
  const placeholder: SceneDocument = scene ?? { id: "new", title: "New scene", createdAt: 0, updatedAt: 0, surfaces: [] };
  const id = createUniqueMobileSceneObjectId(placeholder, primitiveBaseId[kind]);
  if (kind === "plane") {
    return { id, kind: "explicit", expression: "0", domain: { xSpan: 2, ySpan: 2 }, resolution: 36 };
  }
  if (kind === "sphere") {
    return {
      id,
      kind: "parametric",
      xExpr: "cos(u)*cos(v)",
      yExpr: "sin(u)*cos(v)",
      zExpr: "sin(v)",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI / 2, vMax: Math.PI / 2 },
      resolution: 56,
    };
  }
  if (kind === "cylinder") {
    return {
      id,
      kind: "parametric",
      xExpr: "cos(u)",
      yExpr: "sin(u)",
      zExpr: "v",
      domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -1.5, vMax: 1.5 },
      resolution: 48,
    };
  }
  return {
    id,
    kind: "parametric",
    xExpr: "(1.6 + 0.5*cos(v))*cos(u)",
    yExpr: "(1.6 + 0.5*cos(v))*sin(u)",
    zExpr: "0.5*sin(v)",
    domain: { uMin: -Math.PI, uMax: Math.PI, vMin: -Math.PI, vMax: Math.PI },
    resolution: 64,
  };
};

export const appendMobileSurface = (
  scene: SceneDocument | null,
  surface: SurfaceDefinition,
  now = Date.now()
): SceneDocument => scene
  ? { ...scene, surfaces: [...(scene.surfaces ?? []), surface], updatedAt: now }
  : {
      id: `scene-mobile-created-${now}`,
      title: "Untitled scene",
      createdAt: now,
      updatedAt: now,
      surfaces: [surface],
    };
