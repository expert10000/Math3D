type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Small, platform-neutral metadata contract. Numerical values stay in verified binary resources. */
export const SCIENTIFIC_SCENE_SCHEMA = "scientific-scene/v1" as const;
export const MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES = 64 * 1024;
export const MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES = 16 * 1024 * 1024;

export type ScientificDatasetReference = Readonly<{
  id: string;
  path: string;
  format: "f64le";
  count: number;
  bytes: number;
  sha256: string;
}>;

export type ScientificCoordinateSystem = Readonly<{
  id: string;
  kind: "cartesian" | "reciprocal" | "index";
  axes: readonly Readonly<{ name: string; unit: string }>[];
  origin: readonly number[];
  spacing: readonly number[];
  periodic: readonly boolean[];
}>;

export type ScientificSceneDataset = Readonly<{
  id: string;
  semanticType: "scalar-field" | "complex-scalar-field";
  coordinateSystem: string;
  shape: readonly number[];
  order: "last-axis-fastest";
  quantity: Readonly<{ name: string; unit: string; symbol?: string }>;
  real: string;
  imaginary?: string;
}>;

export type ScientificSceneView = Readonly<{
  id: string;
  label: string;
  dataset: string;
  renderer: "slice" | "height-surface";
  operation: "identity" | "complex-density/v1";
  axis?: number;
}>;

