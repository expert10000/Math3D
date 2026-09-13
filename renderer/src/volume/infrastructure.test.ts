import { describe, expect, it } from "vitest";

import type { VectorGrid, VolumeDataset } from "../scene/datasets";
import {
  adaptAnalyticVolume,
  adaptCustomFieldVolume,
  adaptDenseGridVolume,
  adaptVectorGridVolume,
  adaptVtkDistanceVolume,
  createVolumeDerivedResult,
  createVolumeTypedArrayStore,
  deleteVolumeDerivedResult,
  detachVolumeDerivedResult,
  hydrateVolumeRevisionTracker,
  reconcileVolumeDerivedResult,
  restoreVolumeObject,
  serializeVolumeObject,
  type VolumeRevisionTracker,
  volumeObjectToDataset,
} from ".";

const scalarDataset = (
  values = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]),
  origin: [number, number, number] = [-1, -1, -1]
): VolumeDataset => ({
  kind: "volume",
  grid: { dims: [2, 2, 2], origin, spacing: [1, 1, 1], scalars: values },
});

const analytic = (tracker: VolumeRevisionTracker, dataset = scalarDataset(), expression = "x*x+y*y+z*z-1", now = 10) =>
  adaptAnalyticVolume({
    id: "preset:sphere",
    label: "Sphere",
    presetId: "sphere",
    expression,
    parameters: { radius: 1 },
    dataset,
    grid: dataset.grid,
    tracker,
    now,
  });

