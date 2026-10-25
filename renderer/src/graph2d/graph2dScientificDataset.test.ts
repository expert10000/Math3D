import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument, Graph2DPointTableStore,
  GRAPH2D_SCIENTIFIC_DATASET_CAPABILITY, normalizeGraph2DDocument, parseGraph2DDocument,
  GRAPH2D_SCIENTIFIC_DATASET_SLICE_CAPABILITY,
  inspectGraph2DCompatibility,
  previewGraph2DScientificDataset, previewGraph2DScientificSlice, verifyGraph2DScientificPlane,
  verifyGraph2DScientificVectorPlane,
  verifyGraph2DScientificVolume,
  serializeGraph2DDocument, sha256Checksum,
  type ScientificSceneManifest } from "@math3d/core";

const fixture = () => {
  const values = [0, 1, 0, -1];
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  const resourceHash = sha256Checksum(bytes).slice(7);
  const manifest: ScientificSceneManifest = {
    schema: "scientific-scene/v1", sceneId: "wave", title: "Measured wave",
    source: { producer: "theory-lab", sourceId: "run-1", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: [{ id: "samples", path: "samples.f64", format: "f64le", count: values.length, bytes: bytes.length, sha256: resourceHash }],
    coordinates: [{ id: "time", kind: "cartesian", axes: [{ name: "time", unit: "s" }], origin: [2], spacing: [.25], periodic: [false] }],
    datasets: [{ id: "amplitude", semanticType: "scalar-field", coordinateSystem: "time", shape: [values.length],
      order: "last-axis-fastest", quantity: { name: "Amplitude", unit: "V" }, real: "samples" }], views: [],
  };
  const json = JSON.stringify(manifest), fingerprint = sha256Checksum(new TextEncoder().encode(json)).slice(7);
  return { json, fingerprint, values };
};

describe("GRA-10 verified scientific dataset adapter", () => {
  it("imports immutable verified 1D values as a point series with units and provenance", () => {
    const { json, fingerprint, values } = fixture();
    const preview = previewGraph2DScientificDataset(json, fingerprint, "amplitude", values);
    expect(preview.rows).toEqual([
      { id: "row_1", x: 2, y: 0 }, { id: "row_2", x: 2.25, y: 1 },
      { id: "row_3", x: 2.5, y: 0 }, { id: "row_4", x: 2.75, y: -1 },
    ]);
    expect(preview.origin).toMatchObject({ sceneId: "wave", datasetId: "amplitude", sceneFingerprint: fingerprint,
      sourceProducer: "theory-lab", xName: "time", xUnit: "s", yName: "Amplitude", yUnit: "V" });
    const store = new Graph2DPointTableStore(), table = store.publish(preview.rows);
    const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("scientific-import"), {
      type: "create-point-series", draft: { label: preview.label, table, mode: "line", domain: preview.domain,
        origin: preview.origin, style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } },
    });
    const document = createGraph2DDocument({ ...scene, stableKey: "scientific-import" });
    expect(document.requiredCapabilities).toContain(GRAPH2D_SCIENTIFIC_DATASET_CAPABILITY);
    expect(document.source.objects[0]).toMatchObject({ kind: "point-series", origin: preview.origin });
    expect(normalizeGraph2DDocument(document).ok).toBe(true);
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    expect(store.resolve(table)).toEqual(preview.rows);
  });

  it("rejects changed manifests, missing datasets, tampered values and unsupported dimensions", () => {
    const { json, fingerprint, values } = fixture();
    expect(() => previewGraph2DScientificDataset(json + " ", fingerprint, "amplitude", values)).toThrow(/fingerprint/);
    expect(() => previewGraph2DScientificDataset(json, fingerprint, "missing", values)).toThrow(/one-dimensional/);
    expect(() => previewGraph2DScientificDataset(json, fingerprint, "amplitude", [0, 1, 0, 1])).toThrow(/hash/);
    expect(() => previewGraph2DScientificDataset(json, fingerprint, "amplitude", [0, 1, NaN, -1])).toThrow(/non-finite/);
    const unsupported = JSON.parse(json);
    unsupported.coordinates[0].axes.push({ name: "space", unit: "m" });
    unsupported.coordinates[0].origin.push(0); unsupported.coordinates[0].spacing.push(1); unsupported.coordinates[0].periodic.push(false);
    unsupported.datasets[0].shape = [2, 2];
    const otherJson = JSON.stringify(unsupported), otherHash = sha256Checksum(new TextEncoder().encode(otherJson)).slice(7);
    expect(() => previewGraph2DScientificDataset(otherJson, otherHash, "amplitude", values)).toThrow(/one-dimensional/);
  });

  it("imports each complex and vector component with its own checked resource and provenance", () => {
    const { json, values } = fixture();
    const base = JSON.parse(json) as ScientificSceneManifest;
    const other = [2, 3, 4, 5];
    const bytes = new Uint8Array(other.length * 8), view = new DataView(bytes.buffer);
    other.forEach((value, index) => view.setFloat64(index * 8, value, true));
    const extra = { id: "other", path: "other.f64", format: "f64le" as const, count: other.length,
      bytes: bytes.length, sha256: sha256Checksum(bytes).slice(7) };
    const complex = { ...base, resources: [...base.resources, extra], datasets: [{ ...base.datasets[0]!,
      semanticType: "complex-scalar-field" as const, imaginary: extra.id }] };
    const complexJson = JSON.stringify(complex), complexHash = sha256Checksum(new TextEncoder().encode(complexJson)).slice(7);
    const imaginary = previewGraph2DScientificDataset(complexJson, complexHash, "amplitude", other, "imaginary");
    expect(imaginary.rows.map(row => row.y)).toEqual(other);
    expect(imaginary.origin).toMatchObject({ component: "imaginary", resourceSha256: extra.sha256,
      yName: "Amplitude imaginary" });
    expect(previewGraph2DScientificDataset(complexJson, complexHash, "amplitude", values, "real").origin)
      .toMatchObject({ component: "real", resourceSha256: base.resources[0]!.sha256 });
    expect(() => previewGraph2DScientificDataset(complexJson, complexHash, "amplitude", values, "imaginary"))
      .toThrow(/hash/);

    const vector = { ...base, resources: [...base.resources, extra], datasets: [{
      id: "velocity", semanticType: "vector-field" as const, coordinateSystem: "time", shape: [4],
      order: "last-axis-fastest" as const, quantity: { name: "Velocity", unit: "m/s" },
      components: [{ name: "east", resource: "samples" }, { name: "north", resource: "other" }],
    }] };
    const vectorJson = JSON.stringify(vector), vectorHash = sha256Checksum(new TextEncoder().encode(vectorJson)).slice(7);
    expect(previewGraph2DScientificDataset(vectorJson, vectorHash, "velocity", other, "north").origin)
      .toMatchObject({ component: "north", resourceSha256: extra.sha256, yName: "Velocity north", yUnit: "m/s" });
    expect(() => previewGraph2DScientificDataset(vectorJson, vectorHash, "velocity", other, "east"))
      .toThrow(/hash/);
    expect(() => previewGraph2DScientificDataset(vectorJson, vectorHash, "velocity", other, "missing"))
      .toThrow(/one-dimensional/);
    const invalid = { ...vector, datasets: [{ ...vector.datasets[0]!, components: [
      { name: "east", resource: "samples" }, { name: "east", resource: "other" }] }] };
    const invalidJson = JSON.stringify(invalid), invalidHash = sha256Checksum(new TextEncoder().encode(invalidJson)).slice(7);
    expect(() => previewGraph2DScientificDataset(invalidJson, invalidHash, "velocity", other, "east"))
      .toThrow(/Vector field/);
  });
});

