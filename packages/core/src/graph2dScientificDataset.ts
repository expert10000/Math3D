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

export type Graph2DScientificPlane = Readonly<{ fingerprint: string; datasetId: string; component: string;
  sourceShape: readonly number[]; normalAxis: 0 | 1 | 2 | null; fixedIndex: number | null;
  planeAxes: readonly [number, number]; shape: readonly [number, number];
  resourceSha256: string; planeSha256: string; values: readonly number[] }>;

export type Graph2DScientificVolume = Readonly<{ fingerprint: string; datasetId: string; component: string;
  sourceShape: readonly [number, number, number]; sampleShape: readonly [number, number, number];
  resourceSha256: string; sampleSha256: string; values: readonly number[] }>;

export function verifyGraph2DScientificVolume(manifestJson: string, fingerprint: string,
  volume: Graph2DScientificVolume): Graph2DScientificVolume {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || volume.fingerprint !== fingerprint ||
      sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}`)
    throw new TypeError("Scientific manifest fingerprint changed or is invalid.");
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const dataset = checked.value.datasets.find(item => item.id === volume.datasetId);
  const resourceId = dataset?.semanticType === "vector-field" ? dataset.components?.find(part => part.name === volume.component)?.resource :
    dataset?.semanticType === "complex-scalar-field" ? volume.component === "real" ? dataset.real :
      volume.component === "imaginary" ? dataset.imaginary : undefined : volume.component === "scalar" ? dataset?.real : undefined;
  const resource = checked.value.resources.find(item => item.id === resourceId);
  if (!dataset || dataset.shape.length !== 3 || !resource ||
      volume.sourceShape.length !== 3 || volume.sourceShape.some((size, axis) => size !== dataset.shape[axis]) ||
      volume.sampleShape.length !== 3 || volume.sampleShape.some((size, axis) => size !== Math.min(dataset.shape[axis]!, 32)) ||
      volume.values.length !== volume.sampleShape[0] * volume.sampleShape[1] * volume.sampleShape[2] ||
      volume.values.length > 32 ** 3 || volume.resourceSha256 !== resource.sha256 ||
      !/^[a-f0-9]{64}$/.test(volume.sampleSha256))
    throw new TypeError("Choose a verified volume and component.");
  const bytes = new Uint8Array(volume.values.length * 8), view = new DataView(bytes.buffer);
  volume.values.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError("Scientific volume contains a non-finite value.");
    view.setFloat64(index * 8, value, true);
  });
  if (sha256Checksum(bytes) !== `sha256:${volume.sampleSha256}`)
    throw new TypeError("Scientific volume sample checksum changed.");
  return volume;
}

/** Verify a re-read field plane against the manifest and its transfer checksum before display. */
export function verifyGraph2DScientificPlane(manifestJson: string, fingerprint: string,
  plane: Graph2DScientificPlane): Graph2DScientificPlane {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || plane.fingerprint !== fingerprint ||
      sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}`)
    throw new TypeError("Scientific manifest fingerprint changed or is invalid.");
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const dataset = checked.value.datasets.find(item => item.id === plane.datasetId);
  const coordinate = checked.value.coordinates.find(item => item.id === dataset?.coordinateSystem);
  const resourceId = dataset?.semanticType === "vector-field" ? dataset.components?.find(part => part.name === plane.component)?.resource :
    dataset?.semanticType === "complex-scalar-field" ? plane.component === "real" ? dataset.real :
      plane.component === "imaginary" ? dataset.imaginary : undefined : plane.component === "scalar" ? dataset?.real : undefined;
  const resource = checked.value.resources.find(item => item.id === resourceId);
  const rank = dataset?.shape.length ?? 0;
  const axes = rank === 2 ? [0, 1] : [0, 1, 2].filter(axis => axis !== plane.normalAxis);
  if (!dataset || !coordinate || !resource || (rank !== 2 && rank !== 3) ||
      plane.sourceShape.length !== rank || plane.sourceShape.some((size, axis) => size !== dataset.shape[axis]) ||
      (rank === 2 ? plane.normalAxis !== null || plane.fixedIndex !== null :
        !Number.isInteger(plane.normalAxis) || plane.normalAxis! < 0 || plane.normalAxis! > 2 ||
        !Number.isInteger(plane.fixedIndex) || plane.fixedIndex! < 0 || plane.fixedIndex! >= dataset.shape[plane.normalAxis!]!) ||
      plane.planeAxes.length !== 2 || plane.planeAxes.some((axis, index) => axis !== axes[index]) ||
      plane.shape.length !== 2 || plane.shape.some((size, index) => size !== dataset.shape[axes[index]!]) ||
      plane.values.length !== plane.shape[0] * plane.shape[1] || plane.values.length > 256 * 256 ||
      plane.resourceSha256 !== resource.sha256 || !/^[a-f0-9]{64}$/.test(plane.planeSha256))
    throw new TypeError("Choose a verified field plane and component.");
  const bytes = new Uint8Array(plane.values.length * 8), view = new DataView(bytes.buffer);
  plane.values.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new TypeError("Scientific field contains a non-finite value.");
    view.setFloat64(index * 8, value, true);
  });
  if (sha256Checksum(bytes) !== `sha256:${plane.planeSha256}`)
    throw new TypeError("Scientific field plane checksum changed.");
  return plane;
}

