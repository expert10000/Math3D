import { qualifyCrossModuleAdapter,
  type AdapterFrame, type AdapterQualification, type CrossModuleAdapterRegistry,
  type KernelWorkspaceModule, type Math3DWorkerOperationId, type PlatformCapabilitySnapshot,
  type ScientificSourceGeneration } from "@math3d/core";
import type { ProjectScientificCursor } from "./scientificCursor";

/** Mapping implementations are supplied by the target view; a descriptor alone never transforms a point. */
export type ProjectPointMapper = Readonly<{
  id: string;
  version: number;
  map: (position: readonly number[]) => readonly number[] | null;
}>;
export type ProjectCursorProjection = Readonly<{
  status: "mapped";
  position: readonly number[];
  frame: AdapterFrame;
  accuracy: "exact" | "interpolated" | "approximate";
  sourceSequence: number;
}> | Readonly<{
  status: "disabled";
  qualification: AdapterQualification;
}> | Readonly<{
  status: "outside" | "invalid-mapping";
  reason: string;
}>;

/** Qualify source, frame, host, and implementation before invoking an explicit mapping. */
export function projectProjectCursor(cursor: ProjectScientificCursor, input: {
  registry: CrossModuleAdapterRegistry;
  adapterId: string;
  targetModule: KernelWorkspaceModule;
  targetFrame: AdapterFrame;
  currentSource: ScientificSourceGeneration | null;
  platform: PlatformCapabilitySnapshot;
  mapper: ProjectPointMapper | null;
  resourceAvailable?: (sha256: string) => boolean;
  operationAvailable?: (id: Math3DWorkerOperationId) => boolean;
}): ProjectCursorProjection {
  const qualification = qualifyCrossModuleAdapter(input.registry, {
    adapterId: input.adapterId,
    selection: { source: cursor.source, sourceModule: cursor.sourceModule,
      resourceSha256: cursor.resourceSha256, kind: "point", frame: cursor.frame },
    targetModule: input.targetModule, targetFrame: input.targetFrame,
    currentSource: input.currentSource, platform: input.platform,
    resourceAvailable: input.resourceAvailable, operationAvailable: input.operationAvailable,
    mappingAvailable: (id, version) => input.mapper?.id === id && input.mapper.version === version,
  });
  if (!qualification.enabled) return { status: "disabled", qualification };
  if (!input.mapper || !qualification.mapping)
    return { status: "invalid-mapping", reason: "Qualified mapping implementation is unavailable." };
  let position: readonly number[] | null;
  try { position = input.mapper.map(cursor.position); }
  catch { return { status: "invalid-mapping", reason: "Point mapping failed." }; }
  if (position === null) return { status: "outside", reason: "Point is outside the mapped target domain." };
  if (!Array.isArray(position) || position.length !== input.targetFrame.axes.length ||
      !position.every(value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12))
    return { status: "invalid-mapping", reason: "Point mapping returned invalid target coordinates." };
  return { status: "mapped", position: [...position], frame: structuredClone(input.targetFrame),
    accuracy: qualification.mapping.accuracy, sourceSequence: cursor.sequence };
}
