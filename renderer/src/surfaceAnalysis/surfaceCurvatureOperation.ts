import { bindScientificOperation, MATH3D_PLATFORM_DISCOVERY,
  SCIENTIFIC_CAPABILITY_REGISTRY, type ScientificOperationDescriptor } from "@math3d/core";
import { createSurfaceCurvatureField, type SurfaceCurvatureFieldSource,
  type SurfaceCurvatureOptions } from "./surfaceCurvature";

/** The UI and Surface Analysis worker invoke the same registered implementation. */
const discoveredDescriptor = MATH3D_PLATFORM_DISCOVERY.executableOperation(
  "surface.curvature.compute", "browser", id => id === "math3d.surface.curvature-field",
);
if (!discoveredDescriptor)
  throw new Error("Surface curvature operation is missing from platform discovery.");
export const surfaceCurvatureOperationDescriptor: ScientificOperationDescriptor = discoveredDescriptor;

export const surfaceCurvatureOperation = bindScientificOperation(
  SCIENTIFIC_CAPABILITY_REGISTRY, surfaceCurvatureOperationDescriptor.id,
  surfaceCurvatureOperationDescriptor.implementationId,
  ({ source, options }: { source: SurfaceCurvatureFieldSource; options: SurfaceCurvatureOptions }) =>
    createSurfaceCurvatureField(source, options),
);
