type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Small, platform-neutral metadata contract. Numerical values stay in verified binary resources. */
export const SCIENTIFIC_SCENE_SCHEMA = "scientific-scene/v1" as const;
export const SCIENTIFIC_SCENE_CHUNKED_SCHEMA = "scientific-scene/v2" as const;
export const SCIENTIFIC_SCENE_TILED_SCHEMA = "scientific-scene/v3" as const;
export const MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES = 64 * 1024;
export const MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES = 16 * 1024 * 1024;

export type ScientificDatasetReference = Readonly<{
  id: string;
  path: string;
  format: "f64le";
  count: number;
  bytes: number;
  sha256: string;
  chunkBytes?: number;
  chunkSha256?: readonly string[];
  layout?: "tiled-3d";
  tileShape?: readonly [number, number, number];
  tileSha256?: readonly string[];
  overview?: Readonly<{ path: string; shape: readonly [number, number, number];
    bytes: number; sha256: string }>;
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
  semanticType: "scalar-field" | "complex-scalar-field" | "vector-field";
  coordinateSystem: string;
  shape: readonly number[];
  order: "last-axis-fastest";
  quantity: Readonly<{ name: string; unit: string; symbol?: string }>;
  real?: string;
  imaginary?: string;
  components?: readonly Readonly<{ name: string; resource: string }>[];
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
  schema: typeof SCIENTIFIC_SCENE_SCHEMA | typeof SCIENTIFIC_SCENE_CHUNKED_SCHEMA |
    typeof SCIENTIFIC_SCENE_TILED_SCHEMA;
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
    (value.schema !== SCIENTIFIC_SCENE_SCHEMA &&
      value.schema !== SCIENTIFIC_SCENE_CHUNKED_SCHEMA &&
      value.schema !== SCIENTIFIC_SCENE_TILED_SCHEMA) || !id(value.sceneId) || !cleanText(value.title))
    return fail("Invalid scientific scene envelope or unsupported version.");

  const source = value.source;
  if (!record(source) || !exact(source, ["producer", "sourceId", "sourceSchema", "sha256"]) ||
    !id(source.producer) || !id(source.sourceId) ||
    typeof source.sourceSchema !== "string" || !/^[A-Za-z][A-Za-z0-9._-]*\/v[1-9][0-9]*$/.test(source.sourceSchema) ||
    !sha(source.sha256))
    return fail("Invalid scientific scene source descriptor.");

  const resources = value.resources;
  const chunked = value.schema === SCIENTIFIC_SCENE_CHUNKED_SCHEMA;
  const tiled = value.schema === SCIENTIFIC_SCENE_TILED_SCHEMA;
  if (!Array.isArray(resources) || resources.length < 1 || resources.length > 16) return fail("Invalid resource list.");
  let totalBytes = 0;
  for (const resource of resources) {
    if (!record(resource) || !exact(resource, ["id", "path", "format", "count", "bytes", "sha256",
      ...(chunked ? ["chunkBytes", "chunkSha256"] : []),
      ...(tiled ? ["layout", "tileShape", "tileSha256"] : [])],
      tiled ? ["overview"] : []) ||
      !id(resource.id) || !cleanText(resource.path, 128) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.f64$/.test(resource.path) ||
      resource.path.includes("..") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(resource.path) ||
      resource.format !== "f64le" ||
      !positiveInteger(resource.count, 1_000_000) || !positiveInteger(resource.bytes, MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES) ||
      resource.bytes !== resource.count * 8 || !sha(resource.sha256) ||
      (chunked && (!Number.isSafeInteger(resource.chunkBytes) ||
        Number(resource.chunkBytes) < 4096 || Number(resource.chunkBytes) > 262144 ||
        Number(resource.chunkBytes) % 8 !== 0 || !Array.isArray(resource.chunkSha256) ||
        resource.chunkSha256.length !== Math.ceil(Number(resource.bytes) / Number(resource.chunkBytes)) ||
        resource.chunkSha256.length > 256 || !resource.chunkSha256.every(sha))) ||
      (tiled && (resource.layout !== "tiled-3d" || !Array.isArray(resource.tileShape) ||
        resource.tileShape.length !== 3 || !resource.tileShape.every((size: unknown) => positiveInteger(size, 256)) ||
        resource.tileShape.reduce((product: number, size: number) => product * size, 1) * 8 > 262144 ||
        !Array.isArray(resource.tileSha256) || resource.tileSha256.length < 1 ||
        resource.tileSha256.length > 256 || !resource.tileSha256.every(sha))) ||
      (tiled && resource.overview !== undefined && (!record(resource.overview) ||
        !exact(resource.overview, ["path", "shape", "bytes", "sha256"]) ||
        !cleanText(resource.overview.path, 128) ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*\.f64$/.test(resource.overview.path) ||
        resource.overview.path.includes("..") ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(resource.overview.path) ||
        !Array.isArray(resource.overview.shape) || resource.overview.shape.length !== 3 ||
        !resource.overview.shape.every((size: unknown) => positiveInteger(size, 8)) ||
        !positiveInteger(resource.overview.bytes, 4096) ||
        resource.overview.bytes !== resource.overview.shape.reduce((product: number, size: number) =>
          product * size, 1) * 8 || !sha(resource.overview.sha256))))
      return fail("Invalid binary resource descriptor.");
    totalBytes += resource.bytes;
    if (tiled && resource.overview) totalBytes += (resource.overview as { bytes: number }).bytes;
  }
  if (totalBytes > MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES ||
    !unique(resources.map(resource => resource.id)) ||
    !unique(resources.flatMap(resource => [resource.path,
      ...(tiled && resource.overview ? [(resource.overview as { path: string }).path] : [])])))
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
  const resourceShapes = new Map<string, string>();
  for (const dataset of datasets) {
    if (!record(dataset) || !exact(dataset, ["id", "semanticType", "coordinateSystem", "shape", "order", "quantity",
      ...(dataset.semanticType === "vector-field" ? ["components"] : ["real"])],
      dataset.semanticType === "complex-scalar-field" ? ["imaginary"] : []) ||
      !id(dataset.id) || !["scalar-field", "complex-scalar-field", "vector-field"].includes(String(dataset.semanticType)) ||
      !id(dataset.coordinateSystem) || !coordinateById.has(dataset.coordinateSystem) ||
      !Array.isArray(dataset.shape) || dataset.shape.length !== coordinateById.get(dataset.coordinateSystem)!.axes.length ||
      !dataset.shape.every((count: unknown) => positiveInteger(count, 256)) ||
      (tiled && dataset.shape.length !== 3) ||
      dataset.order !== "last-axis-fastest" || !record(dataset.quantity) ||
      !exact(dataset.quantity, ["name", "unit"], ["symbol"]) ||
      !cleanText(dataset.quantity.name) || !cleanText(dataset.quantity.unit, 80) ||
      (dataset.quantity.symbol !== undefined && !cleanText(dataset.quantity.symbol, 32))) return fail("Invalid scientific dataset.");
    const count = dataset.shape.reduce((product: number, size: number) => product * size, 1);
    if (dataset.semanticType === "vector-field") {
      if (!Array.isArray(dataset.components) ||
          dataset.components.length < 2 || dataset.components.length > 3 ||
          !dataset.components.every((part: unknown) => record(part) && exact(part, ["name", "resource"]) &&
            id(part.name) && id(part.resource) && resourceById.get(part.resource)?.count === count) ||
          !unique(dataset.components.map((part: { name: string }) => part.name)) ||
          !unique(dataset.components.map((part: { resource: string }) => part.resource)))
        return fail("Vector field requires two or three distinct components matching its coordinate shape.");
      for (const part of dataset.components) usedResources.add(part.resource);
    } else {
      if (!id(dataset.real) || resourceById.get(dataset.real)?.count !== count)
        return fail("Dataset shape does not match its binary resource.");
      usedResources.add(dataset.real);
      if (dataset.semanticType === "complex-scalar-field") {
        if (!id(dataset.imaginary) || dataset.imaginary === dataset.real || resourceById.get(dataset.imaginary)?.count !== count)
          return fail("Complex field requires matching real and imaginary resources.");
        usedResources.add(dataset.imaginary);
      }
    }
    if (tiled) {
      const ids = dataset.semanticType === "vector-field" ? (dataset.components as { resource: string }[]).map(part =>
        part.resource) : [dataset.real, ...(dataset.imaginary ? [dataset.imaginary] : [])] as string[];
      for (const resourceId of ids) {
        const resource = resourceById.get(resourceId)!;
        const prior = resourceShapes.get(resourceId);
        const shapeKey = dataset.shape.join(",");
        if (prior && prior !== shapeKey) return fail("Tiled resource is shared across incompatible shapes.");
        resourceShapes.set(resourceId, shapeKey);
        const tileShape = resource.tileShape!;
        const tiles = dataset.shape.reduce((product: number, size: number, axis: number) =>
          product * Math.ceil(size / tileShape[axis]!), 1);
        if (tiles > 256 || resource.tileSha256?.length !== tiles)
          return fail("Tiled resource tile count does not match its dataset shape.");
        if (resource.overview && (resource.overview as { shape: number[] }).shape.some((size, axis) =>
          size !== Math.min((dataset.shape as number[])[axis], 8)))
          return fail("Tiled overview shape does not match the bounded source lattice.");
      }
    }
    const coordinate = coordinateById.get(dataset.coordinateSystem)!;
    if (dataset.shape.some((size: number, axis: number) =>
      Math.abs(coordinate.origin[axis] + coordinate.spacing[axis] * (size - 1)) > 1_000_000))
      return fail("Dataset coordinate extent exceeds the bounded scene domain.");
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

/** Physical tile order is tx, then ty, then tz; values inside each edge-trimmed tile are last-axis-fastest. */
export function scientificTileLayout(shape: readonly number[], tileShape: readonly number[]) {
  if (shape.length !== 3 || tileShape.length !== 3 || shape.some(size => !positiveInteger(size, 256)) ||
      tileShape.some(size => !positiveInteger(size, 256))) throw new TypeError("Invalid scientific tile shape.");
  const grid = shape.map((size, axis) => Math.ceil(size / tileShape[axis]!));
  if (grid[0]! * grid[1]! * grid[2]! > 256) throw new RangeError("Scientific tile count exceeds 256.");
  const tiles: { index: number; start: [number, number, number]; size: [number, number, number];
    offsetBytes: number; bytes: number }[] = [];
  let offsetBytes = 0;
  for (let x = 0; x < grid[0]!; x++) for (let y = 0; y < grid[1]!; y++) for (let z = 0; z < grid[2]!; z++) {
    const start = [x * tileShape[0]!, y * tileShape[1]!, z * tileShape[2]!] as [number, number, number];
    const size = start.map((value, axis) => Math.min(tileShape[axis]!, shape[axis]! - value)) as
      [number, number, number];
    const bytes = size[0] * size[1] * size[2] * 8;
    tiles.push({ index: tiles.length, start, size, offsetBytes, bytes });
    offsetBytes += bytes;
  }
  return tiles;
}

export function scientificTileSampleLocation(shape: readonly number[], tileShape: readonly number[],
  indices: readonly number[], tiles = scientificTileLayout(shape, tileShape)) {
  if (indices.length !== 3 || indices.some((index, axis) => !Number.isSafeInteger(index) ||
      index < 0 || index >= shape[axis]!)) throw new RangeError("Scientific tile point is outside the dataset.");
  const grid = shape.map((size, axis) => Math.ceil(size / tileShape[axis]!));
  const tileCoords = indices.map((value, axis) => Math.floor(value / tileShape[axis]!));
  const tileIndex = (tileCoords[0]! * grid[1]! + tileCoords[1]!) * grid[2]! + tileCoords[2]!;
  const tile = tiles[tileIndex]!;
  const local = indices.map((value, axis) => value - tile.start[axis]!);
  return { tileIndex, offsetBytes: ((local[0]! * tile.size[1] + local[1]!) * tile.size[2] + local[2]!) * 8 };
}

/** Apply the byte cap before parsing untrusted manifest text. */
export function parseScientificSceneManifest(json: string): ValidationResult<ScientificSceneManifest> {
  if (new TextEncoder().encode(json).byteLength > MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES)
    return { ok: false, errors: ["Scientific scene manifest exceeds its metadata budget."] };
  try { return normalizeScientificSceneManifest(JSON.parse(json)); }
  catch { return { ok: false, errors: ["Scientific scene manifest is not valid JSON."] }; }
}
