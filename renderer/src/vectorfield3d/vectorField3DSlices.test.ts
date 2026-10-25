import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { previewVerifiedVectorField3D } from "./previewVerifiedVectorField3D";
import { createGraph2DFieldReference, createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, defaultVectorField3DWorkspace, normalizeVectorField3DDocument,
  parseMath3DProject, parseVectorField3DDocument, reviseVectorField3DWorkspace,
  sampleVectorField3DSlice, sampleVectorField3DProbe, serializeMath3DProject, serializeVectorField3DDocument,
  sampleVectorField3DSparseSlice, sampleVectorField3DSparseProbe,
  scientificTileLayout, scientificTileSampleLocation,
  integrateVectorField3DScientificTrajectories, reviseVectorField3DDocument,
  analyzeVectorField3DDifferential, sampleVectorField3DDerivedSlice,
  sampleVectorField3DScientificArrows,
  searchVectorField3DEquilibria,
  sha256Checksum, vectorField3DSliceCoordinates, type Graph2DFieldReference, type VectorField3DSource,
  type VectorField3DVolumes } from "@math3d/core";

const directory = fileURLToPath(new URL("../../../tests/fixtures/scientific-scene/vortex-volume.sscene/", import.meta.url));
const manifestJson = readFileSync(`${directory}manifest.json`, "utf8");
const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
const names = ["east", "north", "up"] as const;
const references = names.map(name => createGraph2DFieldReference(manifestJson, fingerprint,
  { kind: "preset", value: "vortexVolume" }, "field", name)) as
  [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
const source: VectorField3DSource = {
  axes: [{ role: "x", label: "x", unit: "m", min: -4, max: 4 },
    { role: "y", label: "y", unit: "m", min: -4, max: 4 },
    { role: "z", label: "z", unit: "m", min: -3, max: 3 }],
  timeUnit: "s", field: { kind: "scientific-bundle", references,
    componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 10 },
};
const document = createVectorField3DDocument(source, { stableKey: "orthogonal-slices" });
const shape = [21, 21, 17] as const;
const volumes = names.map((component, index) => {
  const bytes = readFileSync(`${directory}${component}.f64`);
  return { fingerprint, datasetId: "field", component, sourceShape: shape, sampleShape: shape,
    resourceSha256: source.field.kind === "scientific-bundle" ? source.field.references[index].resourceSha256 : "",
    sampleSha256: sha256Checksum(bytes).slice(7),
    values: Array.from({ length: shape[0] * shape[1] * shape[2] }, (_, offset) => bytes.readDoubleLE(offset * 8)) };
}) as VectorField3DVolumes;
const coarseVolumes = volumes.map(volume => {
  const sampleShape = [8, 8, 8] as const;
  const positions = sampleShape.map((count, axis) => Array.from({ length: count }, (_, index) =>
    Math.round(index * (volume.sourceShape[axis]! - 1) / (count - 1))));
  const values: number[] = [];
  for (const x of positions[0]!) for (const y of positions[1]!) for (const z of positions[2]!)
    values.push(volume.values[(x * volume.sourceShape[1] + y) * volume.sourceShape[2] + z]!);
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return { ...volume, sampleLimit: 8, sampleShape,
    sampleSha256: sha256Checksum(bytes).slice(7), values };
}) as VectorField3DVolumes;

describe("SCI-02 saved field workspace and SCI-04 orthogonal slices", () => {
  it("verifies v3 tile coverage and preserves slice and probe values", () => {
    const manifest = JSON.parse(manifestJson), tileShape = [8, 8, 8] as const;
    const layout = scientificTileLayout(shape, tileShape);
    manifest.schema = "scientific-scene/v3";
    manifest.resources = manifest.resources.map((resource: { path: string }) => {
      const logical = readFileSync(`${directory}${resource.path}`), physical = Buffer.alloc(logical.length);
      const tileSha256: string[] = [];
      for (const tile of layout) {
        for (let x = 0; x < tile.size[0]; x++) for (let y = 0; y < tile.size[1]; y++) {
          const from = (((tile.start[0] + x) * shape[1] + tile.start[1] + y) * shape[2] + tile.start[2]) * 8;
          const to = tile.offsetBytes + ((x * tile.size[1] + y) * tile.size[2]) * 8;
          logical.copy(physical, to, from, from + tile.size[2] * 8);
        }
        tileSha256.push(sha256Checksum(physical.subarray(tile.offsetBytes,
          tile.offsetBytes + tile.bytes)).slice(7));
      }
      const overview = Buffer.alloc(8 * 8 * 8 * 8);
      let position = 0;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) {
        const i = Math.round(x * (shape[0] - 1) / 7), j = Math.round(y * (shape[1] - 1) / 7);
        const k = Math.round(z * (shape[2] - 1) / 7);
        logical.copy(overview, position * 8, ((i * shape[1] + j) * shape[2] + k) * 8,
          ((i * shape[1] + j) * shape[2] + k) * 8 + 8);
        position++;
      }
      return { ...resource, sha256: sha256Checksum(physical).slice(7), layout: "tiled-3d",
        tileShape, tileSha256, overview: { path: resource.path.replace(/\.f64$/, ".overview.f64"),
          shape: [8, 8, 8], bytes: overview.length, sha256: sha256Checksum(overview).slice(7) } };
    });
    const json = JSON.stringify(manifest), hash = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const refs = names.map(name => createGraph2DFieldReference(json, hash,
      { kind: "preset", value: "vortexVolume" }, "field", name)) as typeof references;
    const doc = createVectorField3DDocument({ ...source, field: { kind: "scientific-bundle",
      references: refs, componentUnits: ["m/s", "m/s", "m/s"] } }, { stableKey: "tiled-samples" });
    const make = (selection: { kind: "slice"; normalAxis: 0 | 1 | 2; fixedIndex: number } |
      { kind: "probe"; indices: [number, number, number] }) => {
      const points: number[][] = [];
      if (selection.kind === "probe") points.push(selection.indices);
      else {
        const plane = [0, 1, 2].filter(axis => axis !== selection.normalAxis);
        for (let a = 0; a < shape[plane[0]!]!; a++) for (let b = 0; b < shape[plane[1]!]!; b++) {
          const point = [0, 0, 0]; point[selection.normalAxis] = selection.fixedIndex;
          point[plane[0]!] = a; point[plane[1]!] = b; points.push(point);
        }
      }
      const verifiedTiles = [...new Set(points.map(point => scientificTileSampleLocation(shape,
        tileShape, point, layout).tileIndex))].sort((a, b) => a - b);
      return { fingerprint: hash, datasetId: "field", sourceShape: shape, selection,
        components: volumes.map((volume, index) => {
          const values = points.map(([x, y, z]) => volume.values[(x! * shape[1] + y!) * shape[2] + z!]!);
          const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
          values.forEach((value, at) => view.setFloat64(at * 8, value, true));
          return { name: names[index]!, resourceSha256: refs[index]!.resourceSha256,
            sampleSha256: sha256Checksum(bytes).slice(7), values, verifiedTiles };
        }) };
    };
    for (const axis of [0, 1, 2] as const) {
      const coordinate = source.axes[axis].min, samples = make({ kind: "slice", normalAxis: axis, fixedIndex: 0 });
      expect(sampleVectorField3DSparseSlice(doc, axis, coordinate,
        { manifestJson: json, fingerprint: hash, samples }).values)
        .toEqual(sampleVectorField3DSlice(document, axis, coordinate,
          { manifestJson, fingerprint, volumes }).values);
      expect(sampleVectorField3DSparseSlice(doc, axis, coordinate,
        { manifestJson: json, fingerprint: hash, samples }).verifiedSamples?.[0]?.verifiedTiles)
        .toBeGreaterThan(0);
      expect(() => sampleVectorField3DSparseSlice(doc, axis, coordinate,
        { manifestJson: json, fingerprint: hash, samples: { ...samples, components: [
          { ...samples.components[0]!, verifiedTiles: [] }, ...samples.components.slice(1)] } }))
        .toThrow(/tile coverage/);
    }
    const position = source.axes.map(axis => axis.min) as [number, number, number];
    const probe = make({ kind: "probe", indices: [0, 0, 0] });
    expect(sampleVectorField3DSparseProbe(doc, position,
      { manifestJson: json, fingerprint: hash, samples: probe }).vector)
      .toEqual(volumes.map(volume => volume.values[0]));
    const tiledVolumes = volumes.map((volume, index) => ({ ...volume, fingerprint: hash,
      resourceSha256: refs[index]!.resourceSha256,
      verifiedTiles: layout.map(tile => tile.index) })) as VectorField3DVolumes;
    expect(sampleVectorField3DScientificArrows(doc, json, hash, tiledVolumes)
      .verifiedSamples?.components[0]?.verifiedTiles).toEqual({ loaded: layout.length, total: layout.length });
    const overviewVolumes = volumes.map((volume, index) => {
      const values: number[] = [];
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) {
        const i = Math.round(x * (shape[0] - 1) / 7), j = Math.round(y * (shape[1] - 1) / 7);
        const k = Math.round(z * (shape[2] - 1) / 7);
        values.push(volume.values[(i * shape[1] + j) * shape[2] + k]!);
      }
      return { ...volume, fingerprint: hash, resourceSha256: refs[index]!.resourceSha256,
        sampleLimit: 8, sampleShape: [8, 8, 8] as const, values,
        sampleSha256: manifest.resources[index].overview.sha256,
        verifiedOverview: manifest.resources[index].overview.sha256 };
    }) as VectorField3DVolumes;
    expect(sampleVectorField3DScientificArrows(doc, json, hash, overviewVolumes)
      .verifiedSamples?.components[0]?.verifiedOverview).toBe(manifest.resources[0].overview.sha256);
    expect(() => sampleVectorField3DScientificArrows(doc, json, hash,
      [{ ...overviewVolumes[0], verifiedOverview: "0".repeat(64) },
        overviewVolumes[1], overviewVolumes[2]])).toThrow(/overview verification/);
  });
  it("checks v2 sparse slice and probe identity, digests and chunk coverage", () => {
    const manifest = JSON.parse(manifestJson);
    manifest.schema = "scientific-scene/v2";
    manifest.resources = manifest.resources.map((resource: { path: string }) => {
      const bytes = readFileSync(`${directory}${resource.path}`), chunkSha256: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 4096)
        chunkSha256.push(sha256Checksum(bytes.subarray(offset, offset + 4096)).slice(7));
      return { ...resource, chunkBytes: 4096, chunkSha256 };
    });
    const json = JSON.stringify(manifest), hash = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const refs = names.map(name => createGraph2DFieldReference(json, hash,
      { kind: "preset", value: "vortexVolume" }, "field", name)) as typeof references;
    const doc = createVectorField3DDocument({ ...source, field: {
      kind: "scientific-bundle", references: refs, componentUnits: ["m/s", "m/s", "m/s"],
    } }, { stableKey: "sparse-samples" });
    const make = (selection: { kind: "slice" | "stencil-slice"; normalAxis: 0 | 1 | 2; fixedIndex: number } |
      { kind: "probe"; indices: [number, number, number] }) => {
      const points: number[][] = [];
      if (selection.kind === "probe") points.push(selection.indices);
      else {
        const plane = [0, 1, 2].filter(axis => axis !== selection.normalAxis);
        const fixed = selection.fixedIndex, size = shape[selection.normalAxis];
        const layers = selection.kind === "slice" ? [fixed] : size === 1 ? [0] : size === 2 ? [0, 1] :
          fixed === 0 ? [0, 1, 2] : fixed === size - 1 ? [size - 3, size - 2, size - 1] :
            [fixed - 1, fixed, fixed + 1];
        for (const layer of layers) for (let a = 0; a < shape[plane[0]!]!; a++)
          for (let b = 0; b < shape[plane[1]!]!; b++) {
          const point = [0, 0, 0]; point[selection.normalAxis] = layer;
          point[plane[0]!] = a; point[plane[1]!] = b; points.push(point);
        }
      }
      return { fingerprint: hash, datasetId: "field", sourceShape: shape, selection,
        components: volumes.map((volume, index) => {
          const offsets = points.map(([x, y, z]) => ((x! * shape[1] + y!) * shape[2] + z!) * 8);
          const values = offsets.map(offset => volume.values[offset / 8]!);
          const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
          values.forEach((value, at) => view.setFloat64(at * 8, value, true));
          return { name: names[index]!, resourceSha256: refs[index]!.resourceSha256,
            sampleSha256: sha256Checksum(bytes).slice(7), values,
            verifiedChunks: [...new Set(offsets.map(offset => Math.floor(offset / 4096)))].sort((a, b) => a - b) };
        }) };
    };
    for (const axis of [0, 1, 2] as const) {
      const coordinate = source.axes[axis].min;
      const sparse = make({ kind: "slice", normalAxis: axis, fixedIndex: 0 });
      expect(sampleVectorField3DSparseSlice(doc, axis, coordinate,
        { manifestJson: json, fingerprint: hash, samples: sparse }).verifiedSamples?.[0])
        .toMatchObject({ name: "east", sampleSha256: sparse.components[0]!.sampleSha256,
          verifiedChunks: sparse.components[0]!.verifiedChunks.length,
          totalChunks: manifest.resources[0].chunkSha256.length });
      expect(sampleVectorField3DSparseSlice(doc, axis, coordinate,
        { manifestJson: json, fingerprint: hash, samples: sparse }).values)
        .toEqual(sampleVectorField3DSlice(doc, axis, coordinate, { manifestJson: json,
          fingerprint: hash, volumes: volumes.map(volume => ({ ...volume, fingerprint: hash,
            verifiedChunks: Array.from({ length: manifest.resources[0].chunkSha256.length }, (_, i) => i) })) as
              VectorField3DVolumes }).values);
      expect(() => sampleVectorField3DSparseSlice(doc, axis, coordinate,
        { manifestJson: json, fingerprint: hash, samples: { ...sparse, components: [
          { ...sparse.components[0]!, verifiedChunks: [] }, ...sparse.components.slice(1)] } }))
        .toThrow(/coverage/);
      const stencil = make({ kind: "stencil-slice", normalAxis: axis, fixedIndex: 0 });
      const allChunks = Array.from({ length: manifest.resources[0].chunkSha256.length }, (_, i) => i);
      const full = { manifestJson: json, fingerprint: hash, volumes: volumes.map(volume => ({ ...volume,
        fingerprint: hash, verifiedChunks: allChunks })) as VectorField3DVolumes };
      for (const channel of ["divergence", "curl-magnitude", "laplacian-speed"] as const)
        expect(sampleVectorField3DDerivedSlice(doc, axis, coordinate, channel,
          { manifestJson: json, fingerprint: hash, samples: stencil }).values)
          .toEqual(sampleVectorField3DDerivedSlice(doc, axis, coordinate, channel, full).values);
    }
    const middle = make({ kind: "stencil-slice", normalAxis: 0, fixedIndex: 10 });
    const allChunks = Array.from({ length: manifest.resources[0].chunkSha256.length }, (_, i) => i);
    expect(sampleVectorField3DDerivedSlice(doc, 0, 0, "divergence",
      { manifestJson: json, fingerprint: hash, samples: middle }).values)
      .toEqual(sampleVectorField3DDerivedSlice(doc, 0, 0, "divergence",
        { manifestJson: json, fingerprint: hash, volumes: volumes.map(volume => ({ ...volume,
          fingerprint: hash, verifiedChunks: allChunks })) as VectorField3DVolumes }).values);
    const probe = make({ kind: "probe", indices: [0, 0, 0] });
    const position = source.axes.map(axis => axis.min) as [number, number, number];
    expect(sampleVectorField3DSparseProbe(doc, position,
      { manifestJson: json, fingerprint: hash, samples: probe }).vector)
      .toEqual(volumes.map(volume => volume.values[0]));
    expect(sampleVectorField3DSparseProbe(doc, position,
      { manifestJson: json, fingerprint: hash, samples: probe }).verifiedSamples?.[0]?.verifiedChunks)
      .toBe(1);
    expect(() => sampleVectorField3DSparseProbe(doc, position,
      { manifestJson: json, fingerprint: hash, samples: { ...probe, components: [
        { ...probe.components[0]!, values: [probe.components[0]!.values[0]! + 1] },
        ...probe.components.slice(1)] } })).toThrow(/checksum/);
  });
  it("requires v2 chunk coverage for every transferred sample", () => {
    const manifest = JSON.parse(manifestJson);
    manifest.schema = "scientific-scene/v2";
    manifest.resources = manifest.resources.map((resource: { path: string }) => {
      const bytes = readFileSync(`${directory}${resource.path}`), chunkSha256: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 4096)
        chunkSha256.push(sha256Checksum(bytes.subarray(offset, offset + 4096)).slice(7));
      return { ...resource, chunkBytes: 4096, chunkSha256 };
    });
    const json = JSON.stringify(manifest);
    const v2Fingerprint = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const v2References = names.map(name => createGraph2DFieldReference(json, v2Fingerprint,
      { kind: "preset", value: "vortexVolume" }, "field", name)) as typeof references;
    const v2Document = createVectorField3DDocument({ ...source, field: {
      kind: "scientific-bundle", references: v2References,
      componentUnits: ["m/s", "m/s", "m/s"],
    } }, { stableKey: "chunked-coverage" });
    const selected = new Set<number>();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) {
      const i = Math.round(x * 20 / 7), j = Math.round(y * 20 / 7), k = Math.round(z * 16 / 7);
      selected.add(Math.floor(((i * 21 + j) * 17 + k) * 8 / 4096));
    }
    const verifiedChunks = [...selected].sort((a, b) => a - b);
    const v2Volumes = coarseVolumes.map(volume => ({ ...volume,
      fingerprint: v2Fingerprint, verifiedChunks })) as VectorField3DVolumes;
    const artifact = sampleVectorField3DScientificArrows(v2Document, json, v2Fingerprint, v2Volumes);
    expect(artifact.verifiedSamples?.components[0]?.verifiedChunks).toEqual({
      loaded: verifiedChunks.length, total: manifest.resources[0].chunkSha256.length,
    });
    expect(() => sampleVectorField3DScientificArrows(v2Document, json, v2Fingerprint,
      [{ ...v2Volumes[0], verifiedChunks: verifiedChunks.slice(1) },
        v2Volumes[1], v2Volumes[2]])).toThrow(/coverage/);
  });
  it("renders a verified small transfer before requesting the full bounded lattice", async () => {
    const calls: number[] = [], stages: string[] = [];
    const bridge = { previewVectorVolume: async (request: { sampleLimit?: number }) => {
      calls.push(request.sampleLimit ?? 32);
      return request.sampleLimit ? coarseVolumes : volumes;
    } } as unknown as Pick<NonNullable<Window["scientificScenes"]>, "previewVectorVolume">;
    const final = await previewVerifiedVectorField3D(document, manifestJson, fingerprint, bridge,
      initial => {
        stages.push("initial");
        expect(calls).toEqual([8]);
        expect(initial.artifact.verifiedSamples?.sampleShape).toEqual([8, 8, 8]);
        expect(initial.artifact.accepted).toBe(125);
      }, async () => { stages.push("paint"); });
    expect(calls).toEqual([8, 32]);
    expect(stages).toEqual(["initial", "paint"]);
    expect(final.artifact.verifiedSamples?.sampleShape).toEqual(shape);
    expect(final.artifact.verifiedSamples?.sourceHash)
      .toBe(sampleVectorField3DScientificArrows(document, manifestJson, fingerprint,
        coarseVolumes).verifiedSamples?.sourceHash);
    expect(final.artifact.verifiedSamples?.components[0]?.sampleSha256)
      .not.toBe(coarseVolumes[0].sampleSha256);
    expect(() => sampleVectorField3DScientificArrows(document, manifestJson, fingerprint,
      [{ ...coarseVolumes[0], sampleLimit: 7 }, coarseVolumes[1], coarseVolumes[2]]))
      .toThrow(/verified volume|component/i);
    const changed = [{ ...volumes[0], values: volumes[0].values.map((value, index) =>
      index === 0 ? value + 1 : value) }, volumes[1], volumes[2]] as VectorField3DVolumes;
    let initialShown = false;
    const changingBridge = { previewVectorVolume: async (request: { sampleLimit?: number }) =>
      request.sampleLimit ? coarseVolumes : changed } as unknown as
        Pick<NonNullable<Window["scientificScenes"]>, "previewVectorVolume">;
    await expect(previewVerifiedVectorField3D(document, manifestJson, fingerprint, changingBridge,
      () => { initialShown = true; })).rejects.toThrow(/checksum/);
    expect(initialShown).toBe(true);
  });
  it("binds arrow previews to the verified source and transferred component samples", () => {
    const artifact = sampleVectorField3DScientificArrows(document, manifestJson, fingerprint, volumes);
    expect(artifact.verifiedSamples?.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(artifact.verifiedSamples?.viewHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(artifact.verifiedSamples?.components).toEqual(volumes.map(volume => ({
      name: volume.component, sampleSha256: volume.sampleSha256,
    })));
    expect(artifact.accepted).toBe(125);
    const changed = [{ ...volumes[0], sampleSha256: "0".repeat(64) },
      volumes[1], volumes[2]] as VectorField3DVolumes;
    expect(() => sampleVectorField3DScientificArrows(document, manifestJson, fingerprint, changed))
      .toThrow(/checksum/);
  });
  it("reverifies all components before a bounded equilibrium search", () => {
    expect(() => searchVectorField3DEquilibria(document)).toThrow(/Reverify/);
    const verified = { manifestJson, fingerprint, volumes };
    const result = searchVectorField3DEquilibria(document, verified);
    expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.status).toMatch(/bounded-incomplete|budget-reached/);
    expect(result.candidates.some(item => item.residual <= result.residualTolerance)).toBe(true);
    const changed = [{ ...volumes[0], sampleSha256: "0".repeat(64) },
      volumes[1], volumes[2]] as VectorField3DVolumes;
    expect(() => searchVectorField3DEquilibria(document,
      { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum/);
  });
  it("derives a bounded verified vortex map and rejects changed source components", () => {
    const scientific = { manifestJson, fingerprint, volumes };
    const derived = sampleVectorField3DDerivedSlice(document, 2, -1.5,
      "curl-magnitude", scientific);
    expect(derived.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(derived.unit).toBe("1/s");
    expect(derived.evaluated).toBeLessThanOrEqual(1024);
    expect(derived.boundarySamples).toBeGreaterThan(0);
    expect(derived.values.some(value => value !== null && value > 0)).toBe(true);
    const scalar = sampleVectorField3DDerivedSlice(document, 2, -1.5,
      "laplacian-speed", scientific);
    expect(scalar.unit).toBe("(m/s)/m²");
    expect(scalar.evaluated).toBeLessThanOrEqual(1024);
    expect(scalar.values.some(value => value !== null)).toBe(true);
    expect(scalar.sourceHash).toBe(derived.sourceHash);
    const changed = volumes.map((volume, index) => index === 1 ?
      { ...volume, values: volume.values.map((value, offset) => offset === 0 ? value + 1 : value) } :
      volume) as VectorField3DVolumes;
    expect(() => sampleVectorField3DDerivedSlice(document, 2, -1.5, "divergence",
      { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum|integrity|changed/i);
    expect(() => sampleVectorField3DDerivedSlice(document, 2, -1.5, "divergence",
      { manifestJson, fingerprint, volumes: volumes.slice(0, 2) as VectorField3DVolumes }))
      .toThrow(/complete|component|volume/i);
  });
  it("retains selected layer, layout and physical coordinates in Project without storing samples", () => {
    const view = defaultVectorField3DWorkspace(source);
    const selected = reviseVectorField3DWorkspace(document, { ...view,
      selectedLayer: "xz", layout: "quad", sliceCoordinates: [0, -2, -1.5],
      probe: [0, -2, -1.5], cameraPreset: "yz",
      cameraState: { position: [4, 1, 2], target: [0.2, 0, 0], zoom: 140 },
      clipBounds: [[-2, 2], [-3, 1], [-2, 0]] });
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d", checkpoint: selected,
      expected: selected.identity, replay: null }], activeDocumentIds: [selected.identity.id],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const reopened = parseMath3DProject(serializeMath3DProject(createMath3DProject(workspace,
      { stableKey: "field-explorer-project" }))).workspace.entries[0]!.checkpoint;
    expect(reopened).toEqual(selected);
    expect(serializeVectorField3DDocument(selected)).not.toContain('"values"');
    const legacy = JSON.parse(serializeVectorField3DDocument(document));
    delete legacy.workspace;
    expect(parseVectorField3DDocument(JSON.stringify(legacy)).workspace)
      .toEqual(defaultVectorField3DWorkspace(source));
    expect(normalizeVectorField3DDocument({ ...selected, workspace: { ...selected.workspace,
      sliceCoordinates: [0, 10, 0] } }).ok).toBe(false);
    expect(normalizeVectorField3DDocument({ ...selected, workspace: { ...selected.workspace,
      probe: [0, 10, 0] } }).ok).toBe(false);
    expect(normalizeVectorField3DDocument({ ...selected, workspace: { ...selected.workspace,
      clipBounds: [[-2, 10], [-3, 1], [-2, 0]] } }).ok).toBe(false);
    expect(normalizeVectorField3DDocument({ ...selected, workspace: { ...selected.workspace,
      clipBounds: [[2, -2], [-3, 1], [-2, 0]] } }).ok).toBe(false);
    expect(normalizeVectorField3DDocument({ ...selected, workspace: { ...selected.workspace,
      viewZoom: { xy: 2, xz: 1, yz: 1 },
      viewCenter: { xy: [0.1, 0.5], xz: [0.5, 0.5], yz: [0.5, 0.5] } } }).ok)
      .toBe(false);
    const previousWorkspace = JSON.parse(serializeVectorField3DDocument(selected));
    delete previousWorkspace.workspace.probe;
    delete previousWorkspace.workspace.clipBounds;
    delete previousWorkspace.workspace.cameraPreset;
    delete previousWorkspace.workspace.cameraState;
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.probe).toBeNull();
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.clipBounds)
      .toEqual(view.clipBounds);
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.cameraPreset)
      .toBe("perspective");
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.cameraState)
      .toBeNull();
    delete previousWorkspace.workspace.viewsLinked;
    delete previousWorkspace.workspace.viewZoom;
    delete previousWorkspace.workspace.viewCenter;
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace)
      .toMatchObject({ viewsLinked: true, viewZoom: { xy: 1, xz: 1, yz: 1 },
        viewCenter: { xy: [0.5, 0.5], xz: [0.5, 0.5], yz: [0.5, 0.5] } });
    const independent = reviseVectorField3DWorkspace(selected, { ...selected.workspace!,
      viewsLinked: false, viewZoom: { xy: 2, xz: 1.5, yz: 1 },
      viewCenter: { xy: [0.6, 0.5], xz: [0.5, 0.5], yz: [0.5, 0.5] } });
    expect(parseVectorField3DDocument(serializeVectorField3DDocument(independent)).workspace)
      .toMatchObject({ viewsLinked: false, viewZoom: { xy: 2, xz: 1.5, yz: 1 },
        viewCenter: { xy: [0.6, 0.5], xz: [0.5, 0.5], yz: [0.5, 0.5] } });
  });

  it("samples XY, XZ and YZ at exact physical coordinates within 1,024 cells", () => {
    for (const [axis, coordinate, expectedShape] of [
      [2, -1.5, [21, 21]], [1, -2, [21, 17]], [0, -2, [21, 17]],
    ] as const) {
      const slice = sampleVectorField3DSlice(document, axis, coordinate,
        { manifestJson, fingerprint, volumes });
      expect(slice.shape).toEqual(expectedShape);
      expect(slice.evaluated).toBeLessThanOrEqual(1024);
      expect(slice.rejected).toBe(0);
      expect(slice.fixedCoordinate).toBe(coordinate);
      expect(slice.fixedUnit).toBe("m");
      expect(slice.unit).toBe("m/s");
      expect(slice.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(vectorField3DSliceCoordinates(document, 2)).toContain(-1.5);
  });

  it("agrees at the same physical intersection across all three planes", () => {
    const verified = { manifestJson, fingerprint, volumes };
    const xy = sampleVectorField3DSlice(document, 2, -1.5, verified);
    const xz = sampleVectorField3DSlice(document, 1, -2, verified);
    const yz = sampleVectorField3DSlice(document, 0, 0, verified);
    const x = xy.coordinates[0].indexOf(0), y = xy.coordinates[1].indexOf(-2);
    const z = xz.coordinates[1].indexOf(-1.5);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(z).toBeGreaterThanOrEqual(0);
    const shared = xy.values[x * xy.shape[1] + y];
    expect(xz.values[x * xz.shape[1] + z]).toBe(shared);
    expect(yz.values[y * yz.shape[1] + z]).toBe(shared);
  });

  it("reads one verified point and binds its exact source revision and coordinates", () => {
    const first = sampleVectorField3DProbe(document, [0, -2, -1.5],
      { manifestJson, fingerprint, volumes });
    const second = sampleVectorField3DProbe(document, [0, -1.6, -1.5],
      { manifestJson, fingerprint, volumes });
    expect(first.position).toEqual([0, -2, -1.5]);
    expect(first.source).toMatchObject({ documentId: document.identity.id,
      revision: document.identity.revision });
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.viewHash).not.toBe(second.viewHash);
    expect(first.componentUnits).toEqual(["m/s", "m/s", "m/s"]);
    expect(first.vector).toEqual(volumes.map(volume => volume.values[(10 * 21 + 5) * 17 + 4]));
    expect(() => sampleVectorField3DProbe(document, [0, 10, -1.5],
      { manifestJson, fingerprint, volumes })).toThrow(/outside/);
    expect(() => sampleVectorField3DProbe(document, [0, -1.9, -1.5],
      { manifestJson, fingerprint, volumes })).toThrow(/between grid samples/);
    expect(() => sampleVectorField3DProbe(document, [0, -2, -1.5])).toThrow(/Reverify/);
  });

  it("rejects invalid coordinates, changed components and incomplete transfers", () => {
    expect(() => sampleVectorField3DSlice(document, 2, 10,
      { manifestJson, fingerprint, volumes })).toThrow(/outside/);
    expect(() => sampleVectorField3DSlice(document, 2, -1.49,
      { manifestJson, fingerprint, volumes })).toThrow(/between grid samples/);
    expect(() => sampleVectorField3DSlice(document, 2, -1.5)).toThrow(/Reverify/);
    const changed = [{ ...volumes[0], sampleSha256: "0".repeat(64) }, volumes[1], volumes[2]] as
      unknown as VectorField3DVolumes;
    expect(() => sampleVectorField3DSlice(document, 2, -1.5,
      { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum/);
    expect(() => sampleVectorField3DSlice(document, 2, -1.5,
      { manifestJson, fingerprint, volumes: volumes.slice(0, 2) as unknown as VectorField3DVolumes }))
      .toThrow(/complete 3D vector field/);
  });

  it("checks an independent component oracle at one point in every verified plane", () => {
    const point = [0, -2, -1.5] as const;
    const oracle = [1.3903973060054509, 0, -0.5732250484590314];
    const verified = { manifestJson, fingerprint, volumes };
    expect(sampleVectorField3DProbe(document, point, verified).vector).toEqual(oracle);
    for (const [component, expected] of [["p", oracle[0]], ["q", oracle[1]],
      ["r", oracle[2]]] as const) {
      const selected = reviseVectorField3DDocument(document, { ...source,
        display: { ...source.display, colorBy: component } });
      for (const normalAxis of [0, 1, 2] as const) {
        const slice = sampleVectorField3DSlice(selected, normalAxis, point[normalAxis], verified);
        const [first, second] = slice.planeAxes;
        const i = slice.coordinates[0].indexOf(point[first]);
        const j = slice.coordinates[1].indexOf(point[second]);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(j).toBeGreaterThanOrEqual(0);
        expect(slice.values[i * slice.shape[1] + j]).toBeCloseTo(expected!, 13);
      }
    }
  });

  it("rejects axis-order errors, changed checksums and missing components before sampling", () => {
    const changed = [{ ...volumes[0], values: [...volumes[0].values].reverse() },
      volumes[1], volumes[2]] as VectorField3DVolumes;
    expect(() => sampleVectorField3DProbe(document, [0, -2, -1.5],
      { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum/);
    const wrongOrder = [{ ...volumes[0], sampleShape: [21, 17, 21] },
      volumes[1], volumes[2]] as unknown as VectorField3DVolumes;
    expect(() => sampleVectorField3DSlice(document, 2, -1.5,
      { manifestJson, fingerprint, volumes: wrongOrder })).toThrow(/verified volume|shape|lattice/i);
    expect(() => sampleVectorField3DProbe(document, [0, -2, -1.5],
      { manifestJson, fingerprint, volumes: [volumes[1], volumes[0], volumes[2]] as VectorField3DVolumes }))
      .toThrow(/component|verified volume/i);
    for (const normalAxis of [0, 1, 2] as const) {
      const coordinate = [0, -2, -1.5][normalAxis]!;
      expect(() => sampleVectorField3DSlice(document, normalAxis, coordinate,
        { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum/);
      expect(() => sampleVectorField3DSlice(document, normalAxis, coordinate,
        { manifestJson, fingerprint, volumes: volumes.slice(0, 2) as VectorField3DVolumes }))
        .toThrow(/complete 3D vector field/);
    }
  });

  it("reports scientific solver stop reasons for stationary, boundary, step-limit and cancellation", () => {
    const withSeed = (position: readonly [number, number, number], maxSteps = 1000) =>
      reviseVectorField3DDocument(document, { ...source,
        seeds: [{ id: "oracle", position }], solver: { ...source.solver, maxSteps } });
    const stop = (position: readonly [number, number, number], maxSteps?: number,
      shouldCancel?: () => boolean) => integrateVectorField3DScientificTrajectories(
        withSeed(position, maxSteps), manifestJson, fingerprint, volumes,
        { shouldCancel }).trajectories[0]!;
    expect(stop([0, 0, 0]).stopReason).toBe("stationary");
    expect(stop([4, 4, 0]).stopReason).toBe("boundary");
    expect(stop([0, -2, -1.5], 1).stopReason).toBe("step-limit");
    expect(stop([0, -2, -1.5], 1000, () => true).stopReason).toBe("cancelled");
  });

  it("derives verified-grid vortex divergence and curl and rejects stale components", () => {
    const verified = { manifestJson, fingerprint, volumes };
    const center = analyzeVectorField3DDifferential(document, [0, 0, 0], verified);
    expect(center).toMatchObject({ status: "ready", quality: "approximate",
      divergenceUnit: "1/s", curlUnit: "1/s" });
    // The fixture's vertical component is 0.8 sin(zπ/3): use its grid-spacing oracle.
    expect(center.divergence).toBeCloseTo(0.8 * Math.sin(Math.PI / 8) / 0.375, 12);
    expect(center.curl![0]).toBeCloseTo(0, 12);
    expect(center.curl![1]).toBeCloseTo(0, 12);
    expect(center.curl![2]).toBeCloseTo(2 * Math.exp(-0.4 * 0.4 / 18), 10);
    expect(center.evaluations).toBeLessThanOrEqual(9);
    expect(center.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => analyzeVectorField3DDifferential(document, [0, -1.9, 0], verified))
      .toThrow(/between grid samples/);
    const edge = analyzeVectorField3DDifferential(document, [4, 0, 0], verified);
    expect(edge.stencils[0]).toMatchObject({ method: "one-sided-three-point", boundary: true });
    expect(edge.diagnostics.join(" ")).toMatch(/boundary.*accuracy is reduced/i);
    const changed = [{ ...volumes[0], sampleSha256: "0".repeat(64) },
      volumes[1], volumes[2]] as VectorField3DVolumes;
    expect(() => analyzeVectorField3DDifferential(document, [0, 0, 0],
      { manifestJson, fingerprint, volumes: changed })).toThrow(/checksum/);
    expect(() => analyzeVectorField3DDifferential(document, [0, 0, 0],
      { manifestJson, fingerprint, volumes: volumes.slice(0, 2) as VectorField3DVolumes }))
      .toThrow(/complete 3D vector field/);
  });
});