describe("verified multidimensional field planes", () => {
  it("checks a 3D vector component, axis selection and transfer checksum", () => {
    const values = Array.from({ length: 24 }, (_, index) => index);
    const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat64(index * 8, value, true));
    const digest = sha256Checksum(bytes).slice(7);
    const manifest: ScientificSceneManifest = {
      schema: "scientific-scene/v1", sceneId: "volume", title: "Vector volume",
      source: { producer: "lab", sourceId: "run", sourceSchema: "lab/v1", sha256: "a".repeat(64) },
      resources: ["east", "north"].map(id => ({ id, path: `${id}.f64`, format: "f64le" as const,
        count: 24, bytes: 192, sha256: digest })),
      coordinates: [{ id: "space", kind: "cartesian", axes: [{ name: "x", unit: "m" },
        { name: "y", unit: "m" }, { name: "z", unit: "m" }],
        origin: [0, 0, 0], spacing: [1, 1, 1], periodic: [false, false, false] }],
      datasets: [{ id: "wind", semanticType: "vector-field", coordinateSystem: "space", shape: [2, 3, 4],
        order: "last-axis-fastest", quantity: { name: "Wind", unit: "m/s" },
        components: [{ name: "east", resource: "east" }, { name: "north", resource: "north" }] }], views: [],
    };
    const json = JSON.stringify(manifest), fingerprint = sha256Checksum(new TextEncoder().encode(json)).slice(7);
    const selected = [3, 7, 11, 15, 19, 23];
    const planeBytes = new Uint8Array(selected.length * 8), planeView = new DataView(planeBytes.buffer);
    selected.forEach((value, index) => planeView.setFloat64(index * 8, value, true));
    const plane = { fingerprint, datasetId: "wind", component: "north", sourceShape: [2, 3, 4],
      normalAxis: 2 as const, fixedIndex: 3, planeAxes: [0, 1] as [number, number],
      shape: [2, 3] as [number, number], resourceSha256: digest,
      planeSha256: sha256Checksum(planeBytes).slice(7), values: selected };
    expect(verifyGraph2DScientificPlane(json, fingerprint, plane)).toBe(plane);
    expect(() => verifyGraph2DScientificPlane(json, fingerprint, { ...plane, values: [...selected.slice(0, 5), 22] }))
      .toThrow(/checksum/);
    expect(() => verifyGraph2DScientificPlane(json, fingerprint, { ...plane, component: "wrong" }))
      .toThrow(/verified field plane/);
    expect(() => verifyGraph2DScientificPlane(json, fingerprint, { ...plane, normalAxis: 1 }))
      .toThrow(/verified field plane/);
    const volume = { fingerprint, datasetId: "wind", component: "north",
      sourceShape: [2, 3, 4] as [number, number, number], sampleShape: [2, 3, 4] as [number, number, number],
      resourceSha256: digest, sampleSha256: digest, values };
    expect(verifyGraph2DScientificVolume(json, fingerprint, volume)).toBe(volume);
    expect(() => verifyGraph2DScientificVolume(json, fingerprint, { ...volume, values: [...values.slice(0, 23), 50] }))
      .toThrow(/checksum/);
  });
});

