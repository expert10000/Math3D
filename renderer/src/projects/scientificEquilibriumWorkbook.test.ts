import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createGraph2DFieldReference, createMath3DProject,
  createMixedWorkspaceDocument, createVectorField3DDocument,
  createVectorField3DEquilibriumResult, parseMath3DProject,
  reviseVectorField3DDocument, searchVectorField3DEquilibria,
  serializeMath3DProject, sha256Checksum, vectorField3DExpression,
  vectorField3DRegionResultRelation, verifyVectorField3DEquilibriumResult,
  scientificTileLayout, scientificTileSampleLocation,
  searchVectorField3DVerifiedTileEquilibria, VectorField3DEquilibriumNeedsTiles,
  VectorField3DVerifiedTileCache, type Graph2DScientificVolume,
  type VectorField3DSource, type VectorField3DEquilibriumContinuation,
  type VectorField3DEquilibriumSearch, type VectorField3DVerifiedTile } from "@math3d/core";
import { createScientificEquilibriumWorkbook, scientificEquilibriumReportMarkdown,
  verifyScientificEquilibriumReport } from "./scientificEquilibriumWorkbook";
import { reverifyScientificEquilibriumResult, type ScientificEquilibriumBridge,
  type ScientificEquilibriumReplay } from "../vectorfield3d/reverifyScientificEquilibriumResult";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";
import { createScientificSolverAuditExport } from "./scientificSolverAuditExport";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectResultsBrowser } from "../components/ProjectResultsBrowser";

const authored = () => createVectorField3DDocument({
  axes: (["x", "y", "z"] as const).map(role => ({ role, label: role,
    unit: "m", min: -1, max: 1 })) as VectorField3DSource["axes"],
  timeUnit: "s", field: { kind: "expressions", components: ["x", "y", "z"].map(
    value => vectorField3DExpression(value, "m/s")) as Extract<
      VectorField3DSource["field"], { kind: "expressions" }>["components"] },
  seeds: [{ id: "origin", position: [0, 0, 0] }],
  display: { density: [3, 3, 3], maxGlyphs: 27,
    magnitudeScale: 1, colorBy: "speed" },
  solver: { method: "rk45", absoluteTolerance: 1e-6,
    relativeTolerance: 1e-6, maxSteps: 100, maxTime: 1,
    maxArcLength: 10 } }, { stableKey: "equilibrium-report" });

const measured = () => {
  const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/",
    import.meta.url));
  const manifestJson = readFileSync(`${directory}manifest.json`, "utf8");
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  const names = ["east", "north", "up"] as const;
  const references = names.map(name => createGraph2DFieldReference(manifestJson,
    fingerprint, { kind: "preset", value: "vortexVolume" }, "field", name)) as
    Extract<VectorField3DSource["field"], { kind: "scientific-bundle" }>["references"];
  const volumes = names.map((component, index) => {
    const bytes = readFileSync(`${directory}${component}.f64`);
    return { fingerprint, datasetId: "field", component,
      sourceShape: [21, 21, 17], sampleShape: [21, 21, 17],
      resourceSha256: references[index].resourceSha256,
      sampleSha256: sha256Checksum(bytes).slice(7),
      values: Array.from({ length: bytes.length / 8 },
        (_, at) => bytes.readDoubleLE(at * 8)) } as Graph2DScientificVolume;
  }) as [Graph2DScientificVolume, Graph2DScientificVolume, Graph2DScientificVolume];
  const document = createVectorField3DDocument({ axes: [
    { role: "x", label: "x", unit: "m", min: -4, max: 4 },
    { role: "y", label: "y", unit: "m", min: -4, max: 4 },
    { role: "z", label: "z", unit: "m", min: -3, max: 3 }],
  timeUnit: "s", field: { kind: "scientific-bundle", references,
    componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
  display: { density: [3, 3, 3], maxGlyphs: 27,
    magnitudeScale: 1, colorBy: "speed" },
  solver: { method: "rk45", absoluteTolerance: 1e-6,
    relativeTolerance: 1e-6, maxSteps: 100, maxTime: 1,
    maxArcLength: 10 } }, { stableKey: "measured-equilibrium-report" });
  return { document, manifestJson, fingerprint, volumes };
};