export type ScientificSceneManifest = Readonly<{
  schema: typeof SCIENTIFIC_SCENE_SCHEMA;
  sceneId: string;
  title: string;
  source: Readonly<{ producer: string; sourceId: string; sourceSchema: string; sha256: string }>;
  resources: readonly ScientificDatasetReference[];
  coordinates: readonly ScientificCoordinateSystem[];
  datasets: readonly ScientificSceneDataset[];
  views: readonly ScientificSceneView[];
}>;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every(key => Object.hasOwn(value, key)) &&
  Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const cleanText = (value: unknown, max = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max &&
  value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(value);
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positiveInteger = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= max;
const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

/** Validates descriptors only; the importer must separately verify every referenced byte/hash. */
export function normalizeScientificSceneManifest(value: unknown): ValidationResult<ScientificSceneManifest> {
  const fail = (reason: string): ValidationResult<ScientificSceneManifest> => ({ ok: false, errors: [reason] });
  let json: string;
  try {
    json = JSON.stringify(value);
    if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES)
      return fail("Scientific scene manifest exceeds its metadata budget.");
  } catch { return fail("Scientific scene manifest is not JSON data."); }
  if (!record(value) || !exact(value, ["schema", "sceneId", "title", "source", "resources", "coordinates", "datasets", "views"]) ||
    value.schema !== SCIENTIFIC_SCENE_SCHEMA || !id(value.sceneId) || !cleanText(value.title))
    return fail("Invalid scientific scene envelope or unsupported version.");

  const source = value.source;
  if (!record(source) || !exact(source, ["producer", "sourceId", "sourceSchema", "sha256"]) ||
    !id(source.producer) || !id(source.sourceId) ||
    typeof source.sourceSchema !== "string" || !/^[A-Za-z][A-Za-z0-9._-]*\/v[1-9][0-9]*$/.test(source.sourceSchema) ||
    !sha(source.sha256))
    return fail("Invalid scientific scene source descriptor.");

  const resources = value.resources;
  if (!Array.isArray(resources) || resources.length < 1 || resources.length > 16) return fail("Invalid resource list.");
  let totalBytes = 0;
  for (const resource of resources) {
    if (!record(resource) || !exact(resource, ["id", "path", "format", "count", "bytes", "sha256"]) ||
      !id(resource.id) || !cleanText(resource.path, 128) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.f64$/.test(resource.path) ||
      resource.path.includes("..") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(resource.path) ||
      resource.format !== "f64le" ||
      !positiveInteger(resource.count, 1_000_000) || !positiveInteger(resource.bytes, MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES) ||
      resource.bytes !== resource.count * 8 || !sha(resource.sha256)) return fail("Invalid binary resource descriptor.");
    totalBytes += resource.bytes;
  }
  if (totalBytes > MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES ||
    !unique(resources.map(resource => resource.id)) || !unique(resources.map(resource => resource.path)))
    return fail("Duplicate or over-budget binary resources.");

  const coordinates = value.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 1 || coordinates.length > 8 ||
    !unique(coordinates.map(coordinate => record(coordinate) ? String(coordinate.id) : "")))
    return fail("Invalid coordinate systems.");
  for (const coordinate of coordinates) {
    if (!record(coordinate) || !exact(coordinate, ["id", "kind", "axes", "origin", "spacing", "periodic"]) ||
      !id(coordinate.id) || !["cartesian", "reciprocal", "index"].includes(String(coordinate.kind)) ||
      !Array.isArray(coordinate.axes) || coordinate.axes.length < 1 || coordinate.axes.length > 3 ||
      !Array.isArray(coordinate.origin) || !Array.isArray(coordinate.spacing) || !Array.isArray(coordinate.periodic) ||
      coordinate.origin.length !== coordinate.axes.length || coordinate.spacing.length !== coordinate.axes.length ||
      coordinate.periodic.length !== coordinate.axes.length ||
      !coordinate.origin.every((origin: unknown) => finite(origin) && Math.abs(origin) <= 1_000_000) ||
      !coordinate.spacing.every((spacing: unknown) => finite(spacing) && spacing > 0 && spacing <= 1_000_000) ||
      !coordinate.periodic.every((periodic: unknown) => typeof periodic === "boolean")) return fail("Invalid coordinate system.");
    const names: string[] = [];
    for (const axis of coordinate.axes) {
      if (!record(axis) || !exact(axis, ["name", "unit"]) || !id(axis.name) || !cleanText(axis.unit, 80))
        return fail("Invalid coordinate axis or unit.");
      names.push(axis.name);
    }
    if (!unique(names)) return fail("Duplicate coordinate axis.");
  }

  const datasets = value.datasets;
  if (!Array.isArray(datasets) || datasets.length < 1 || datasets.length > 16 ||
    !unique(datasets.map(dataset => record(dataset) ? String(dataset.id) : ""))) return fail("Invalid dataset list.");
  const resourceById = new Map(resources.map(resource => [resource.id, resource]));
  const coordinateById = new Map(coordinates.map(coordinate => [coordinate.id, coordinate]));
  const usedResources = new Set<string>();
  for (const dataset of datasets) {
    if (!record(dataset) || !exact(dataset, ["id", "semanticType", "coordinateSystem", "shape", "order", "quantity", "real"], ["imaginary"]) ||
      !id(dataset.id) || !["scalar-field", "complex-scalar-field"].includes(String(dataset.semanticType)) ||
      !id(dataset.coordinateSystem) || !coordinateById.has(dataset.coordinateSystem) ||
      !Array.isArray(dataset.shape) || dataset.shape.length !== coordinateById.get(dataset.coordinateSystem)!.axes.length ||
      !dataset.shape.every((count: unknown) => positiveInteger(count, 256)) ||
      dataset.order !== "last-axis-fastest" || !record(dataset.quantity) ||
      !exact(dataset.quantity, ["name", "unit"], ["symbol"]) ||
      !cleanText(dataset.quantity.name) || !cleanText(dataset.quantity.unit, 80) ||
      (dataset.quantity.symbol !== undefined && !cleanText(dataset.quantity.symbol, 32)) ||
      !id(dataset.real) || !resourceById.has(dataset.real)) return fail("Invalid scientific dataset.");
    const count = dataset.shape.reduce((product: number, size: number) => product * size, 1);
    if (count !== resourceById.get(dataset.real)!.count) return fail("Dataset shape does not match its binary resource.");
    const coordinate = coordinateById.get(dataset.coordinateSystem)!;
    if (dataset.shape.some((size: number, axis: number) =>
      Math.abs(coordinate.origin[axis] + coordinate.spacing[axis] * (size - 1)) > 1_000_000))
      return fail("Dataset coordinate extent exceeds the bounded scene domain.");
    usedResources.add(dataset.real);
    if (dataset.semanticType === "complex-scalar-field") {
      if (!id(dataset.imaginary) || dataset.imaginary === dataset.real || resourceById.get(dataset.imaginary)?.count !== count)
        return fail("Complex field requires matching real and imaginary resources.");
      usedResources.add(dataset.imaginary);
    } else if (Object.hasOwn(dataset, "imaginary")) return fail("Scalar field cannot declare imaginary values.");
  }
  if (usedResources.size !== resources.length) return fail("Unreferenced binary resource.");

  const views = value.views;
  if (!Array.isArray(views) || views.length > 16 ||
    !unique(views.map(view => record(view) ? String(view.id) : ""))) return fail("Invalid scene views.");
  const datasetById = new Map(datasets.map(dataset => [dataset.id, dataset]));
  for (const view of views) {
    if (!record(view) || !exact(view, ["id", "label", "dataset", "renderer", "operation"], ["axis"]) ||
      !id(view.id) || !cleanText(view.label) || !id(view.dataset) || !datasetById.has(view.dataset))
      return fail("Invalid declarative view.");
    const dataset = datasetById.get(view.dataset)!;
    if (view.renderer === "slice") {
      if (dataset.shape.length !== 3 || !Number.isSafeInteger(view.axis) || (view.axis as number) < 0 || (view.axis as number) > 2)
        return fail("Slice view requires a three-dimensional field and axis.");
    } else if (view.renderer === "height-surface") {
      if (dataset.shape.length !== 2 || Object.hasOwn(view, "axis"))
        return fail("Height surface requires a two-dimensional field.");
    } else return fail("Unsupported scientific view renderer.");
    if ((view.operation === "identity" && dataset.semanticType !== "scalar-field") ||
      (view.operation === "complex-density/v1" && dataset.semanticType !== "complex-scalar-field") ||
      !["identity", "complex-density/v1"].includes(String(view.operation)))
      return fail("View operation is not registered for this dataset type.");
  }
  return { ok: true, value: JSON.parse(json) as ScientificSceneManifest };
}

/** Apply the byte cap before parsing untrusted manifest text. */
export function parseScientificSceneManifest(json: string): ValidationResult<ScientificSceneManifest> {
  if (new TextEncoder().encode(json).byteLength > MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES)
    return { ok: false, errors: ["Scientific scene manifest exceeds its metadata budget."] };
  try { return normalizeScientificSceneManifest(JSON.parse(json)); }
  catch { return { ok: false, errors: ["Scientific scene manifest is not valid JSON."] }; }
}
