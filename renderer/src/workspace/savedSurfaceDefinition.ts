import type { SurfaceDocument } from "@math3d/core";
import { adaptSurfaceDefinition } from "../surfaceAnalysis/infrastructure";
import type { SurfaceDocumentBinding } from "./surfaceDocumentBinding";

/** Native analysis uses the captured document's identity and exact construction. */
export function savedSurfaceDefinition(document: SurfaceDocument, binding: SurfaceDocumentBinding, resolution: number) {
  const units = document.source.units as { length?: string; angle?: "rad" | "deg" };
  const definition = adaptSurfaceDefinition({
    id: document.identity.id, revision: document.identity.revision, label: document.metadata.title,
    sourceRevision: document.identity.structuralHash, representation: "constructed",
    familyId: document.source.definition.familyId, sourceIds: document.source.definition.sourceIds ?? [],
    settings: { capturedSource: JSON.stringify(document.source), structuralHash: document.identity.structuralHash },
    domain: { kind: "parameter", u: { min: binding.domain.uMin, max: binding.domain.uMax, label: "profile", periodic: binding.wrapU },
      v: { min: binding.domain.vMin, max: binding.domain.vMax, label: "construction fraction", periodic: binding.wrapV } },
    sampling: { uSegments: resolution, vSegments: resolution },
    units: { length: units.length, angle: units.angle },
    orientation: { convention: "parameter-cross", sign: 1, description: "Cross product of the captured profile and construction parameter tangents" },
  });
  return { ...definition, identity: { ...definition.identity, key: `${definition.identity.key}:${document.identity.structuralHash}` } };
}