/** Reject a partial or mismatched vector transfer before either component is rendered. */
export function verifyGraph2DScientificVectorPlane(manifestJson: string, fingerprint: string,
  planes: readonly [Graph2DScientificPlane, Graph2DScientificPlane]): readonly [Graph2DScientificPlane, Graph2DScientificPlane] {
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const [first, second] = planes;
  const dataset = checked.value.datasets.find(item => item.id === first.datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 2 || dataset.components?.length !== 2 ||
      first.datasetId !== second.datasetId || first.component === second.component ||
      first.component !== dataset.components[0]?.name || second.component !== dataset.components[1]?.name ||
      first.normalAxis !== null || second.normalAxis !== null || first.fixedIndex !== null || second.fixedIndex !== null ||
      first.shape.some((size, axis) => size !== second.shape[axis]) ||
      first.planeAxes.some((axis, index) => axis !== second.planeAxes[index]))
    throw new TypeError("Choose both aligned components of one verified 2D vector field.");
  verifyGraph2DScientificPlane(manifestJson, fingerprint, first);
  verifyGraph2DScientificPlane(manifestJson, fingerprint, second);
  for (let index = 0; index < first.values.length; index++) {
    if (!Number.isFinite(Math.hypot(first.values[index]!, second.values[index]!)))
      throw new TypeError("Scientific vector magnitude exceeds the finite display range.");
  }
  return planes;
}

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
  line: Readonly<{ datasetId: string; component?: string; varyingAxis: 0 | 1; fixedIndex: number;
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
  const component = line.component ?? "scalar";
  const resourceId = dataset?.semanticType === "vector-field" ? dataset.components?.find(part => part.name === component)?.resource :
    dataset?.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset?.real : undefined;
  const resource = manifest.resources.find(item => item.id === resourceId);
  if (!dataset || !coordinate || !resource ||
      dataset.shape.length !== 2 || coordinate.axes.length !== 2 ||
      line.shape.length !== 2 || line.shape.some((size, index) => size !== dataset.shape[index]) ||
      dataset.shape.some(size => size < 1 || size > 256) ||
      (line.varyingAxis !== 0 && line.varyingAxis !== 1) ||
      dataset.shape[line.varyingAxis]! < 2 || !Number.isSafeInteger(line.fixedIndex) ||
      line.fixedIndex < 0 || line.fixedIndex >= dataset.shape[1 - line.varyingAxis]! ||
      line.values.length !== dataset.shape[line.varyingAxis] ||
      line.resourceSha256 !== resource.sha256 || !/^[a-f0-9]{64}$/.test(line.sliceSha256))
    throw new TypeError("Choose a verified line and component from a two-dimensional grid.");
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
  const slice = { varyingAxis: line.varyingAxis, fixedIndex: line.fixedIndex, fixedCoordinate,
    fixedName: coordinate.axes[fixedAxis]!.name, fixedUnit: coordinate.axes[fixedAxis]!.unit };
  const origin: Graph2DScientificDatasetOrigin = {
    schema: "scientific-scene/v1", sceneId: manifest.sceneId, datasetId: dataset.id,
    ...(component === "scalar" ? {} : { component }),
    sceneFingerprint: fingerprint, resourceSha256: resource.sha256,
    sourceProducer: manifest.source.producer, sourceId: manifest.source.sourceId,
    sourceSchema: manifest.source.sourceSchema, sourceSha256: manifest.source.sha256,
    xName: axis.name, xUnit: axis.unit,
    yName: `${dataset.quantity.name.slice(0, 160 - (component === "scalar" ? 0 : component.length + 1))}${component === "scalar" ? "" : ` ${component}`}`,
    yUnit: dataset.quantity.unit,
    slice,
  };
  const suffix = ` = ${fixedCoordinate} ${slice.fixedUnit}`.trimEnd();
  const fixedName = slice.fixedName.slice(0, Math.max(1, 160 - suffix.length - 3 - Math.min(origin.yName.length, 40)));
  const label = `${origin.yName.slice(0, Math.max(1, 160 - fixedName.length - suffix.length - 3))} · ${fixedName}${suffix}`;
  return { label, rows, domain: graph2DPointDomain(rows), origin };
}