describe("canonical Volume infrastructure", () => {
  it("advances definition and sampled-grid revisions once per semantic change", () => {
    const tracker: VolumeRevisionTracker = new Map();
    const first = analytic(tracker);
    const viewOnlyReplay = analytic(tracker, scalarDataset(), "x*x+y*y+z*z-1", 20);
    expect(viewOnlyReplay.identity).toEqual(first.identity);
    expect(viewOnlyReplay.provenance.updatedAt).toBe(10);

    const changedDefinition = analytic(
      tracker,
      scalarDataset(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])),
      "x*x+y*y+z*z-4",
      30
    );
    expect(changedDefinition.identity).toMatchObject({ volumeRevision: 2, definitionRevision: 2, sampledGridRevision: 2 });

    const changedDomain = analytic(
      tracker,
      scalarDataset(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]), [0, 0, 0]),
      "x*x+y*y+z*z-4",
      40
    );
    expect(changedDomain.identity).toMatchObject({ volumeRevision: 3, definitionRevision: 2, sampledGridRevision: 3 });
  });

  it("adapts custom, dense, vector, and VTK distance representations", () => {
    const customTracker: VolumeRevisionTracker = new Map();
    const customDataset = scalarDataset();
    const custom = adaptCustomFieldVolume({
      id: "custom:field",
      label: "Custom",
      expression: "sin(x)+z",
      dataset: customDataset,
      grid: customDataset.grid,
      tracker: customTracker,
    });
    expect(custom).toMatchObject({ representation: "custom-scalar-field", source: { kind: "custom-field" } });

    const denseTracker: VolumeRevisionTracker = new Map();
    const denseDataset = scalarDataset();
    const dense = adaptDenseGridVolume({
      id: "import:scan",
      label: "Scan",
      sourceLabel: "scan.raw",
      importRef: "scan.raw#frame-1",
      dataset: denseDataset,
      grid: denseDataset.grid,
      tracker: denseTracker,
    });
    expect(dense).toMatchObject({ representation: "dense-scalar-grid", source: { kind: "dense-grid" } });
    const denseChanged = adaptDenseGridVolume({
      id: "import:scan",
      label: "Scan",
      sourceLabel: "scan.raw",
      importRef: "scan.raw#frame-1",
      dataset: scalarDataset(new Float32Array([8, 7, 6, 5, 4, 3, 2, 1])),
      grid: denseDataset.grid,
      tracker: denseTracker,
    });
    expect(denseChanged.identity).toMatchObject({ volumeRevision: 2, definitionRevision: 1, sampledGridRevision: 2 });

    const vectorGrid: VectorGrid = {
      dims: [1, 1, 2],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      vectors: new Float32Array([1, 0, 0, 0, 1, 0]),
    };
    const vector = adaptVectorGridVolume({
      id: "vector:vortex",
      label: "Vortex",
      presetId: "vortex",
      grid: vectorGrid,
      tracker: new Map(),
    });
    expect(vector).toMatchObject({ representation: "dense-vector-grid", spatial: { components: 3, elementCount: 6 } });

    const distanceDataset = scalarDataset();
    const distance = adaptVtkDistanceVolume({
      id: "distance:surface-a",
      label: "Surface distance",
      sourceObjectId: "surface-a",
      sourceObjectRevision: 7,
      signed: true,
      dataset: distanceDataset,
      grid: distanceDataset.grid,
      tracker: new Map(),
    });
    expect(distance).toMatchObject({
      representation: "distance-field",
      source: { kind: "vtk-distance", sourceObjectRevision: 7, signed: true },
      provenance: { engine: "VTK", dependencies: [{ objectId: "surface-a", revision: 7 }] },
    });
  });

  it("round-trips spatial metadata while keeping typed arrays behind managed handles", () => {
    const dataset = scalarDataset();
    const volume = adaptDenseGridVolume({
      id: "import:oriented-scan",
      label: "Oriented scan",
      sourceLabel: "scan.nrrd",
      importRef: "scan.nrrd#sha256:test",
      dataset,
      grid: dataset.grid,
      tracker: new Map(),
      centering: "cell",
      direction: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      coordinateSystem: "patient-LPS",
      positionUnits: "mm",
      valueUnits: "HU",
      missingValuePolicy: "nan",
    });
    const store = createVolumeTypedArrayStore();
    store.bind("active-volume", volume.storage, dataset.grid.scalars);

    const serialized = serializeVolumeObject(volume);
    expect(JSON.stringify(serialized)).not.toContain("0,1,2,3,4,5,6,7");
    const restored = restoreVolumeObject(serialized);
    expect(restored.spatial).toEqual(volume.spatial);
    expect(restored.spatial).toMatchObject({
      centering: "cell",
      direction: [0, -1, 0, 1, 0, 0, 0, 0, 1],
      coordinateSystem: "patient-LPS",
      positionUnits: "mm",
      valueUnits: "HU",
      missingValuePolicy: "nan",
    });
    expect(volumeObjectToDataset(restored, store).grid.scalars).toBe(dataset.grid.scalars);
    expect(store.summary()).toEqual({ handles: 1, byteLength: 32, owners: 1 });

    store.releaseOwner("active-volume");
    expect(store.summary()).toEqual({ handles: 0, byteLength: 0, owners: 0 });

    const restoredTracker: VolumeRevisionTracker = new Map();
    hydrateVolumeRevisionTracker(restoredTracker, serialized);
    expect(restoredTracker.get(volume.identity.volumeId)).toMatchObject({
      volumeRevision: volume.identity.volumeRevision,
      definitionRevision: volume.identity.definitionRevision,
      sampledGridRevision: volume.identity.sampledGridRevision,
    });
  });

  it("keeps stale derived results inspectable until detach or delete", () => {
    const tracker: VolumeRevisionTracker = new Map();
    const source = analytic(tracker);
    const result = createVolumeDerivedResult({
      id: "iso:sphere:0",
      label: "Sphere iso 0",
      kind: "isosurface",
      source,
      parameters: { isoValue: 0 },
      now: 10,
    });
    const nextSource = analytic(tracker, scalarDataset(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])), "x*x+y*y+z*z-4", 20);
    const stale = reconcileVolumeDerivedResult(result, nextSource, 21);
    expect(stale).toMatchObject({ state: "stale", sourceVolumeRevision: 1, parameters: { isoValue: 0 } });
    expect(stale.staleReason).toMatch(/advanced from revision 1 to 2/);

    const staleByParameters = reconcileVolumeDerivedResult(result, source, 21, { isoValue: 0.25 });
    expect(staleByParameters).toMatchObject({ state: "stale", staleReason: "Derived-result parameters changed." });

    expect(detachVolumeDerivedResult(stale, 22)).toMatchObject({ state: "detached", staleReason: null });
    expect(deleteVolumeDerivedResult([stale], stale.id)).toEqual([]);
  });
});
