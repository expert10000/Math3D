import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument, Graph2DPointTableStore,
  GRAPH2D_SCIENTIFIC_DATASET_CAPABILITY, normalizeGraph2DDocument, parseGraph2DDocument,
  GRAPH2D_SCIENTIFIC_DATASET_SLICE_CAPABILITY,
  inspectGraph2DCompatibility,
  previewGraph2DScientificDataset, previewGraph2DScientificSlice, serializeGraph2DDocument, sha256Checksum,
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
  it("extracts both non-square directions, coordinates and saved slice provenance", () => {
    const { json, fingerprint, line } = gridFixture();
    const column = previewGraph2DScientificSlice(json, fingerprint, line(0, 1));
    expect(column.rows.map(row => [row.x, row.y])).toEqual([[2, 1], [2.5, 5], [3, 9]]);
    expect(column.origin).toMatchObject({ xName: "time", xUnit: "s", yName: "Amplitude", yUnit: "V",
      slice: { varyingAxis: 0, fixedIndex: 1, fixedCoordinate: 12, fixedName: "distance", fixedUnit: "m" } });
    const row = previewGraph2DScientificSlice(json, fingerprint, line(1, 1));
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
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), fixedIndex: 4 })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), varyingAxis: 2 as 0 })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), shape: [4, 3] })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), resourceSha256: "b".repeat(64) })).toThrow(/verified line/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), values: [1, 5, 8] })).toThrow(/checksum/);
    expect(() => previewGraph2DScientificSlice(json, fingerprint, { ...line(0, 1), values: [1, NaN, 9] })).toThrow(/non-finite/);
    const singleton = gridFixture([1, 4]);
    expect(() => previewGraph2DScientificSlice(singleton.json, singleton.fingerprint, singleton.line(0, 0)))
      .toThrow(/verified line/);
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
