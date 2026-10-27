import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { slicePlot, sliceSeedMarkerAtPoint, sliceSeedPointAtSvgPosition } from "./sliceSeedPlacement";
import { analyzeVectorField3DDifferential, createGraph2DFieldReference,
  createVectorField3DDocument, integrateVectorField3DScientificTrajectories,
  integrateVectorField3DVerifiedTileTrajectories, VectorField3DNeededTile,
  VectorField3DVerifiedTileCache,
  sampleVectorField3DDerivedSlice, sampleVectorField3DProbe, sampleVectorField3DSlice,
  createVectorField3DDerivedLine, validGraph2DDerivedFieldOrigin,
  createVectorField3DPointResult, reverifyVectorField3DPointResult,
  vectorField3DPointResultRelation, createMixedWorkspaceDocument,
  scientificTileLayout, scientificTileSampleLocation, sha256Checksum,
  vectorField3DSeedPreset, vectorField3DSpatialSeedPattern,
  vectorField3DSourceStencilPoints, vectorField3DSourceProbeStencilPoints,
  type VectorField3DSparseSamples,
  type Graph2DFieldReference, type VectorField3DSource, type VectorField3DVolumes } from "@math3d/core";

const directory = fileURLToPath(new URL("../../../output/scientific-vortex-80-overview.sscene/", import.meta.url));
const manifestJson = readFileSync(`${directory}manifest.json`, "utf8");
const manifest = JSON.parse(manifestJson) as { resources: {
  id: string; path: string; sha256: string; tileShape: [number, number, number];
  tileSha256: string[] }[] };
