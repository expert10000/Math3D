import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createGraph2DFieldReference, createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, createVectorField3DTrajectoryResult,
  integrateVectorField3DScientificTrajectories,
  integrateVectorField3DVerifiedTileTrajectories, parseMath3DProject,
  reviseVectorField3DDocument, scientificTileLayout, scientificTileSampleLocation,
  serializeMath3DProject, sha256Checksum, vectorField3DRegionResultRelation,
  VectorField3DNeededTile, VectorField3DVerifiedTileCache,
  verifyVectorField3DTrajectoryResult, type Graph2DScientificVolume,
  type VectorField3DDocument, type VectorField3DSource,
  type VectorField3DTrajectoryArtifact, type VectorField3DVerifiedTile } from "@math3d/core";
import { createScientificTrajectoryWorkbook, scientificTrajectoryReportMarkdown,
  verifyScientificTrajectoryReport } from
  "./scientificTrajectoryWorkbook";
import { reverifyScientificTrajectoryResult, ScientificTrajectorySourceError,
  type ScientificTrajectoryBridge, type ScientificTrajectoryReplay } from
  "../vectorfield3d/reverifyScientificTrajectoryResult";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const names = ["east", "north", "up"] as const;
const axes = (bounds: readonly [number, number]) => (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: bounds[0], max: bounds[1] })) as
  VectorField3DSource["axes"];

function volumeFixture() {
  const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/",
    import.meta.url));
  const manifestJson = readFileSync(`${directory}manifest.json`, "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  const references = names.map(name => createGraph2DFieldReference(manifestJson,
    fingerprint, { kind: "preset", value: "vortexVolume" }, "field", name)) as
    Extract<VectorField3DSource["field"], { kind: "scientific-bundle" }>["references"];
  const volumes = names.map((component, index) => {
    const bytes = readFileSync(`${directory}${component}.f64`);
    return { fingerprint, datasetId: "field", component,
      sourceShape: [21, 21, 17], sampleShape: [21, 21, 17],
      resourceSha256: references[index].resourceSha256,
      sampleSha256: hash(bytes), values: Array.from({ length: bytes.length / 8 },
        (_, at) => bytes.readDoubleLE(at * 8)) } as Graph2DScientificVolume;
  }) as [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];
  const document = createVectorField3DDocument({ axes: [
    { role: "x", label: "x", unit: "m", min: -4, max: 4 },
    { role: "y", label: "y", unit: "m", min: -4, max: 4 },
    { role: "z", label: "z", unit: "m", min: -3, max: 3 }],
  timeUnit: "s", field: { kind: "scientific-bundle", references,
    componentUnits: ["m/s", "m/s", "m/s"] },
  seeds: [{ id: "off-axis", position: [2, 0, 0] }],
  display: { density: [5, 5, 5], maxGlyphs: 125,
    magnitudeScale: 1, colorBy: "speed" },
  solver: { method: "rk45", absoluteTolerance: 1e-6,
    relativeTolerance: 1e-6, maxSteps: 100, maxTime: 1, maxArcLength: 10 } },
  { stableKey: "measured-trajectory" });
  return { document, manifestJson, fingerprint, volumes };
}