const tileFixture = () => {
  const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
  const shape = [3, 3, 3] as const, tileShape = [2, 2, 2] as const;
  const names = ["east", "north", "up"] as const;
  const layout = scientificTileLayout(shape, tileShape);
  const parts = names.map((name, component) => {
    const tiles = layout.map(tile => {
      const bytes = Buffer.alloc(tile.bytes); let at = 0;
      for (let x = tile.start[0]; x < tile.start[0] + tile.size[0]; x++)
        for (let y = tile.start[1]; y < tile.start[1] + tile.size[1]; y++)
          for (let z = tile.start[2]; z < tile.start[2] + tile.size[2]; z++)
            bytes.writeDoubleLE([x, y, z][component]! - 1, at++ * 8);
      return bytes;
    });
    return { resource: { id: name, path: `${name}.f64`, format: "f64le",
      count: 27, bytes: 216, sha256: digest(Buffer.concat(tiles)),
      layout: "tiled-3d", tileShape, tileSha256: tiles.map(digest) }, tiles };
  });
  const manifestJson = JSON.stringify({ schema: "scientific-scene/v3",
    sceneId: "equilibrium-tiles", title: "Linear tiled field",
    source: { producer: "test", sourceId: "linear", sourceSchema: "analytic/v1",
      sha256: "a".repeat(64) }, resources: parts.map(item => item.resource),
    coordinates: [{ id: "space", kind: "cartesian", axes: ["x", "y", "z"].map(name =>
      ({ name, unit: "m" })), origin: [-1, -1, -1], spacing: [1, 1, 1],
      periodic: [false, false, false] }],
    datasets: [{ id: "field", semanticType: "vector-field",
      coordinateSystem: "space", shape, order: "last-axis-fastest",
      quantity: { name: "Velocity", unit: "m/s" },
      components: names.map(name => ({ name, resource: name })) }], views: [] });
  const fingerprint = digest(manifestJson);
  const references = names.map(name => createGraph2DFieldReference(manifestJson,
    fingerprint, { kind: "preset", value: "equilibriumTiles" }, "field", name)) as
    Extract<VectorField3DSource["field"], { kind: "scientific-bundle" }>["references"];
  const document = createVectorField3DDocument({ axes: (["x", "y", "z"] as const).map(role =>
    ({ role, label: role, unit: "m", min: -1, max: 1 })) as VectorField3DSource["axes"],
    timeUnit: "s", field: { kind: "scientific-bundle", references,
      componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
    display: { density: [3, 3, 3], maxGlyphs: 27,
      magnitudeScale: 1, colorBy: "speed" },
    solver: { method: "rk45", absoluteTolerance: 1e-6,
      relativeTolerance: 1e-6, maxSteps: 100, maxTime: 1 } },
  { stableKey: "tiled-equilibrium-report" });
  const transfer = (indices: readonly [number, number, number]): VectorField3DVerifiedTile =>
    ({ fingerprint, datasetId: "field", indices,
      components: parts.map(({ resource, tiles }, component) => {
        const location = scientificTileSampleLocation(shape, tileShape, indices, layout);
        const tile = layout[location.tileIndex]!;
        return { name: names[component]!, resourceSha256: resource.sha256,
          tileIndex: tile.index, tileSha256: resource.tileSha256[tile.index]!,
          start: tile.start, size: tile.size, bytes: Uint8Array.from(tiles[tile.index]!) };
      }) });
  return { document, manifestJson, fingerprint, transfer };
};

async function tileSearch(scene: ReturnType<typeof tileFixture>,
  receive: (indices: readonly [number, number, number]) =>
    VectorField3DVerifiedTile | Promise<VectorField3DVerifiedTile>) {
  const cache = new VectorField3DVerifiedTileCache(scene.document,
    scene.manifestJson, scene.fingerprint);
  let continuation: VectorField3DEquilibriumContinuation | undefined;
  for (;;) {
    try {
      const result = searchVectorField3DVerifiedTileEquilibria(scene.document,
        cache, { seedResolution: 3 }, continuation);
      return { ...result, verifiedTiles: cache.provenance } as VectorField3DEquilibriumSearch;
    } catch (cause) {
      if (!(cause instanceof VectorField3DEquilibriumNeedsTiles)) throw cause;
      continuation = cause.continuation;
      for (const indices of cause.indicesBatch) cache.add(await receive(indices));
    }
  }
}

describe("SCI-19 equilibrium Workbook result", () => {
  it("saves numerical iterations and residuals, then rechecks a Project Workbook", async () => {
    const document = authored();
    const search = searchVectorField3DEquilibria(document);
    expect(search.candidates.length).toBeGreaterThan(0);
    expect(search.stopCounts.converged).toBe(search.candidates.length);
    const result = createVectorField3DEquilibriumResult(document, search);
    expect(result.summary.candidates).toMatchObject([{ iterations: expect.any(Number),
      residual: expect.any(Number), stopReason: "converged" }]);
    expect(JSON.stringify(result)).not.toContain('"sampled"');
    expect(JSON.stringify(result)).not.toContain('"values"');
    expect(verifyVectorField3DEquilibriumResult(result, document)).toBe(result);
    expect(scientificEquilibriumReportMarkdown(result)).toContain("Newton iterations");
    const altered = { ...result, summary: { ...result.summary, evaluations: search.evaluations + 1 } };
    expect(() => verifyVectorField3DEquilibriumResult(altered, document))
      .toThrow(/statistics differ/);
    const revised = reviseVectorField3DDocument(document, { ...document.source,
      solver: { ...document.source.solver, absoluteTolerance: 1e-5 } });
    expect(() => verifyVectorField3DEquilibriumResult(result, revised)).toThrow();
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], results: [result],
      relations: [vectorField3DRegionResultRelation(result)],
      constructions: [], artifacts: [], committedSelection: null });
    const project = parseMath3DProject(serializeMath3DProject(
      createMath3DProject(workspace, { stableKey: "equilibrium-workbook" })));
    const workbook = createScientificEquilibriumWorkbook(project, result,
      "equilibrium-book", "solver-report");
    const prepared = prepareProjectWorkbook(project, workbook, "equilibrium-report");
    const reopened = readProjectWorkbook(prepared.bytes, prepared.reference);
    const reference = reopened.stages[1]!.blocks[0]!.notebookReference!;
    expect((await verifyScientificEquilibriumReport(project, reference)).summary)
      .toEqual(result.summary);
    const audit = await createScientificSolverAuditExport(project, reference,
      "equilibrium", () => verifyScientificEquilibriumReport(project, reference));
    expect(audit.verification.status).toBe("verified");
    if (audit.verification.status !== "verified") throw new Error("Expected verified audit");
    expect(audit.sourceHashes.document).toBe(result.provenance.source.structuralHash);
    expect(audit.settings).toMatchObject({ seedResolution: search.seedResolution,
      maxEvaluations: search.maxEvaluations });
    expect(audit.units).toMatchObject({ coordinates: ["m", "m", "m"],
      vector: ["m/s", "m/s", "m/s"], residual: "m/s" });
    expect(audit.figures).toEqual(result.summary);
    expect(JSON.stringify(audit)).not.toContain('"sampled"');
    const show = (status: "changed" | "source-current") =>
      renderToStaticMarkup(React.createElement(ProjectResultsBrowser, {
        project, inspection: null, titles: new Map(), canOpen: () => false,
        onOpen: () => {}, regionResultStatuses: { [result.resultId]: status },
        onCreateScientificReport: () => {} }));
    expect(show("changed")).toContain("Saved analysis values are withheld");
    expect(show("changed")).not.toContain("attemptedSeeds</dt>");
    expect(show("source-current")).toContain("attemptedSeeds</dt>");
  });

  it("reopens measured samples and withholds changed values or solver figures", async () => {
    const scene = measured();
    const search = searchVectorField3DEquilibria(scene.document, scene);
    const result = createVectorField3DEquilibriumResult(scene.document, search);
    expect(result.provenance.operation.parameters.verifiedSource).toHaveProperty("kind", "volumes");
    expect(JSON.stringify(result)).not.toContain('"values"');
    const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true,
      source: { manifestJson: scene.manifestJson, fingerprint: scene.fingerprint } })),
      previewVectorVolume: vi.fn(async () => scene.volumes),
      closeGraphDataset: vi.fn(async () => true) } as unknown as ScientificEquilibriumBridge;
    const replay: ScientificEquilibriumReplay = async (document, source, options) =>
      searchVectorField3DEquilibria(document, { ...source, volumes: source.volumes! }, options);
    expect((await reverifyScientificEquilibriumResult(result, scene.document,
      bridge, replay)).resultId).toBe(result.resultId);
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
      checkpoint: scene.document, expected: scene.document.identity, replay: null }],
      activeDocumentIds: [scene.document.identity.id], results: [result],
      relations: [vectorField3DRegionResultRelation(result)],
      constructions: [], artifacts: [], committedSelection: null });
    const project = parseMath3DProject(serializeMath3DProject(
      createMath3DProject(workspace, { stableKey: "measured-equilibrium-workbook" })));
    const workbook = createScientificEquilibriumWorkbook(project, result,
      "measured-equilibrium-book", "solver-report");
    expect((await verifyScientificEquilibriumReport(project,
      workbook.stages[1]!.blocks[0]!.notebookReference!, bridge, replay)).summary)
      .toEqual(result.summary);
    const reference = workbook.stages[1]!.blocks[0]!.notebookReference!;
    const audit = await createScientificSolverAuditExport(project, reference,
      "equilibrium", () => verifyScientificEquilibriumReport(project,
        reference, bridge, replay));
    expect(audit.verification.status).toBe("verified");
    if (audit.verification.status !== "verified") throw new Error("Expected verified audit");
    expect(audit.sourceReferences).toHaveLength(3);
    expect(audit.sourceHashes.measured).toEqual(
      result.provenance.operation.parameters.verifiedSource);
    const changed = { ...bridge, previewVectorVolume: vi.fn(async () =>
      [scene.volumes[0], { ...scene.volumes[1], values: scene.volumes[1].values.map(
        (value, index) => index === 0 ? value + 1 : value) }, scene.volumes[2]] as
      typeof scene.volumes) } as ScientificEquilibriumBridge;
    const withheld = await createScientificSolverAuditExport(project, reference,
      "equilibrium", () => verifyScientificEquilibriumReport(project,
        reference, changed, replay));
    expect(withheld.verification.status).toBe("withheld");
    expect(Object.keys(withheld).sort()).toEqual([
      "analysis", "kind", "projectId", "resultId", "schemaVersion", "verification"]);
    expect(JSON.stringify(withheld)).not.toContain('"candidates"');
    await expect(reverifyScientificEquilibriumResult(result, scene.document,
      changed, replay)).rejects.toMatchObject({ status: "changed" });
    expect(changed.closeGraphDataset).toHaveBeenCalledWith(scene.fingerprint);
    const missing = { ...bridge, openGraphDatasetReference: vi.fn(async () =>
      ({ ok: false, status: "missing", error: "Scene removed" })) } as
      ScientificEquilibriumBridge;
    await expect(reverifyScientificEquilibriumResult(result, scene.document,
      missing, replay)).rejects.toMatchObject({ status: "missing" });
    const tampered = { ...result, summary: { ...result.summary,
      attemptedSeeds: search.attemptedSeeds + 1 } };
    await expect(reverifyScientificEquilibriumResult(tampered, scene.document,
      bridge, replay)).rejects.toThrow(/statistics differ/);
  });

  it("rechecks v3 verified tile-set hashes before disclosing equilibria", async () => {
    const scene = tileFixture();
    const result = createVectorField3DEquilibriumResult(scene.document,
      await tileSearch(scene, scene.transfer));
    expect(result.provenance.operation.parameters.verifiedSource).toHaveProperty("kind", "tile-sets");
    expect(scientificEquilibriumReportMarkdown(result)).toContain("Tile-set SHA-256");
    expect(JSON.stringify(result)).not.toContain('"bytes"');
    const bridge = { openGraphDatasetReference: vi.fn(async () => ({ ok: true,
      source: { manifestJson: scene.manifestJson, fingerprint: scene.fingerprint } })),
      previewVectorTiles: vi.fn(async (request: { indicesBatch: [number, number, number][] }) =>
        request.indicesBatch.map(scene.transfer)),
      closeGraphDataset: vi.fn(async () => true) } as unknown as ScientificEquilibriumBridge;
    const replay: ScientificEquilibriumReplay = async (_document, _source, _options, candidate) =>
      tileSearch(scene, async indices => (await candidate.previewVectorTiles!({
        fingerprint: scene.fingerprint, datasetId: "field",
        components: ["east", "north", "up"],
        indicesBatch: [[...indices] as [number, number, number]] }))[0]!);
    expect((await reverifyScientificEquilibriumResult(result, scene.document,
      bridge, replay)).resultId).toBe(result.resultId);
    const changed = { ...bridge, previewVectorTiles: vi.fn(async (
      request: { indicesBatch: [number, number, number][] }) =>
      request.indicesBatch.map(indices => {
        const tile = scene.transfer(indices);
        const components = tile.components.map((part, index) => index === 0 ?
          { ...part, bytes: Uint8Array.from(part.bytes) } : part);
        components[0]!.bytes[0]! ^= 1;
        return { ...tile, components };
      })) } as ScientificEquilibriumBridge;
    await expect(reverifyScientificEquilibriumResult(result, scene.document,
      changed, replay)).rejects.toMatchObject({ status: "changed" });
    expect(changed.closeGraphDataset).toHaveBeenCalledWith(scene.fingerprint);
  });
});