const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
const shape = [80, 80, 80] as const;
const names = ["east", "north", "up"] as const;
const positions = Array.from({ length: 32 }, (_, index) => Math.round(index * 79 / 31));
const coordinate = (index: number) => -4 + 8 * index / 79;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Rebuild the same bounded transfer as the desktop verifier from the committed physical tiles.
// Check every physical tile before giving core a verifiedTiles claim.
const volumes = names.map(name => {
  const resource = manifest.resources.find(item => item.id === name)!;
  const bytes = readFileSync(`${directory}${resource.path}`);
  expect(hash(bytes)).toBe(resource.sha256);
  const layout = scientificTileLayout(shape, resource.tileShape);
  for (const tile of layout)
    expect(hash(bytes.subarray(tile.offsetBytes, tile.offsetBytes + tile.bytes)))
      .toBe(resource.tileSha256[tile.index]);
  const values: number[] = [];
  for (const x of positions) for (const y of positions) for (const z of positions) {
    const location = scientificTileSampleLocation(shape, resource.tileShape, [x, y, z], layout);
    values.push(bytes.readDoubleLE(layout[location.tileIndex]!.offsetBytes + location.offsetBytes));
  }
  const sample = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => sample.writeDoubleLE(value, index * 8));
  return { fingerprint, datasetId: "field", component: name, sourceShape: shape,
    sampleShape: [32, 32, 32] as const, sampleLimit: 32,
    resourceSha256: resource.sha256, sampleSha256: hash(sample), values,
    verifiedTiles: layout.map(tile => tile.index) };
}) as VectorField3DVolumes;
const references = names.map(name => createGraph2DFieldReference(manifestJson, fingerprint,
  { kind: "preset", value: "large-vortex-80" }, "field", name)) as
  [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
const source: VectorField3DSource = {
  axes: (["x", "y", "z"] as const).map(role =>
    ({ role, label: role, unit: "m", min: -4, max: 4 })) as VectorField3DSource["axes"],
  timeUnit: "s", field: { kind: "scientific-bundle", references,
    componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
  display: { density: [5, 5, 5], maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
  solver: { method: "rk45", absoluteTolerance: 1e-6, relativeTolerance: 1e-6,
    maxSteps: 1000, maxTime: 1 },
};
const document = createVectorField3DDocument(source, { stableKey: "large-vortex-golden" });
const scientific = { manifestJson, fingerprint, volumes };
const sparseTransfer = (kind: "stencil-slice" | "source-stencil-slice", fixedIndex: number):
  VectorField3DSparseSamples => {
  const layers = [positions.indexOf(fixedIndex) - 1, positions.indexOf(fixedIndex),
    positions.indexOf(fixedIndex) + 1].map(index => positions[index]!);
  const points = kind === "source-stencil-slice" ?
    vectorField3DSourceStencilPoints(shape, 2, fixedIndex) :
    layers.flatMap(z => positions.flatMap(x => positions.map(y => [x, y, z] as const)));
  return { fingerprint, datasetId: "field", sourceShape: shape,
    selection: { kind, normalAxis: 2, fixedIndex },
    components: names.map(name => {
      const resource = manifest.resources.find(item => item.id === name)!;
      const bytes = readFileSync(`${directory}${resource.path}`);
      const layout = scientificTileLayout(shape, resource.tileShape);
      const locations = points.map(point => scientificTileSampleLocation(shape,
        resource.tileShape, point, layout));
      const values = locations.map(item => bytes.readDoubleLE(
        layout[item.tileIndex]!.offsetBytes + item.offsetBytes));
      const transferred = Buffer.alloc(values.length * 8);
      values.forEach((value, index) => transferred.writeDoubleLE(value, index * 8));
      return { name, resourceSha256: resource.sha256, sampleSha256: hash(transferred), values,
        verifiedTiles: [...new Set(locations.map(item => item.tileIndex))].sort((a, b) => a - b) };
    }) };
};

const sparseProbeTransfer = (indices: readonly [number, number, number]):
  VectorField3DSparseSamples => {
  const points = vectorField3DSourceProbeStencilPoints(shape, indices);
  return { fingerprint, datasetId: "field", sourceShape: shape,
    selection: { kind: "source-stencil-probe", indices },
    components: names.map(name => {
      const resource = manifest.resources.find(item => item.id === name)!;
      const bytes = readFileSync(`${directory}${resource.path}`);
      const layout = scientificTileLayout(shape, resource.tileShape);
      const locations = points.map(point => scientificTileSampleLocation(shape,
        resource.tileShape, point, layout));
      const values = locations.map(item => bytes.readDoubleLE(
        layout[item.tileIndex]!.offsetBytes + item.offsetBytes));
      const transferred = Buffer.alloc(values.length * 8);
      values.forEach((value, index) => transferred.writeDoubleLE(value, index * 8));
      return { name, resourceSha256: resource.sha256, sampleSha256: hash(transferred), values,
        verifiedTiles: [...new Set(locations.map(item => item.tileIndex))].sort((a, b) => a - b) };
    }) };
};

// Independent derivatives of F=(-y*a,x*a,sin(z)/4), a=16/(16+x²+y²).
function oracle([x, y, z]: readonly [number, number, number]) {
  const r2 = x * x + y * y, denominator = 16 + r2;
  const a = 16 / denominator, q = r2 * a * a + Math.sin(z) ** 2 / 16;
  const speed = Math.sqrt(q);
  const qRadial = 256 * (16 - r2) / denominator ** 3;
  const qGradient = [2 * x * qRadial, 2 * y * qRadial, Math.sin(2 * z) / 16];
  const qLaplacian = 1024 * (256 - 64 * r2 + r2 * r2) / denominator ** 4 +
    Math.cos(2 * z) / 8;
  return { divergence: Math.cos(z) / 4, curl: [0, 0, 512 / denominator ** 2],
    jacobian: [[32 * x * y / denominator ** 2, -16 / denominator +
      32 * y * y / denominator ** 2, 0],
    [16 / denominator - 32 * x * x / denominator ** 2,
      -32 * x * y / denominator ** 2, 0],
    [0, 0, Math.cos(z) / 4]],
    gradient: qGradient.map(value => value / (2 * speed)),
    laplacian: qLaplacian / (2 * speed) -
      qGradient.reduce((sum, value) => sum + value * value, 0) / (4 * speed ** 3),
    speed };
}
const at = (x: number, y: number, z: number) =>
  [coordinate(positions[x]!), coordinate(positions[y]!), coordinate(positions[z]!)] as const;
const close = (actual: number | null | undefined, expected: number, tolerance: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(tolerance);
};

describe("SCI-12 committed 80³ scientific vortex numerical oracle", () => {
  it("places bounded sphere, shell and reproducible random seeds in physical coordinates", () => {
    const common = { center: [1, -.5, .25] as const, radius: 1.5,
      count: 12, randomSeed: 314159 };
    const shell = vectorField3DSpatialSeedPattern(source, { ...common, kind: "shell" });
    expect(shell).toHaveLength(12);
    for (const point of shell) {
      expect(Math.hypot(...point.map((value, axis) => value - common.center[axis]!)))
        .toBeCloseTo(common.radius, 10);
      expect(point.every(value => value >= -4 && value <= 4)).toBe(true);
    }
    const sphere = vectorField3DSpatialSeedPattern(source, { ...common, kind: "sphere" });
    expect(sphere).toHaveLength(12);
    const sphereRadii = sphere.map(point => Math.hypot(...point.map((value, axis) =>
      value - common.center[axis]!)));
    expect(Math.min(...sphereRadii)).toBeLessThan(common.radius * .6);
    expect(Math.max(...sphereRadii)).toBeGreaterThan(common.radius * .9);
    expect(Math.max(...sphereRadii)).toBeLessThan(common.radius);
    const random = vectorField3DSpatialSeedPattern(source, { ...common, kind: "random" });
    expect(vectorField3DSpatialSeedPattern(source, { ...common, kind: "random" })).toEqual(random);
    expect(vectorField3DSpatialSeedPattern(source, { ...common, kind: "random",
      randomSeed: common.randomSeed + 1 })).not.toEqual(random);
    expect(random.every(point => Math.hypot(...point.map((value, axis) =>
      value - common.center[axis]!)) <= common.radius)).toBe(true);
    expect(() => vectorField3DSpatialSeedPattern(source, { ...common, kind: "shell",
      center: [3.5, 0, 0] })).toThrow(/complete seed sphere/i);
    expect(() => vectorField3DSpatialSeedPattern(source, { ...common, kind: "random",
      count: 33 })).toThrow(/between 1 and 32/i);
    expect(() => vectorField3DSpatialSeedPattern(source, { ...common, kind: "random",
      randomSeed: -1 })).toThrow(/random seed/i);
  });

  it("maps XY, XZ and YZ slice clicks to oriented physical seed coordinates", () => {
    for (const normalAxis of [2, 1, 0] as const) {
      const fixed = coordinate(positions[14]!);
      const slice = sampleVectorField3DSlice(document, normalAxis, fixed, scientific);
      const firstIndex = 6, secondIndex = 20;
      const x = slicePlot.left + (firstIndex + .5) * slicePlot.width / slice.shape[0];
      const y = slicePlot.top + (slice.shape[1] - secondIndex - .5) *
        slicePlot.height / slice.shape[1];
      const point = sliceSeedPointAtSvgPosition(slice, x, y);
      expect(point).not.toBeNull();
      close(point![slice.planeAxes[0]], slice.coordinates[0][firstIndex]!, 1e-12);
      close(point![slice.planeAxes[1]], slice.coordinates[1][secondIndex]!, 1e-12);
      close(point![normalAxis], fixed, 1e-12);
      const between = sliceSeedPointAtSvgPosition(slice,
        x + slicePlot.width / (2 * slice.shape[0]), y);
      close(between?.[slice.planeAxes[0]],
        (slice.coordinates[0][firstIndex]! + slice.coordinates[0][firstIndex + 1]!) / 2, 1e-12);
      const marker = sliceSeedMarkerAtPoint(slice, point!);
      close(marker?.[0], x, 1e-9);
      close(marker?.[1], y, 1e-9);
      expect(sliceSeedPointAtSvgPosition(slice, slicePlot.left - 1, y)).toBeNull();
      expect(sliceSeedPointAtSvgPosition(slice, x, slicePlot.top + slicePlot.height + 1))
        .toBeNull();
      expect(slice.sourceHash).toBeDefined();
    }
  });
  it("uses source-grid probe stencils for all point calculus outputs and rejects changed samples", () => {
    for (const indices of [[positions[8]!, positions[13]!, positions[9]!],
      [positions[0]!, positions[12]!, positions[17]!]] as const) {
      const point = indices.map(coordinate) as [number, number, number];
      const expected = oracle(point);
      const samples = sparseProbeTransfer(indices);
      const result = analyzeVectorField3DDifferential(document, point,
        { manifestJson, fingerprint, samples });
      expect(result.status).toBe("ready");
      expect(result.stencilGrid).toBe("source");
      expect(result.sourceHash).toBeDefined();
      expect(result.verifiedSamples).toHaveLength(3);
      expect(result.verifiedSamples?.every(part => part.verifiedTiles! < part.totalTiles!)).toBe(true);
      expect(samples.components.every(part => part.values.length <= 9)).toBe(true);
      expect(result.stencils.filter(stencil => stencil.boundary)).toHaveLength(indices[0] === 0 ? 1 : 0);
      close(result.divergence, expected.divergence, 0.001);
      for (let axis = 0; axis < 3; axis++) {
        close(result.curl?.[axis], expected.curl[axis]!, 0.004);
        close(result.magnitudeGradient?.[axis], expected.gradient[axis]!, 0.006);
        for (let component = 0; component < 3; component++)
          close(result.jacobian?.[component]?.[axis], expected.jacobian[component]![axis]!, 0.004);
      }
      const xyDeterminant = expected.jacobian[0]![0]! * expected.jacobian[1]![1]! -
        expected.jacobian[0]![1]! * expected.jacobian[1]![0]!;
      const eigenvalues = result.eigenanalysis.eigenvalues!;
      expect(result.eigenanalysis.unit).toBe("1/s");
      if (xyDeterminant > 0) {
        close(eigenvalues[0].real, expected.jacobian[2]![2]!, 0.004);
        close(eigenvalues[0].imaginary, 0, 0.004);
        close(eigenvalues[1].real, 0, 0.004);
        close(eigenvalues[2].real, 0, 0.004);
        close(eigenvalues[1].imaginary, Math.sqrt(xyDeterminant), 0.004);
        close(eigenvalues[2].imaginary, -Math.sqrt(xyDeterminant), 0.004);
      } else {
        const expectedRoots = [-Math.sqrt(-xyDeterminant), Math.sqrt(-xyDeterminant),
          expected.jacobian[2]![2]!].sort((a, b) => a - b);
        eigenvalues.forEach((value, index) => {
          close(value.real, expectedRoots[index]!, 0.004);
          close(value.imaginary, 0, 0.004);
        });
      }
      expect(result.eigenanalysis.status).toBe(indices[0] === 0 ? "uncertain" : "resolved");
      const saved = createVectorField3DPointResult(document, result, 1);
      expect(saved.summary.jacobianRows).toEqual(result.jacobian);
      expect(saved.summary.eigenvalues).toEqual(result.eigenanalysis.eigenvalues);
      expect(saved.summary.verifiedSamples).toEqual(result.verifiedSamples);
      expect(saved.provenance.operation.parameters.position).toEqual(point);
      expect(saved.provenance.operation.parameters.sourceReference).toMatchObject({
        kind: "scientific-bundle", components: [{ datasetId: "field" },
          { datasetId: "field" }, { datasetId: "field" }] });
      expect(() => reverifyVectorField3DPointResult(saved, document, result)).not.toThrow();
      const relation = vectorField3DPointResultRelation(saved);
      const workspace = createMixedWorkspaceDocument({ entries: [{ module: "vector3d",
        checkpoint: document, expected: document.identity, replay: null }],
      activeDocumentIds: [document.identity.id], results: [saved], relations: [relation],
      artifacts: [], constructions: [], committedSelection: null });
      expect(workspace.relations[0]?.target).toMatchObject({ type: "result",
        resultId: saved.resultId });
      expect(() => reverifyVectorField3DPointResult({ ...saved, summary: {
        ...saved.summary, divergence: Number(saved.summary.divergence) + 1 } }, document, result))
        .toThrow(/changed/);
      close(result.magnitudeLaplacian, expected.laplacian, 0.05);
      const changed = { ...samples, components: [{ ...samples.components[0]!,
        values: samples.components[0]!.values.map((value, index) => index === 0 ? value + 1 : value) },
        samples.components[1]!, samples.components[2]!] };
      expect(() => analyzeVectorField3DDifferential(document, point,
        { manifestJson, fingerprint, samples: changed })).toThrow(/checksum/);
      expect(() => analyzeVectorField3DDifferential(document,
        [point[0], point[1], coordinate(positions[18]!)],
        { manifestJson, fingerprint, samples })).toThrow(/does not match the selected probe/);
    }
  });
  it("checks divergence, signed curl, |F| gradient and Laplacian at interior points", () => {
    for (const indices of [[8, 13, 9], [12, 23, 18], [24, 16, 26]] as const) {
      const point = at(...indices), expected = oracle(point);
      const result = analyzeVectorField3DDifferential(document, point, scientific);
      expect(result.status).toBe("ready");
      expect(result.stencils.every(item => item.method === "centered-three-point")).toBe(true);
      expect(result.divergenceUnit).toBe("1/s");
      expect(result.magnitudeLaplacianUnit).toBe("(m/s)/m²");
      expect(result.verifiedSamples?.every(part => part.verifiedTiles === 125)).toBe(true);
      close(result.divergence, expected.divergence, 0.004);
      for (let axis = 0; axis < 3; axis++) {
        close(result.curl?.[axis], expected.curl[axis]!, 0.015);
        close(result.magnitudeGradient?.[axis], expected.gradient[axis]!, 0.018);
      }
      close(result.magnitudeLaplacian, expected.laplacian, 0.12);
    }
  });

  it("labels one-sided boundary stencils and keeps their errors within stated limits", () => {
    for (const indices of [[0, 12, 17], [16, 31, 11], [21, 10, 0]] as const) {
      const point = at(...indices), expected = oracle(point);
      const result = analyzeVectorField3DDifferential(document, point, scientific);
      expect(result.status).toBe("ready");
      expect(result.stencils.filter(item => item.boundary)).toHaveLength(1);
      expect(result.diagnostics.join(" ")).toMatch(/boundary; accuracy is reduced/);
      close(result.divergence, expected.divergence, 0.012);
      close(result.curl?.[2], expected.curl[2]!, 0.035);
      for (let axis = 0; axis < 3; axis++)
        close(result.magnitudeGradient?.[axis], expected.gradient[axis]!, 0.055);
      close(result.magnitudeLaplacian, expected.laplacian, 0.3);
    }
  });

  it("carries verified transfer provenance into source and derived views", () => {
    const point = at(12, 21, 16);
    const probe = sampleVectorField3DProbe(document, point, scientific);
    expect(probe.verifiedSamples).toHaveLength(3);
    expect(probe.verifiedSamples?.every(part => part.verifiedTiles === 125 &&
      part.totalTiles === 125)).toBe(true);
    const slice = sampleVectorField3DSlice(document, 2, point[2], scientific);
    expect(slice.verifiedSamples?.map(part => part.sampleSha256))
      .toEqual(volumes.map(volume => volume.sampleSha256));
    expect(() => sampleVectorField3DDerivedSlice(document, 2, point[2], "curl-z",
      { ...scientific, volumes: [{ ...volumes[0], verifiedTiles: [] },
        volumes[1], volumes[2]] as VectorField3DVolumes })).toThrow(/verification coverage/);
  });

  it("extends the same oracle to XY, XZ and YZ derived maps", () => {
    const cases = [
      { axis: 0 as const, fixed: 12, channel: "curl-z" as const, sample: [12, 21, 16] as const,
        expected: (point: readonly [number, number, number]) => oracle(point).curl[2]!, tolerance: 0.015 },
      { axis: 1 as const, fixed: 13, channel: "grad-speed-z" as const,
        sample: [20, 13, 18] as const,
        expected: (point: readonly [number, number, number]) => oracle(point).gradient[2]!, tolerance: 0.018 },
      { axis: 2 as const, fixed: 11, channel: "laplacian-speed" as const,
        sample: [22, 18, 11] as const,
        expected: (point: readonly [number, number, number]) => oracle(point).laplacian, tolerance: 0.12 },
    ];
    for (const item of cases) {
      const point = at(...item.sample);
      const slice = sampleVectorField3DDerivedSlice(document, item.axis, point[item.axis],
        item.channel, scientific);
      const plane = [0, 1, 2].filter(axis => axis !== item.axis);
      const offset = item.sample[plane[0]!]! * slice.shape[1] + item.sample[plane[1]!]!;
      close(slice.values[offset], item.expected(point), item.tolerance);
      expect(slice.method).toBe("bounded-finite-difference");
      expect(slice.boundarySamples).toBeGreaterThan(0);
      expect(slice.sourceHash).toBeDefined();
      expect(slice.verifiedSamples?.every(part => part.verifiedTiles === 125)).toBe(true);
    }
  });

  it("exports physical derived profiles with numerical oracle values and source hashes", () => {
    const z = at(0, 0, 16)[2], y = at(0, 21, 0)[1];
    const cases = [
      ["divergence", (p: readonly [number, number, number]) => oracle(p).divergence, 0.004],
      ["curl-z", (p: readonly [number, number, number]) => oracle(p).curl[2]!, 0.015],
      ["grad-speed-x", (p: readonly [number, number, number]) => oracle(p).gradient[0]!, 0.018],
      ["grad-speed-magnitude", (p: readonly [number, number, number]) =>
        Math.hypot(...oracle(p).gradient), 0.025],
      ["laplacian-speed", (p: readonly [number, number, number]) => oracle(p).laplacian, 0.12],
    ] as const;
    for (const [channel, expected, tolerance] of cases) {
      const slice = sampleVectorField3DDerivedSlice(document, 2, z, channel, scientific);
      const line = createVectorField3DDerivedLine(document, slice, 0, y);
      expect(line.rows).toHaveLength(32);
      expect(line.origin).toMatchObject({ operation: channel, normalAxis: 2,
        fixedCoordinate: z, varyingAxis: 0, profileFixedCoordinate: y,
        xUnit: "m", yUnit: slice.unit, sourceHash: slice.sourceHash });
      expect(line.origin.verifiedSamples.map(part => part.sampleSha256))
        .toEqual(volumes.map(volume => volume.sampleSha256));
      expect(validGraph2DDerivedFieldOrigin(line.origin)).toBe(true);
      for (const index of [0, 8, 16, 24, 31])
        close(line.rows[index]!.y, expected([line.rows[index]!.x, y, z]),
          index === 0 || index === 31 ? tolerance * 3 : tolerance);
      expect(validGraph2DDerivedFieldOrigin({ ...line.origin,
        verifiedSamples: [{ ...line.origin.verifiedSamples[0]!, sampleSha256: "bad" },
          ...line.origin.verifiedSamples.slice(1)] })).toBe(false);
    }
  }, 30_000);

  it("uses verified source-grid neighbors for more accurate v3 profiles", () => {
    const z = at(0, 0, 16)[2], y = at(0, 21, 0)[1];
    const fixedIndex = positions[16]!;
    const bounded = sparseTransfer("stencil-slice", fixedIndex);
    const source = sparseTransfer("source-stencil-slice", fixedIndex);
    expect(source.components[0]!.values.length).toBeGreaterThan(bounded.components[0]!.values.length);
    expect(source.components.every(part => part.verifiedTiles!.length < 125)).toBe(true);
    const cases = [
      ["divergence", (p: readonly [number, number, number]) => oracle(p).divergence, 0.001],
      ["curl-z", (p: readonly [number, number, number]) => oracle(p).curl[2]!, 0.004],
      ["grad-speed-x", (p: readonly [number, number, number]) => oracle(p).gradient[0]!, 0.006],
      ["laplacian-speed", (p: readonly [number, number, number]) => oracle(p).laplacian, 0.05],
    ] as const;
    for (const [channel, expected, tolerance] of cases) {
      const oldSlice = sampleVectorField3DDerivedSlice(document, 2, z, channel,
        { manifestJson, fingerprint, samples: bounded });
      const newSlice = sampleVectorField3DDerivedSlice(document, 2, z, channel,
        { manifestJson, fingerprint, samples: source });
      expect(newSlice.stencilGrid).toBe("source");
      const line = createVectorField3DDerivedLine(document, newSlice, 0, y);
      expect(line.origin.stencilGrid).toBe("source");
      for (const index of [0, 8, 16, 24, 31]) {
        const point = [line.rows[index]!.x, y, z] as const;
        const sourceError = Math.abs(line.rows[index]!.y! - expected(point));
        const boundedError = Math.abs(oldSlice.values[index * 32 + 21]! - expected(point));
        expect(sourceError).toBeLessThanOrEqual(tolerance);
        expect(sourceError).toBeLessThanOrEqual(boundedError + 1e-10);
      }
    }
    const changed = { ...source, components: [{ ...source.components[0]!,
      values: source.components[0]!.values.map((value, index) => index === 0 ? value + 1 : value) },
      source.components[1]!, source.components[2]!] };
    expect(() => sampleVectorField3DDerivedSlice(document, 2, z, "curl-z",
      { manifestJson, fingerprint, samples: changed })).toThrow(/checksum/);
  }, 30_000);

  it("checks physical-time and normalized-line trajectories against circular motion", () => {
    const seeded = createVectorField3DDocument({ ...source,
      seeds: [{ id: "orbit", position: [1, 0, 0] }] }, { stableKey: "large-vortex-orbit" });
    const physical = integrateVectorField3DScientificTrajectories(seeded,
      manifestJson, fingerprint, volumes).trajectories[0]!;
    expect(physical.stopReason).toBe("time-limit");
    const last = physical.points.at(-1)!;
    close(last.time, 1, 1e-10);
    close(last.position[0], Math.cos(16 / 17), 0.02);
    close(last.position[1], Math.sin(16 / 17), 0.02);
    close(last.position[2], 0, 1e-10);
    const normalized = createVectorField3DDocument({ ...source,
      seeds: [{ id: "orbit", position: [1, 0, 0] }],
      solver: { ...source.solver, mode: "normalized-field-line", maxLineLength: 1 } },
    { stableKey: "large-vortex-normalized" });
    const line = integrateVectorField3DScientificTrajectories(normalized,
      manifestJson, fingerprint, volumes).trajectories[0]!;
    expect(line.stopReason).toBe("line-limit");
    close(line.points.at(-1)!.position[0], Math.cos(1), 0.02);
    close(line.points.at(-1)!.position[1], Math.sin(1), 0.02);
    const nearBoundary = createVectorField3DDocument({ ...source,
      seeds: [{ id: "edge", position: [3.9, 3.9, 0] }] }, { stableKey: "large-vortex-edge" });
    const boundary = integrateVectorField3DScientificTrajectories(nearBoundary,
      manifestJson, fingerprint, volumes).trajectories[0]!;
    expect(boundary.stopReason).toBe("boundary");
    close(boundary.points.at(-1)!.position[1], 4, 1e-10);
  });

  it("traces both 80³ oracle modes and a line seed batch from verified tiles", async () => {
    const transfer = (indices: readonly [number, number, number]) => ({ fingerprint,
      datasetId: "field", indices, components: names.map(name => {
        const resource = manifest.resources.find(item => item.id === name)!;
        const bytes = readFileSync(`${directory}${resource.path}`);
        const layout = scientificTileLayout(shape, resource.tileShape);
        const location = scientificTileSampleLocation(shape, resource.tileShape, indices, layout);
        const tile = layout[location.tileIndex]!;
        const tileBytes = bytes.subarray(tile.offsetBytes, tile.offsetBytes + tile.bytes);
        return { name, resourceSha256: resource.sha256, tileIndex: tile.index,
          tileSha256: resource.tileSha256[tile.index]!, start: tile.start, size: tile.size,
          bytes: Uint8Array.from(tileBytes) };
      }) });
    for (const mode of ["time-trajectory", "normalized-field-line"] as const) {
      const seeded = createVectorField3DDocument({ ...source,
        seeds: [{ id: "orbit", position: [1, 0, 0] }],
        solver: { ...source.solver, mode, maxTime: 1, maxLineLength: 1 } },
      { stableKey: `large-vortex-tile-${mode}` });
      const cache = new VectorField3DVerifiedTileCache(seeded, manifestJson, fingerprint);
      let result: ReturnType<typeof integrateVectorField3DVerifiedTileTrajectories>;
      for (;;) {
        try { result = integrateVectorField3DVerifiedTileTrajectories(seeded, cache); break; }
        catch (cause) {
          if (!(cause instanceof VectorField3DNeededTile)) throw cause;
          await cache.addAsync(transfer(cause.indices));
        }
      }
      const last = result.trajectories[0]!.points.at(-1)!;
      expect(result.trajectories[0]!.stopReason).toBe(mode === "time-trajectory" ?
        "time-limit" : "line-limit");
      close(last.position[0], Math.cos(mode === "time-trajectory" ? 16 / 17 : 1), 0.02);
      close(last.position[1], Math.sin(mode === "time-trajectory" ? 16 / 17 : 1), 0.02);
      expect(cache.provenance.every(part => part.verifiedTiles < part.totalTiles)).toBe(true);
      expect(cache.residentBytes).toBeLessThan(64 * 1024 * 1024);
    }
    const line = vectorField3DSeedPreset(source, "line-5");
    const batch = createVectorField3DDocument({ ...source,
      seeds: line.map((position, index) => ({ id: `line-${index}`, position,
        group: "line-1" })) }, { stableKey: "large-vortex-line-batch" });
    const cache = new VectorField3DVerifiedTileCache(batch, manifestJson, fingerprint);
    let result: ReturnType<typeof integrateVectorField3DVerifiedTileTrajectories>;
    for (;;) {
      try { result = integrateVectorField3DVerifiedTileTrajectories(batch, cache); break; }
      catch (cause) {
        if (!(cause instanceof VectorField3DNeededTile)) throw cause;
        await cache.addAsync(transfer(cause.indices));
      }
    }
    expect(result.trajectories).toHaveLength(5);
    for (const [index, path] of result.trajectories.entries()) {
      const radius = line[index]![0];
      if (radius === 0) {
        expect(path.stopReason).toBe("stationary");
      } else {
        const last = path.points.at(-1)!;
        expect(path.stopReason).toBe("time-limit");
        const angle = 16 / (16 + radius * radius);
        close(last.position[0], radius * Math.cos(angle), 0.03);
        close(last.position[1], radius * Math.sin(angle), 0.03);
      }
    }
    expect(cache.provenance.every(part => part.verifiedTiles < part.totalTiles)).toBe(true);
    expect(cache.residentBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
  }, 30_000);
});
