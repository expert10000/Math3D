import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, defaultVectorField3DWorkspace, normalizeVectorField3DDocument,
  parseMath3DProject, parseVectorField3DDocument, reviseVectorField3DWorkspace,
  sampleVectorField3DSlice, sampleVectorField3DProbe, serializeMath3DProject, serializeVectorField3DDocument,
  integrateVectorField3DScientificTrajectories, reviseVectorField3DDocument,
  analyzeVectorField3DDifferential, sampleVectorField3DDerivedSlice,
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

describe("SCI-02 saved field workspace and SCI-04 orthogonal slices", () => {
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
