import { describe, expect, it } from "vitest";
import {
  createComplexAnalysisDocument, createCurveDocument, createDocumentRelation, createGeometryDocument,
  createMeshDocument, createMixedWorkspaceDocument, createSurfaceDocument, createVolumeDocument,
  inspectMixedWorkspaceAvailability, parseComplexExpressionAst, parseMixedWorkspaceDocument,
  replayMixedWorkspaceDocument, replaceVolumeDocumentSource, serializeMixedWorkspaceDocument,
  structuralHash, viewerSourceFromDocument, type KernelWorkspaceModule, type MixedWorkspaceEntry,
} from "@math3d/core";
import { TopologyDiagramCommandAdapter } from "../topology/topologyCommandAdapter";
import { TOPOLOGY_PRESET_BY_ID } from "../topology/presets";

const geometry = createGeometryDocument({ stableKey: "mixed-geometry", source: {
  geometry: null, objects: [], surfaces: [], constructions: [], relationships: [], parameters: {}, extensions: {},
} });
const mesh = createMeshDocument({ stableKey: "mixed-mesh", label: "Mesh", source: {
  objectId: "mesh:1", resource: { id: "mesh-resource:1", checksum: structuralHash("mesh"), vertexCount: 0, indexCount: 0,
    hasNormals: false, hasUvs: false, encoding: "math3d.mesh-buffers.v1" }, origin: {},
} });
const surface = createSurfaceDocument({ stableKey: "mixed-surface", source: {
  representation: "mesh-backed", domain: { kind: "mesh" }, units: { length: "m" }, orientation: {},
  definition: { familyId: "mixed-surface", meshId: "mesh-resource:1" }, parameters: {}, branchPolicy: null,
} });
const curve = createCurveDocument({ stableKey: "mixed-curve", source: {
  representation: "parametric", dimension: 3, domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false },
  units: { position: "m", parameter: "unitless", angle: "rad" }, orientation: {}, derivatives: {},
  definition: { familyId: "line", expressions: { x: "t", y: "0", z: "0" } }, dependencies: [],
} });
const volume = createVolumeDocument({ stableKey: "mixed-volume", source: {
  representation: "analytic-scalar-field", recipe: { kind: "analytic-preset", presetId: "sphere" },
  spatial: { dimensions: [8, 8, 8], origin: [0, 0, 0], spacing: [1, 1, 1], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    centering: "point", coordinateSystem: "world", positionUnits: "m", valueUnits: "unitless" }, dependencies: [], payload: null,
} });
const topology = new TopologyDiagramCommandAdapter(TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram()).document();
const ast = parseComplexExpressionAst("z", ["z"]).ast!;
const complex = createComplexAnalysisDocument({
  function: { sourceText: "z", astVersion: 1, normalizedAst: ast, allowedVariables: ["z"] },
  parameters: [], assumptions: [], domain: { re: { min: -2, max: 2 }, im: { min: -2, max: 2 }, exclusions: [] },
  sampling: { strategy: "uniform-grid", columns: 8, rows: 8, maximumSamples: 64, tolerance: 1e-8 }, contours: [],
  branchPolicy: { profile: "none", cut: { kind: "principal", angleRadians: Math.PI, points: [] }, includeInfinity: false, sheetCount: 1, activeSheet: 0 },
  covering: null, mobius: null,
}, { stableKey: "mixed-complex" });
const entries: MixedWorkspaceEntry[] = ([
  ["geometry", geometry], ["mesh", mesh], ["surface", surface], ["curve", curve],
  ["volume", volume], ["topology", topology], ["complex", complex],
] as const).map(([module, checkpoint]) => ({ module: module as KernelWorkspaceModule, checkpoint, expected: checkpoint.identity, replay: null }));