const gridFixture = (shape: [number, number] = [3, 4]) => {
  const values = Array.from({ length: shape[0] * shape[1] }, (_, index) => index);
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  const resourceSha256 = sha256Checksum(bytes).slice(7);
  const manifest: ScientificSceneManifest = {
    schema: "scientific-scene/v1", sceneId: "grid", title: "Grid",
    source: { producer: "theory-lab", sourceId: "grid-run", sourceSchema: "theory-data/v1", sha256: "a".repeat(64) },
    resources: [{ id: "samples", path: "samples.f64", format: "f64le", count: values.length,
      bytes: bytes.length, sha256: resourceSha256 }],
    coordinates: [{ id: "plane", kind: "cartesian", axes: [{ name: "time", unit: "s" }, { name: "distance", unit: "m" }],
      origin: [2, 10], spacing: [.5, 2], periodic: [false, false] }],
    datasets: [{ id: "amplitude", semanticType: "scalar-field", coordinateSystem: "plane", shape,
      order: "last-axis-fastest", quantity: { name: "Amplitude", unit: "V" }, real: "samples" }], views: [],
  };
  const json = JSON.stringify(manifest), fingerprint = sha256Checksum(new TextEncoder().encode(json)).slice(7);
  const line = (varyingAxis: 0 | 1, fixedIndex: number) => {
    const selected = Array.from({ length: shape[varyingAxis] }, (_, index) =>
      values[varyingAxis === 0 ? index * shape[1] + fixedIndex : fixedIndex * shape[1] + index]!);
    const lineBytes = new Uint8Array(selected.length * 8), lineView = new DataView(lineBytes.buffer);
    selected.forEach((value, index) => lineView.setFloat64(index * 8, value, true));
    return { fingerprint, datasetId: "amplitude", varyingAxis, fixedIndex, shape, resourceSha256,
      sliceSha256: sha256Checksum(lineBytes).slice(7), values: selected };
  };
  return { json, fingerprint, line };
};