function tileFixture() {
  const shape = [3, 3, 3] as const, tileShape = [2, 2, 2] as const;
  const layout = scientificTileLayout(shape, tileShape);
  const payloads = names.map((name, component) => {
    const tiles = layout.map(tile => {
      const bytes = Buffer.alloc(tile.bytes);
      for (let at = 0; at < bytes.length / 8; at++)
        bytes.writeDoubleLE(component === 0 ? 1 : 0, at * 8);
      return bytes;
    });
    return { resource: { id: name, path: `${name}.f64`, format: "f64le",
      count: 27, bytes: 27 * 8, sha256: hash(Buffer.concat(tiles)),
      layout: "tiled-3d", tileShape, tileSha256: tiles.map(hash) }, tiles };
  });
  const manifestJson = JSON.stringify({ schema: "scientific-scene/v3",
    sceneId: "trajectory-tiles", title: "Constant measured field",
    source: { producer: "test", sourceId: "constant", sourceSchema: "analytic/v1",
      sha256: "a".repeat(64) }, resources: payloads.map(part => part.resource),
    coordinates: [{ id: "space", kind: "cartesian", axes: ["x", "y", "z"].map(name =>
      ({ name, unit: "m" })), origin: [-1, -1, -1], spacing: [1, 1, 1],
      periodic: [false, false, false] }],
    datasets: [{ id: "field", semanticType: "vector-field",
      coordinateSystem: "space", shape, order: "last-axis-fastest",
      quantity: { name: "Velocity", unit: "m/s" },
      components: names.map(name => ({ name, resource: name })) }], views: [] });
  const fingerprint = hash(manifestJson);
  const references = names.map(name => createGraph2DFieldReference(manifestJson,
    fingerprint, { kind: "preset", value: "trajectoryTiles" }, "field", name)) as
    Extract<VectorField3DSource["field"], { kind: "scientific-bundle" }>["references"];
  const document = createVectorField3DDocument({ axes: axes([-1, 1]), timeUnit: "s",
    field: { kind: "scientific-bundle", references,
      componentUnits: ["m/s", "m/s", "m/s"] },
    seeds: [{ id: "center", position: [0, 0, 0] }],
    display: { density: [3, 3, 3], maxGlyphs: 27,
      magnitudeScale: 1, colorBy: "speed" },
    solver: { method: "rk45", absoluteTolerance: 1e-6,
      relativeTolerance: 1e-6, maxSteps: 100, maxTime: .25, maxArcLength: 1 } },
  { stableKey: "tiled-trajectory" });
  const transfer = (indices: readonly [number, number, number]): VectorField3DVerifiedTile =>
    ({ fingerprint, datasetId: "field", indices,
      components: payloads.map(({ resource, tiles }, component) => {
        const location = scientificTileSampleLocation(shape, tileShape, indices, layout);
        const tile = layout[location.tileIndex]!;
        return { name: names[component]!, resourceSha256: resource.sha256,
          tileIndex: tile.index, tileSha256: resource.tileSha256[tile.index]!,
          start: tile.start, size: tile.size, bytes: Uint8Array.from(tiles[tile.index]!) };
      }) });
  return { document, manifestJson, fingerprint, transfer };
}

async function replayTiles(document: VectorField3DDocument,
  manifestJson: string, fingerprint: string,
  transfer: (indices: readonly [number, number, number]) =>
    VectorField3DVerifiedTile | Promise<VectorField3DVerifiedTile>,
  direction: "forward" | "backward" = "forward"): Promise<VectorField3DTrajectoryArtifact> {
  const cache = new VectorField3DVerifiedTileCache(document, manifestJson, fingerprint);
  for (;;) {
    try {
      const result = integrateVectorField3DVerifiedTileTrajectories(document, cache,
        { direction });
      return { ...result, sourceHash: cache.sourceHash,
        verifiedTiles: cache.provenance };
    } catch (cause) {
      if (!(cause instanceof VectorField3DNeededTile)) throw cause;
      cache.add(await transfer(cause.indices));
    }
  }
}

