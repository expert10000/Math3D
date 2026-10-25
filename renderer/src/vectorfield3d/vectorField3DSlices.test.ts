import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGraph2DFieldReference, createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, defaultVectorField3DWorkspace, normalizeVectorField3DDocument,
  parseMath3DProject, parseVectorField3DDocument, reviseVectorField3DWorkspace,
  sampleVectorField3DSlice, sampleVectorField3DProbe, serializeMath3DProject, serializeVectorField3DDocument,
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
  it("retains selected layer, layout and physical coordinates in Project without storing samples", () => {
    const view = defaultVectorField3DWorkspace(source);
    const selected = reviseVectorField3DWorkspace(document, { ...view,
      selectedLayer: "xz", layout: "quad", sliceCoordinates: [0, -2, -1.5],
      probe: [0, -2, -1.5], cameraPreset: "yz",
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
    const previousWorkspace = JSON.parse(serializeVectorField3DDocument(selected));
    delete previousWorkspace.workspace.probe;
    delete previousWorkspace.workspace.clipBounds;
    delete previousWorkspace.workspace.cameraPreset;
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.probe).toBeNull();
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.clipBounds)
      .toEqual(view.clipBounds);
    expect(parseVectorField3DDocument(JSON.stringify(previousWorkspace)).workspace?.cameraPreset)
      .toBe("perspective");
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
});