describe("GK17 mixed workspace", () => {
  it("saves, reopens and replays all seven canonical module documents with exact identities", () => {
    const relation = createDocumentRelation({ kind: "derived-from", sources: [viewerSourceFromDocument(volume)], sourceOrder: "ordered",
      target: { type: "document", generation: viewerSourceFromDocument(surface) }, operation: "volume.extract.isosurface", parameters: { isoValue: 0 } });
    const workspace = createMixedWorkspaceDocument({ entries, activeDocumentIds: entries.map((entry) => entry.expected.id),
      results: [], artifacts: [{ handle: { artifactId: "mesh-artifact:1", kind: "mesh", role: "boundary" }, contentHash: structuralHash("mesh"), byteLength: 1024 }],
      relations: [relation], committedSelection: { state: "committed", source: viewerSourceFromDocument(mesh), entityIds: ["vertex:4"] },
      constructions: [{ kind: "scratch", source: { blocks: [{ kind: "sphere" }] }, normalizedSceneScript: { commands: [{ type: "scene.add" }] } }],
    });
    const serialized = serializeMixedWorkspaceDocument(workspace);
    expect(serialized).not.toContain("positions");
    const reopened = parseMixedWorkspaceDocument(serialized);
    expect(reopened.entries.map((entry) => entry.module)).toEqual(["geometry", "mesh", "surface", "curve", "volume", "topology", "complex"]);
    expect(replayMixedWorkspaceDocument(reopened).size).toBe(7);
    expect(reopened.relations[0].relationId).toBe(relation.relationId);
    expect(inspectMixedWorkspaceAvailability(reopened, () => false)).toMatchObject({ missingArtifactIds: ["mesh-artifact:1"] });
  });

  it("requires a replay adapter and rejects divergent reconstructed source generations", () => {
    const changed = replaceVolumeDocumentSource(volume, { ...volume.source, recipe: { kind: "analytic-preset", presetId: "torus" } });
    const volumeEntry: MixedWorkspaceEntry = { module: "volume", checkpoint: volume, expected: changed.identity,
      replay: { format: "math3d.volume.replace-source.v1", payload: changed.source as never } };
    const workspace = createMixedWorkspaceDocument({ entries: [volumeEntry], activeDocumentIds: [volume.identity.id],
      results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    expect(() => replayMixedWorkspaceDocument(workspace)).toThrow("No volume replay adapter");
    expect(() => replayMixedWorkspaceDocument(workspace, { volume: () => volume })).toThrow("Replay diverged");
    expect(replayMixedWorkspaceDocument(workspace, { volume: (entry) => replaceVolumeDocumentSource(entry.checkpoint as typeof volume,
      entry.replay!.payload as typeof volume.source) }).get(volume.identity.id)?.identity).toEqual(changed.identity);
  });

  it("rejects hover, unknown fields, embedded buffers, missing artifact references and tampering", () => {
    const base = { entries, activeDocumentIds: [volume.identity.id], results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] };
    expect(() => createMixedWorkspaceDocument({ ...base, committedSelection: { state: "hover", source: viewerSourceFromDocument(volume), entityIds: [] } as never })).toThrow();
    expect(() => createMixedWorkspaceDocument({ ...base, committedSelection: { state: "committed", source: viewerSourceFromDocument(replaceVolumeDocumentSource(volume, { ...volume.source, recipe: { kind: "analytic-preset", presetId: "torus" } })), entityIds: ["voxel:1"] } })).toThrow();
    const workspace = createMixedWorkspaceDocument(base);
    expect(() => parseMixedWorkspaceDocument(JSON.stringify({ ...workspace, extra: true }))).toThrow();
    expect(() => parseMixedWorkspaceDocument(JSON.stringify({ ...workspace, entries: [{ ...entries[0], expected: { ...entries[0].expected, revision: 99 } }] }))).toThrow();
    expect(() => parseMixedWorkspaceDocument(JSON.stringify({ ...workspace, artifacts: [{ handle: { artifactId: "bad", kind: "mesh", role: "source" }, contentHash: null, byteLength: 1, bytes: [1, 2, 3] }] }))).toThrow();
  });
});
