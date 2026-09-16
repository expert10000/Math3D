import { describe, expect, it } from "vitest";
import { parseSurfaceDocument, serializeSurfaceDocument } from "@math3d/core";
import { runDomainAdapterConformance, type DomainAdapterConformanceFixture } from "@math3d/kernel";
import { adaptSurfaceDefinition } from "./infrastructure";
import { SurfaceDocumentAdapter, surfaceDocumentFromLegacyDefinition } from "./surfaceDocumentAdapter";
import { compactDerivedSurfaceMesh, createDerivedSurfaceMeshPayload } from "./derivedSurfaceMesh";
import { SurfaceMeshKernelHandoff } from "./surfaceMeshKernelHandoff";
import { createSurfaceAnalysisWorkspaceDocument, parseSurfaceAnalysisWorkspace, serializeSurfaceAnalysisWorkspace } from "./persistence";

const definition = (formula = "x*x+y*y", sampling = 16) => adaptSurfaceDefinition({
  id: "graph:custom", revision: formula === "x*x+y*y" ? 1 : 2, label: "Graph",
  representation: "explicit", formula,
  domain: { kind: "graph", x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
  sampling: { uSegments: sampling, vSegments: sampling },
});

describe("GK10 Surface document adapter", () => {
  it("passes the shared GK03 document, command, and persistence gate", async () => {
    const fixture: DomainAdapterConformanceFixture<SurfaceDocumentAdapter> = {
      name: "SurfaceDocumentAdapter",
      create: () => new SurfaceDocumentAdapter(surfaceDocumentFromLegacyDefinition(definition())),
      snapshot: (adapter) => {
        const document = adapter.document();
        const history = adapter.history();
        return {
          identity: document.identity, structuralState: document.source as never,
          persistentState: document as never,
          history: { undoDepth: history.undoDepth, redoDepth: history.redoDepth },
        };
      },
      preview: (adapter) => { adapter.previewSource({ ...adapter.document().source }); },
      commitStructuralEdit: (adapter) => { adapter.commitSource({ ...adapter.document().source, definition: { ...adapter.document().source.definition, expressions: { formula: "x*x-y*y" } } }); },
      attemptInvalidEdit: (adapter) => { adapter.commitSource({ ...adapter.document().source, domain: new Float32Array([1, 2]) as never }); },
      undo: (adapter) => { adapter.undo(); },
      redo: (adapter) => { adapter.redo(); },
      replay: (adapter) => SurfaceDocumentAdapter.fromReplayBundle(adapter.replayBundle()),
      reopen: (adapter) => SurfaceDocumentAdapter.parse(adapter.serialize()),
      queryIsolation: (adapter) => {
        const before = adapter.serialize();
        try { (adapter.document().source.definition as { familyId: string }).familyId = "mutated"; } catch { /* immutable query */ }
        return adapter.serialize() === before;
      },
    };
    const report = await runDomainAdapterConformance(fixture);
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
  });

  it("keeps display sampling outside the structural identity and replays source edits", () => {
    const adapter = new SurfaceDocumentAdapter(surfaceDocumentFromLegacyDefinition(definition()));
    const initial = adapter.document();
    adapter.syncLegacyDefinition(definition("x*x+y*y", 64));
    expect(adapter.document().identity).toEqual(initial.identity);
    expect(adapter.document().metadata.analysisSettings).toMatchObject({ uSegments: 64 });
    adapter.syncLegacyDefinition(definition("x*x-y*y", 64));
    const edited = adapter.document();
    expect(edited.identity.revision).toBe(initial.identity.revision + 1);
    expect(edited.identity.structuralHash).not.toBe(initial.identity.structuralHash);
    expect(parseSurfaceDocument(serializeSurfaceDocument(edited))).toEqual(edited);
    expect(SurfaceDocumentAdapter.fromReplayBundle(adapter.replayBundle()).document()).toEqual(edited);
    const workspace = createSurfaceAnalysisWorkspaceDocument({
      kernelDocuments: [edited], kernelReplayBundles: [{ surfaceId: definition().identity.surfaceId, bundle: adapter.replayBundle() }],
    });
    const reopened = parseSurfaceAnalysisWorkspace(serializeSurfaceAnalysisWorkspace(workspace));
    expect(SurfaceDocumentAdapter.fromReplayBundle(reopened.kernelReplayBundles[0]!.bundle).document()).toEqual(edited);
    expect(adapter.undo().identity.structuralHash).toBe(initial.identity.structuralHash);
    expect(adapter.redo().identity.structuralHash).toBe(edited.identity.structuralHash);
  });

  it("loads the legacy workspace and persists the canonical Surface document", () => {
    const legacy = parseSurfaceAnalysisWorkspace(JSON.stringify({ version: 1, definitions: [definition()], savedResults: [] }));
    expect(legacy.kernelDocuments).toEqual([]);
    const document = surfaceDocumentFromLegacyDefinition(legacy.definitions[0]!);
    const saved = createSurfaceAnalysisWorkspaceDocument({ ...legacy, kernelDocuments: [document] });
    expect(parseSurfaceAnalysisWorkspace(serializeSurfaceAnalysisWorkspace(saved)).kernelDocuments).toEqual([document]);
  });

  it("rejects non-finite legacy mathematics instead of silently rewriting it", () => {
    const malformed = { ...definition(), source: { familyId: "explicit-graph", settings: { coefficient: Number.NaN } } };
    expect(() => surfaceDocumentFromLegacyDefinition(malformed)).toThrow(/finite/i);
  });
});

describe("GK11 Surface-to-Mesh kernel handoff", () => {
  it("publishes a revision-bound artifact and promotes a stable Mesh snapshot with lineage", () => {
    const surface = surfaceDocumentFromLegacyDefinition(definition());
    const payload = createDerivedSurfaceMeshPayload({ definition: definition(), label: "Graph mesh", vertexCount: 3, faceCount: 1, method: "grid", settings: { resolution: 16, tolerance: 0.01 }, backend: { id: "native", version: "1" }, correspondence: { parameterCoordinates: [0, 0, 1, 0, 0, 1] } });
    const record = compactDerivedSurfaceMesh(payload, "Graph mesh");
    const handoff = new SurfaceMeshKernelHandoff([surface]);
    const published = handoff.publish({ record, payload, sources: [surface], geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } });
    expect(handoff.resolve(record.identity.meshId).ok).toBe(true);
    expect(handoff.resolveMapping(record.identity.meshId)?.ok).toBe(true);
    expect(published.relations[0]).toMatchObject({ kind: "generated-by", operation: "surface.tessellate", status: "current" });
    expect(published.relations[1]).toMatchObject({ kind: "generated-by", operation: "surface.tessellate.locate-back" });
    const promoted = handoff.promote(record.identity.meshId, "Graph snapshot");
    expect(promoted.meshDocument?.source.resource.vertexCount).toBe(3);
    expect(promoted.meshDocument?.source.resource.id).not.toBe(published.handle.artifactId);
    const promotedBytes = handoff.resolvePromoted(record.identity.meshId);
    expect(promotedBytes?.byteLength).toBeGreaterThan(8);
    expect(promoted.relations[2]).toMatchObject({ kind: "promoted-from", target: { type: "document" } });
    const saved = createSurfaceAnalysisWorkspaceDocument({ kernelDocuments: [surface], kernelHandoffs: [promoted] });
    const reopenedWorkspace = parseSurfaceAnalysisWorkspace(serializeSurfaceAnalysisWorkspace(saved));
    const reopened = new SurfaceMeshKernelHandoff(reopenedWorkspace.kernelDocuments, reopenedWorkspace.kernelHandoffs);
    expect(reopened.resolve(record.identity.meshId)).toMatchObject({ ok: false, reason: "missing" });
    expect(reopened.resolveMapping(record.identity.meshId)).toMatchObject({ ok: false, reason: "missing" });
    expect(reopened.resolvePromoted(record.identity.meshId)).toBeNull();
    const changed = new SurfaceDocumentAdapter(surface).syncLegacyDefinition(definition("x*x-y*y"));
    handoff.setSource(changed);
    expect(handoff.resolve(record.identity.meshId)).toMatchObject({ ok: false, reason: "stale-source" });
    expect(handoff.record(record.identity.meshId)?.meshDocument).toEqual(promoted.meshDocument);
    expect(handoff.resolvePromoted(record.identity.meshId)).toEqual(promotedBytes);
  });

  it("tracks every source of a multi-surface tessellation", () => {
    const first = surfaceDocumentFromLegacyDefinition(definition());
    const second = surfaceDocumentFromLegacyDefinition(adaptSurfaceDefinition({
      id: "graph:other", revision: 1, label: "Other", representation: "explicit", formula: "x+y",
      domain: { kind: "graph", x: { min: -1, max: 1 }, y: { min: -1, max: 1 } }, sampling: { uSegments: 8, vSegments: 8 },
    }));
    const payload = createDerivedSurfaceMeshPayload({ definition: definition(), label: "Combined", vertexCount: 3, faceCount: 1, method: "merge", settings: {}, backend: { id: "native" } });
    const record = compactDerivedSurfaceMesh(payload, "Combined");
    const handoff = new SurfaceMeshKernelHandoff([first, second]);
    const published = handoff.publish({ record, sources: [first, second], geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } });
    expect(published.relations[0]?.sources).toHaveLength(2);
    const adapter = new SurfaceDocumentAdapter(second);
    adapter.commitSource({ ...second.source, definition: { ...second.source.definition, expressions: { z: "x-y" } } });
    handoff.setSource(adapter.document());
    expect(handoff.resolve(record.identity.meshId)).toMatchObject({ ok: false, reason: "stale-source" });
  });

  it("invalidates an old operation when sampling settings change without a structural edit", () => {
    const surface = surfaceDocumentFromLegacyDefinition(definition());
    const payload = createDerivedSurfaceMeshPayload({ definition: definition(), label: "Grid", vertexCount: 3, faceCount: 1, method: "grid", settings: { resolution: 16 }, backend: { id: "native" } });
    const record = compactDerivedSurfaceMesh(payload, "Grid");
    const handoff = new SurfaceMeshKernelHandoff([surface]);
    handoff.publish({ record, sources: [surface], geometry: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } });
    const adapter = new SurfaceDocumentAdapter(surface);
    adapter.setAnalysisSettings({ uSegments: 64, vSegments: 64 });
    expect(adapter.document().identity).toEqual(surface.identity);
    handoff.setSource(adapter.document());
    expect(handoff.resolve(record.identity.meshId)).toMatchObject({ ok: false, reason: "stale-source" });
    expect(handoff.record(record.identity.meshId)?.relations[0]?.status).toBe("stale");
  });
});