describe("SCI-19 measured trajectory Workbook verification", () => {
  it("retains v2 chunk verification with a compact volume digest", async () => {
    const source = volumeFixture();
    const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/",
      import.meta.url));
    const manifest = JSON.parse(source.manifestJson);
    manifest.schema = "scientific-scene/v2";
    for (const resource of manifest.resources) {
      const bytes = readFileSync(`${directory}${resource.path}`);
      resource.chunkBytes = 4096;
      resource.chunkSha256 = Array.from({ length: Math.ceil(bytes.length / 4096) },
        (_, index) => hash(bytes.subarray(index * 4096, (index + 1) * 4096)));
    }
    const manifestJson = JSON.stringify(manifest), fingerprint = hash(manifestJson);
    const references = names.map(name => createGraph2DFieldReference(manifestJson,
      fingerprint, { kind: "preset", value: "vortexVolume" }, "field", name)) as
      Extract<VectorField3DSource["field"], { kind: "scientific-bundle" }>["references"];
    const document = reviseVectorField3DDocument(source.document, { ...source.document.source,
      field: { kind: "scientific-bundle", references,
        componentUnits: ["m/s", "m/s", "m/s"] } });
    const volumes = source.volumes.map((volume, index) => ({ ...volume,
      fingerprint, verifiedChunks: manifest.resources[index].chunkSha256.map(
        (_: string, at: number) => at) })) as typeof source.volumes;
    const artifact = integrateVectorField3DScientificTrajectories(document,
      manifestJson, fingerprint, volumes);
    const saved = createVectorField3DTrajectoryResult(document, artifact);
    expect(JSON.stringify(saved.provenance.operation.parameters.verifiedSource))
      .toContain(artifact.verifiedVolumes![0]!.verifiedChunkSetSha256);
    expect(verifyVectorField3DTrajectoryResult(saved, document,
      integrateVectorField3DScientificTrajectories(document, manifestJson,
        fingerprint, volumes))).toBe(saved);
  });

  it("reopens a verified volume, reruns diagnostics, and withholds changed samples", async () => {
    const scene = volumeFixture();
    const artifact = integrateVectorField3DScientificTrajectories(scene.document,
      scene.manifestJson, scene.fingerprint, scene.volumes);
    const saved = createVectorField3DTrajectoryResult(scene.document, artifact);
    expect(saved.provenance.operation.parameters.verifiedSource).toHaveProperty("kind", "volumes");
    expect(JSON.stringify(saved.provenance.operation.parameters.verifiedSource))
      .toContain(scene.volumes[0].sampleSha256);
    expect(JSON.stringify(saved)).not.toContain('"values"');
    expect(JSON.stringify(saved)).not.toContain('"points"');
    expect(() => verifyVectorField3DTrajectoryResult(saved, scene.document)).toThrow(/rerun/);
    const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true,
      source: { manifestJson: scene.manifestJson, fingerprint: scene.fingerprint } })),
      previewVectorVolume: vi.fn(async () => scene.volumes),
      closeGraphDataset: vi.fn(async () => true) } as unknown as ScientificTrajectoryBridge;
    const replay: ScientificTrajectoryReplay = async (document, direction, source) =>
      integrateVectorField3DScientificTrajectories(document, source.manifestJson,
        source.fingerprint, source.volumes!, { direction });
    expect((await reverifyScientificTrajectoryResult(saved, scene.document,
      bridge, replay)).summary).toEqual(saved.summary);
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: scene.document, expected: scene.document.identity, replay: null }],
      activeDocumentIds: [scene.document.identity.id], results: [saved],
      relations: [vectorField3DRegionResultRelation(saved)],
      constructions: [], artifacts: [], committedSelection: null });
    const project = parseMath3DProject(serializeMath3DProject(
      createMath3DProject(workspace, { stableKey: "measured-report" })));
    const workbook = createScientificTrajectoryWorkbook(project, saved,
      "measured-workbook", "report");
    const reference = workbook.stages[1]!.blocks[0]!.notebookReference!;
    expect((await verifyScientificTrajectoryReport(project, reference,
      bridge, replay)).resultId).toBe(saved.resultId);
    const wrongFigure = { ...saved, summary: { ...saved.summary,
      totalEvaluations: artifact.totalEvaluations + 1 } };
    await expect(reverifyScientificTrajectoryResult(wrongFigure, scene.document,
      bridge, replay)).rejects.toThrow(/statistics differ/);
    const changed = { ...bridge, previewVectorVolume: vi.fn(async () =>
      [scene.volumes[0], { ...scene.volumes[1], values: scene.volumes[1].values.map(
        (value, index) => index === 0 ? value + 1 : value) }, scene.volumes[2]] as
      typeof scene.volumes) } as ScientificTrajectoryBridge;
    await expect(reverifyScientificTrajectoryResult(saved, scene.document,
      changed, replay)).rejects.toMatchObject({ status: "changed" });
    expect(changed.closeGraphDataset).toHaveBeenCalledWith(scene.fingerprint);
    const missing = { ...bridge, openGraphDatasetReference: vi.fn(async () =>
      ({ ok: false, status: "missing", error: "Scene removed" })) } as
      ScientificTrajectoryBridge;
    await expect(reverifyScientificTrajectoryResult(saved, scene.document,
      missing, replay)).rejects.toBeInstanceOf(ScientificTrajectorySourceError);
    const revised = reviseVectorField3DDocument(scene.document,
      { ...scene.document.source, solver: { ...scene.document.source.solver, maxTime: 2 } });
    await expect(reverifyScientificTrajectoryResult(saved, revised,
      bridge, replay)).rejects.toThrow();
  });

  it("pins tiled-source set hashes and rejects a changed tile before disclosing figures", async () => {
    const scene = tileFixture();
    const artifact = await replayTiles(scene.document, scene.manifestJson,
      scene.fingerprint, scene.transfer);
    const saved = createVectorField3DTrajectoryResult(scene.document, artifact);
    expect(saved.provenance.operation.parameters.verifiedSource).toHaveProperty("kind", "tile-sets");
    expect(JSON.stringify(saved.provenance.operation.parameters.verifiedSource))
      .toContain(artifact.verifiedTiles![0]!.tileSetSha256);
    expect(scientificTrajectoryReportMarkdown(saved)).toContain("Tile-set SHA-256");
    expect(JSON.stringify(saved)).not.toContain('"points"');
    expect(JSON.stringify(saved)).not.toContain('"tileSha256"');
    const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true,
      source: { manifestJson: scene.manifestJson, fingerprint: scene.fingerprint } })),
      previewVectorTile: vi.fn(async (request: { indices: [number, number, number] }) =>
        scene.transfer(request.indices)), closeGraphDataset: vi.fn(async () => true) } as
      unknown as ScientificTrajectoryBridge;
    const replay: ScientificTrajectoryReplay = async (document, direction, source, candidate) =>
      replayTiles(document, source.manifestJson, source.fingerprint,
        indices => candidate.previewVectorTile!({ fingerprint: source.fingerprint,
          datasetId: "field", components: [...names], indices: [...indices] as
            [number, number, number] }), direction);
    expect((await reverifyScientificTrajectoryResult(saved, scene.document,
      bridge, replay)).resultId).toBe(saved.resultId);
    const proof = saved.provenance.operation.parameters.verifiedSource as unknown as
      { kind: string; sourceHash: string; components: Array<Record<string, unknown>> };
    const tampered = { ...saved, provenance: { ...saved.provenance,
      operation: { ...saved.provenance.operation,
        parameters: { ...saved.provenance.operation.parameters,
          verifiedSource: { ...proof, components: [
            { ...proof.components[0], tileSetSha256: "0".repeat(64) },
            ...proof.components.slice(1)] } } } } };
    await expect(reverifyScientificTrajectoryResult(tampered, scene.document,
      bridge, replay)).rejects.toThrow(/statistics differ/);
    const changed = { ...bridge, previewVectorTile: vi.fn(async (
      request: { indices: [number, number, number] }) => {
      const tile = scene.transfer(request.indices);
      const components = tile.components.map((part, index) => index === 0 ?
        { ...part, bytes: Uint8Array.from(part.bytes) } : part);
      components[0]!.bytes[0]! ^= 1;
      return { ...tile, components };
    }) } as ScientificTrajectoryBridge;
    await expect(reverifyScientificTrajectoryResult(saved, scene.document,
      changed, replay)).rejects.toMatchObject({ status: "changed" });
    expect(changed.closeGraphDataset).toHaveBeenCalledWith(scene.fingerprint);
  });
});
