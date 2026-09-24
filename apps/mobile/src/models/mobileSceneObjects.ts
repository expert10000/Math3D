import type { SceneDocument, SurfaceDefinition } from "@math3d/core";

export type MobileSceneObjectItem = {
  id: string;
  label: string;
  kind: SurfaceDefinition["kind"];
  kindLabel: string;
  visible: boolean;
  selected: boolean;
};

const kindLabelByKind: Record<SurfaceDefinition["kind"], string> = {
  explicit: "Explicit surface",
  implicit: "Implicit surface",
  parametric: "Parametric surface",
  weierstrass: "Weierstrass surface",
  mesh: "Mesh",
};

export const buildMobileSceneObjectItems = (
  scene: SceneDocument,
  visibleSurfaceIds: readonly string[],
  selectedSurfaceId: string | null
): MobileSceneObjectItem[] => {
  const surfaces = scene.surfaces ?? [];
  const visible = new Set(visibleSurfaceIds);
  return surfaces.map((surface) => ({
    id: surface.id,
    label: surfaces.length === 1 ? scene.title : surface.id,
    kind: surface.kind,
    kindLabel: kindLabelByKind[surface.kind],
    visible: visible.has(surface.id),
    selected: surface.id === selectedSurfaceId,
  }));
};