describe("GRA-10 explicit 2D scalar lines", () => {
  it("keeps complex and vector grid components separate with checked hashes and labels", () => {
    const base = gridFixture(), source = JSON.parse(base.json) as ScientificSceneManifest;
    const values = Array.from({ length: 12 }, (_, index) => index + 100);
    const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat64(index * 8, value, true));
    const resourceSha256 = sha256Checksum(bytes).slice(7);
    const extra = { id: "other", path: "other.f64", format: "f64le" as const,
      count: 12, bytes: bytes.length, sha256: resourceSha256 };
    const selected = [101, 105, 109], lineBytes = new Uint8Array(selected.length * 8), lineView = new DataView(lineBytes.buffer);
    selected.forEach((value, index) => lineView.setFloat64(index * 8, value, true));
    const makeLine = (fingerprint: string, component: string) => ({ fingerprint, datasetId: "amplitude", component,
      varyingAxis: 0 as const, fixedIndex: 1, shape: [3, 4], resourceSha256,
      sliceSha256: sha256Checksum(lineBytes).slice(7), values: selected });
    const complex = { ...source, resources: [...source.resources, extra], datasets: [{ ...source.datasets[0]!,
      semanticType: "complex-scalar-field" as const, imaginary: "other" }] };
    const complexJson = JSON.stringify(complex), complexHash = sha256Checksum(new TextEncoder().encode(complexJson)).slice(7);
    const imaginary = previewGraph2DScientificSlice(complexJson, complexHash, makeLine(complexHash, "imaginary"));
    expect(imaginary.label).toBe("Amplitude imaginary · distance = 12 m");
    expect(imaginary.origin).toMatchObject({ component: "imaginary", resourceSha256 });
    expect(() => previewGraph2DScientificSlice(complexJson, complexHash, makeLine(complexHash, "real"))).toThrow(/verified/);
    const vector = { ...source, resources: [...source.resources, extra], datasets: [{
      id: "amplitude", semanticType: "vector-field" as const, coordinateSystem: "plane", shape: [3, 4],
      order: "last-axis-fastest" as const, quantity: { name: "Velocity", unit: "m/s" },
      components: [{ name: "east", resource: "samples" }, { name: "north", resource: "other" }],
    }] };
    const vectorJson = JSON.stringify(vector), vectorHash = sha256Checksum(new TextEncoder().encode(vectorJson)).slice(7);
    const north = previewGraph2DScientificSlice(vectorJson, vectorHash, makeLine(vectorHash, "north"));
    expect(north.label).toBe("Velocity north · distance = 12 m");
    expect(north.rows.map(row => row.y)).toEqual(selected);
    const eastValues = Array.from({ length: 12 }, (_, index) => index);
    const eastBytes = new Uint8Array(12 * 8), eastView = new DataView(eastBytes.buffer);
    eastValues.forEach((value, index) => eastView.setFloat64(index * 8, value, true));
    const shared = { fingerprint: vectorHash, datasetId: "amplitude", sourceShape: [3, 4],
      normalAxis: null, fixedIndex: null, planeAxes: [0, 1] as [number, number], shape: [3, 4] as [number, number] };
    const eastPlane = { ...shared, component: "east", resourceSha256: source.resources[0]!.sha256,
      planeSha256: sha256Checksum(eastBytes).slice(7), values: eastValues };
    const northPlane = { ...shared, component: "north", resourceSha256,
      planeSha256: resourceSha256, values };
    expect(verifyGraph2DScientificVectorPlane(vectorJson, vectorHash, [eastPlane, northPlane]))
      .toEqual([eastPlane, northPlane]);
    expect(() => verifyGraph2DScientificVectorPlane(vectorJson, vectorHash,
      [eastPlane, { ...northPlane, values: [...values.slice(0, 11), 999] }])).toThrow(/checksum/);
    expect(() => verifyGraph2DScientificVectorPlane(vectorJson, vectorHash,
      [northPlane, eastPlane])).toThrow(/aligned components/);
  });

  it("extracts both non-square directions, coordinates and saved slice provenance", () => {
    const { json, fingerprint, line } = gridFixture();
    const column = previewGraph2DScientificSlice(json, fingerprint, line(0, 1));
    expect(column.label).toBe("Amplitude · distance = 12 m");
    expect(column.rows.map(row => [row.x, row.y])).toEqual([[2, 1], [2.5, 5], [3, 9]]);
    expect(column.origin).toMatchObject({ xName: "time", xUnit: "s", yName: "Amplitude", yUnit: "V",
      slice: { varyingAxis: 0, fixedIndex: 1, fixedCoordinate: 12, fixedName: "distance", fixedUnit: "m" } });
    const row = previewGraph2DScientificSlice(json, fingerprint, line(1, 1));
    expect(row.label).toBe("Amplitude · time = 2.5 s");
    expect(row.rows.map(point => [point.x, point.y])).toEqual([[10, 4], [12, 5], [14, 6], [16, 7]]);
    expect(row.origin.slice).toEqual({ varyingAxis: 1, fixedIndex: 1, fixedCoordinate: 2.5,
      fixedName: "time", fixedUnit: "s" });
    expect(previewGraph2DScientificSlice(json, fingerprint, line(0, 0)).rows.map(point => point.y)).toEqual([0, 4, 8]);
    expect(previewGraph2DScientificSlice(json, fingerprint, line(0, 3)).rows.map(point => point.y)).toEqual([3, 7, 11]);
    const store = new Graph2DPointTableStore(), table = store.publish(column.rows);
    const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("grid-import"), {
      type: "create-point-series", draft: { label: column.label, table, mode: "line", domain: column.domain,
        origin: column.origin, style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } },
    });
    const document = createGraph2DDocument({ ...scene, stableKey: "grid-import" });
    expect(document.requiredCapabilities).toContain(GRAPH2D_SCIENTIFIC_DATASET_SLICE_CAPABILITY);
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
  });

  it("rejects wrong fingerprints, selections, hashes, values and singleton varying axes", () => {
    const { json, fingerprint, line } = gridFixture();
    expect(() => previewGraph2DScientificSlice(json + " ", fingerprint, line(0, 1))).toThrow(/fingerprint/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), fixedIndex: 4 })).toThrow(/outside/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), varyingAxis: 2 as 0 })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), shape: [4, 3] })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), resourceSha256: "b".repeat(64) })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), values: [1, 5, 8] })).toThrow(/checksum/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), values: [1, NaN, 9] })).toThrow(/non-finite/);
    const singleton = gridFixture([1, 4]);
    expect(() => previewGraph2DScientificSlice(singleton.json, singleton.fingerprint, singleton.line(0, 0)))
      .toThrow(/one varying axis/);
    expect(previewGraph2DScientificSlice(singleton.json, singleton.fingerprint, singleton.line(1, 0)).rows).toHaveLength(4);
    const malformed = JSON.parse(json);
    malformed.datasets[0].shape = [3, 5];
    const malformedJson = JSON.stringify(malformed);
    expect(() => previewGraph2DScientificSlice(malformedJson,
      sha256Checksum(new TextEncoder().encode(malformedJson)).slice(7), line(0, 1))).toThrow();
  });

  it("accepts a 256² verified grid while copying only 256 rows", () => {
    const { json, fingerprint, line } = gridFixture([256, 256]);
    expect(previewGraph2DScientificSlice(json, fingerprint, line(0, 255)).rows).toHaveLength(256);
  });
});
