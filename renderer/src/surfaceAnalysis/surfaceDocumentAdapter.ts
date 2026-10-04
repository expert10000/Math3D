import { canonicalJsonStringify, createSurfaceDocument, type CanonicalJsonValue, type SurfaceDocument, type SurfaceDocumentSource } from "@math3d/core";
import { SurfaceCommandAdapter } from "@math3d/kernel";
import type { CanonicalSurfaceDefinition } from "./contracts";
export type { SurfaceReplayBundle } from "@math3d/kernel";

const legacyJson = <T>(value: T): T => {
  const omitUndefined = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(omitUndefined);
    if (entry && typeof entry === "object") return Object.fromEntries(Object.entries(entry).filter(([, child]) => child !== undefined).map(([key, child]) => [key, omitUndefined(child)]));
    return entry;
  };
  return JSON.parse(canonicalJsonStringify(omitUndefined(value))) as T;
};

export const surfaceSourceFromLegacyDefinition = (definition: CanonicalSurfaceDefinition): SurfaceDocumentSource => ({
  representation: definition.representation,
  domain: legacyJson(definition.domain) as CanonicalJsonValue,
  units: legacyJson(definition.units) as CanonicalJsonValue,
  orientation: legacyJson(definition.orientation) as CanonicalJsonValue,
  definition: legacyJson(definition.source) as SurfaceDocumentSource["definition"],
  parameters: legacyJson(definition.source.settings ?? {}) as SurfaceDocumentSource["parameters"],
  branchPolicy: null,
});

export const surfaceDocumentFromLegacyDefinition = (definition: CanonicalSurfaceDefinition): SurfaceDocument => createSurfaceDocument({
  stableKey: { legacySurfaceId: definition.identity.surfaceId },
  source: surfaceSourceFromLegacyDefinition(definition),
  metadata: { title: definition.identity.label, legacySurfaceId: definition.identity.surfaceId, analysisSettings: legacyJson(definition.sampling) as CanonicalJsonValue },
});

export class SurfaceDocumentAdapter extends SurfaceCommandAdapter {
  syncLegacyDefinition(definition: CanonicalSurfaceDefinition): SurfaceDocument {
    this.commitSource(surfaceSourceFromLegacyDefinition(definition));
    return this.setAnalysisSettings(legacyJson(definition.sampling) as CanonicalJsonValue);
  }
}
