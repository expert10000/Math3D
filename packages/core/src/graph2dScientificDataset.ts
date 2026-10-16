import { sha256Checksum } from "./documentIdentity";
import { graph2DPointDomain, type Graph2DPointRow } from "./graph2dPointSeries";
import { parseScientificSceneManifest } from "./scientificSceneManifest";
import type { Graph2DScientificDatasetOrigin } from "./graph2dDocument";

export type Graph2DScientificDatasetPreview = Readonly<{
  label: string;
  rows: readonly Graph2DPointRow[];
  domain: ReturnType<typeof graph2DPointDomain>;
  origin: Graph2DScientificDatasetOrigin;
}>;

/** Verify one bounded 1D component before copying its values into a Graph point table. */
export function previewGraph2DScientificDataset(manifestJson: string, fingerprint: string,
  datasetId: string, values: readonly number[], component = "scalar"): Graph2DScientificDatasetPreview {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}`)
    throw new TypeError("Scientific manifest fingerprint changed or is invalid.");
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const manifest = checked.value;
  const dataset = manifest.datasets.find(item => item.id === datasetId);
  const coordinate = manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  const part = dataset?.semanticType === "vector-field" ? dataset.components?.find(item => item.name === component) :
    dataset?.semanticType === "complex-scalar-field" ?
      (component === "real" ? { name: component, resource: dataset.real } :
        component === "imaginary" ? { name: component, resource: dataset.imaginary } : undefined) :
      component === "scalar" ? { name: component, resource: dataset?.real } : undefined;
  const resource = manifest.resources.find(item => item.id === part?.resource);
  if (!dataset || !coordinate || !resource || dataset.shape.length !== 1 ||
      coordinate.axes.length !== 1 || values.length !== dataset.shape[0] || values.length < 2 ||
      values.length > 256) throw new TypeError("Choose a verified one-dimensional component with 2–256 samples.");
  const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError("Scientific dataset contains a non-finite value.");
    view.setFloat64(index * 8, value, true);
  });
  if (sha256Checksum(bytes) !== `sha256:${resource.sha256}`)
    throw new TypeError("Scientific dataset resource hash does not match the declared bytes.");
  const rows = values.map((value, index) => ({ id: `row_${index + 1}`,
    x: coordinate.origin[0]! + coordinate.spacing[0]! * index, y: value }));
  const componentSuffix = component === "scalar" ? "" : ` ${component}`;
  const yName = `${dataset.quantity.name.slice(0, 160 - componentSuffix.length)}${componentSuffix}`;
  const origin: Graph2DScientificDatasetOrigin = {
    schema: "scientific-scene/v1", sceneId: manifest.sceneId, datasetId: dataset.id,
    ...(component === "scalar" ? {} : { component }),
    sceneFingerprint: fingerprint, resourceSha256: resource.sha256,
    sourceProducer: manifest.source.producer, sourceId: manifest.source.sourceId,
    sourceSchema: manifest.source.sourceSchema, sourceSha256: manifest.source.sha256,
    xName: coordinate.axes[0]!.name, xUnit: coordinate.axes[0]!.unit,
    yName,
    yUnit: dataset.quantity.unit,
  };
  return { label: origin.yName, rows, domain: graph2DPointDomain(rows), origin };
}

/** Validate a selected 2D line and bind its provenance to the verified full-grid resource. */
export function previewGraph2DScientificSlice(manifestJson: string, fingerprint: string,
  line: Readonly<{ datasetId: string; varyingAxis: 0 | 1; fixedIndex: number;
    shape: readonly number[]; resourceSha256: string; sliceSha256: string; values: readonly number[];
    fingerprint: string }>): Graph2DScientificDatasetPreview {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || line.fingerprint !== fingerprint ||
      sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}`)
    throw new TypeError("Scientific manifest fingerprint changed or is invalid.");
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const manifest = checked.value;
  const dataset = manifest.datasets.find(item => item.id === line.datasetId);
  const coordinate = manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  const resource = manifest.resources.find(item => item.id === dataset?.real);
  if (!dataset || dataset.semanticType !== "scalar-field" || !coordinate || !resource ||
      dataset.shape.length !== 2 || coordinate.axes.length !== 2 ||
      line.shape.length !== 2 || line.shape.some((size, index) => size !== dataset.shape[index]) ||
      dataset.shape.some(size => size < 1 || size > 256) ||
      (line.varyingAxis !== 0 && line.varyingAxis !== 1) ||
      dataset.shape[line.varyingAxis]! < 2 || !Number.isSafeInteger(line.fixedIndex) ||
      line.fixedIndex < 0 || line.fixedIndex >= dataset.shape[1 - line.varyingAxis]! ||
      line.values.length !== dataset.shape[line.varyingAxis] ||
      line.resourceSha256 !== resource.sha256 || !/^[a-f0-9]{64}$/.test(line.sliceSha256))
    throw new TypeError("Choose a verified line from a two-dimensional scalar grid.");
  const bytes = new Uint8Array(line.values.length * 8), view = new DataView(bytes.buffer);
  line.values.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError("Scientific line contains a non-finite value.");
    view.setFloat64(index * 8, value, true);
  });
  if (sha256Checksum(bytes) !== `sha256:${line.sliceSha256}`)
    throw new TypeError("Scientific line checksum changed.");
  const axis = coordinate.axes[line.varyingAxis]!;
  const fixedAxis = 1 - line.varyingAxis;
  const fixedCoordinate = coordinate.origin[fixedAxis]! + coordinate.spacing[fixedAxis]! * line.fixedIndex;
  if (!Number.isFinite(fixedCoordinate) || Math.abs(fixedCoordinate) > 1e12)
    throw new TypeError("Scientific fixed coordinate is out of range.");
  const rows = line.values.map((value, index) => ({ id: `row_${index + 1}`,
    x: coordinate.origin[line.varyingAxis]! + coordinate.spacing[line.varyingAxis]! * index, y: value }));
  if (rows.some(row => !Number.isFinite(row.x))) throw new TypeError("Scientific line coordinate is not finite.");
  const origin: Graph2DScientificDatasetOrigin = {
    schema: "scientific-scene/v1", sceneId: manifest.sceneId, datasetId: dataset.id,
    sceneFingerprint: fingerprint, resourceSha256: resource.sha256,
    sourceProducer: manifest.source.producer, sourceId: manifest.source.sourceId,
    sourceSchema: manifest.source.sourceSchema, sourceSha256: manifest.source.sha256,
    xName: axis.name, xUnit: axis.unit, yName: dataset.quantity.name, yUnit: dataset.quantity.unit,
    slice: { varyingAxis: line.varyingAxis, fixedIndex: line.fixedIndex, fixedCoordinate,
      fixedName: coordinate.axes[fixedAxis]!.name, fixedUnit: coordinate.axes[fixedAxis]!.unit },
  };
  return { label: origin.yName, rows, domain: graph2DPointDomain(rows), origin };
}
