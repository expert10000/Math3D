import { moduleScientificOperationBindings, type ScientificWorkflowBinding } from "@math3d/core";
import { surfaceCurvatureOperation } from "./surfaceAnalysis/surfaceCurvatureOperation";
import { parametricSurfaceCurvatureOperation,
  type ParametricCurvatureParameters, type ParametricSurfaceSource } from
  "./surfaceAnalysis/parametricCurvatureOperation";
import { analyticSurfaceCurvatureOperation } from "./surfaceAnalysis/analyticCurvatureOperation";
import { meshVertexNormalsOperation } from "./mesh/meshOps";
import type { SurfaceCurvatureFieldSource, SurfaceCurvatureOptions } from
  "./surfaceAnalysis/surfaceCurvature";
import type { SurfaceMeshData } from "./mesh/surfaceMesh";

type JsonRecord = Record<string, unknown>;

/** One adapter table is shared by the editor and server; each entry invokes a registered operation. */
export const SCIENTIFIC_OPERATION_BINDINGS: Readonly<Record<string, ScientificWorkflowBinding>> = {
  ...moduleScientificOperationBindings,
  "surface.curvature.compute": {
    implementationId: surfaceCurvatureOperation.definition.implementationId,
    execute: (input, parameters) => {
      const source = (input as JsonRecord).surfaceSamples as SurfaceCurvatureFieldSource;
      if (![source.K, source.H, source.k1, source.k2].every(values =>
        values.length === source.sampleCount))
        throw new TypeError("Curvature arrays must match sampleCount.");
      const normalized = Object.fromEntries(Object.entries(source).map(([key, value]) =>
        [key, Array.isArray(value) ? value.map(item => item === null ? Number.NaN : item) : value]));
      return surfaceCurvatureOperation.execute({ source: normalized as SurfaceCurvatureFieldSource,
        options: parameters as SurfaceCurvatureOptions });
    },
  },
  "surface.curvature.parametric": {
    implementationId: parametricSurfaceCurvatureOperation.definition.implementationId,
    execute: (input, parameters) =>
      parametricSurfaceCurvatureOperation.execute({
        surface: (input as JsonRecord).surface as ParametricSurfaceSource,
        parameters: parameters as ParametricCurvatureParameters }),
  },
  "surface.curvature.analytic-reference": {
    implementationId: analyticSurfaceCurvatureOperation.definition.implementationId,
    execute: (input, parameters) =>
      analyticSurfaceCurvatureOperation.execute({ presetId: (input as JsonRecord).presetId as string,
        resolutionU: (parameters as JsonRecord).resolutionU as number | undefined,
        resolutionV: (parameters as JsonRecord).resolutionV as number | undefined }),
  },
  "mesh.normals.compute": {
    implementationId: meshVertexNormalsOperation.definition.implementationId,
    execute: (input) => {
      const mesh = (input as JsonRecord).mesh as { positions: number[]; indices?: number[] };
      const vertexCount = mesh.positions.length / 3;
      if (!Number.isInteger(vertexCount) || (!mesh.indices && vertexCount % 3 !== 0) || (mesh.indices &&
          (mesh.indices.length % 3 !== 0 || mesh.indices.some(index => index >= vertexCount))))
        throw new TypeError("Mesh positions and triangle indices do not form a valid triangle mesh.");
      const source: SurfaceMeshData = { label: "Scientific operation mesh",
        source: { kind: "import" }, positions: Float32Array.from(mesh.positions),
        indices: mesh.indices ? Uint32Array.from(mesh.indices) : null };
      const result = meshVertexNormalsOperation.execute({ mesh: source });
      return { positions: result.positions, ...(result.indices ? { indices: result.indices } : {}),
        normals: result.normals };
    },
  },
};
