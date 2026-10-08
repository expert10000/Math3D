import { expect, it } from "vitest";
import { createSurfaceDocument, instantiateMath3DProjectTemplate, type SurfaceDocument } from "@math3d/core";
import { surfaceDocumentBinding } from "./surfaceDocumentBinding";
import { savedSurfaceDefinition } from "./savedSurfaceDefinition";

it("native analysis retains the captured identity, units and lineage, and distinguishes edits on an undo branch", () => {
  const saved = instantiateMath3DProjectTemplate("catenary-study", "native-analysis").workspace.entries.find(entry => entry.module === "surface")!.checkpoint as SurfaceDocument;
  const definition = savedSurfaceDefinition(saved, surfaceDocumentBinding(saved)!, 40);
  expect(definition.identity.surfaceId).toBe(saved.identity.id); expect(definition.identity.surfaceRevision).toBe(saved.identity.revision);
  expect(definition.identity.key).toContain(saved.identity.structuralHash); expect(definition.units.length).toBe("unitless");
  expect(definition.source.sourceIds).toEqual(saved.source.definition.sourceIds);
  expect(JSON.parse(String(definition.source.settings!.capturedSource))).toEqual(saved.source);
  const finer = savedSurfaceDefinition(saved, surfaceDocumentBinding(saved)!, 64);
  expect(finer.identity.key).toBe(definition.identity.key); expect(finer.fingerprint).not.toBe(definition.fingerprint);
  const changed = createSurfaceDocument({ stableKey: "changed", source: { ...saved.source, parameters: { ...saved.source.parameters, angleMax: Math.PI } } });
  const branch = { ...changed, identity: { ...changed.identity, id: saved.identity.id, revision: saved.identity.revision } };
  expect(savedSurfaceDefinition(branch, surfaceDocumentBinding(branch)!, 40).identity.key).not.toBe(definition.identity.key);
});
