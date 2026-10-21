import { sha256Checksum } from "./documentIdentity";
import { parseScientificSceneManifest, type ScientificSceneDataset,
  type ScientificSceneManifest } from "./scientificSceneManifest";

export type Graph2DFieldLocator = Readonly<{ kind: "directory" | "preset"; value: string }>;
export type Graph2DFieldReference = Readonly<{
  id: string;
  locator: Graph2DFieldLocator;
  sceneFingerprint: string;
  sceneId: string;
  datasetId: string;
  component: string;
  semanticType: ScientificSceneDataset["semanticType"];
  shape: readonly number[];
  axes: readonly Readonly<{ name: string; unit: string; origin: number; spacing: number; periodic: boolean }>[];
  resourceSha256: string;
}>;

const idPattern = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...expected].sort().join("|");
export const isGraph2DFieldLocator = (value: unknown): value is Graph2DFieldLocator =>
  record(value) && keys(value, ["kind", "value"]) &&
  (value.kind === "preset" && typeof value.value === "string" && idPattern.test(value.value) ||
    value.kind === "directory" && typeof value.value === "string" && value.value.length >= 8 &&
    value.value.length <= 2048 && value.value.toLowerCase().endsWith(".sscene") &&
    !/[\x00-\x1f]/.test(value.value));

export const isGraph2DFieldReference = (value: unknown): value is Graph2DFieldReference =>
  record(value) && keys(value, ["id", "locator", "sceneFingerprint", "sceneId", "datasetId", "component",
    "semanticType", "shape", "axes", "resourceSha256"]) &&
  typeof value.id === "string" && /^field_[a-f0-9]{24}$/.test(value.id) &&
  isGraph2DFieldLocator(value.locator) && typeof value.sceneFingerprint === "string" && shaPattern.test(value.sceneFingerprint) &&
  typeof value.sceneId === "string" && idPattern.test(value.sceneId) &&
  typeof value.datasetId === "string" && idPattern.test(value.datasetId) &&
  typeof value.component === "string" && idPattern.test(value.component) &&
  ["scalar-field", "complex-scalar-field", "vector-field"].includes(String(value.semanticType)) &&
  Array.isArray(value.shape) && (value.shape.length === 2 || value.shape.length === 3) &&
  value.shape.every((size: unknown) => Number.isSafeInteger(size) && (size as number) >= 1 && (size as number) <= 256) &&
  Array.isArray(value.axes) && value.axes.length === value.shape.length && value.axes.every((axis: unknown) =>
    record(axis) && keys(axis, ["name", "unit", "origin", "spacing", "periodic"]) &&
    typeof axis.name === "string" && idPattern.test(axis.name) &&
    typeof axis.unit === "string" && axis.unit.length > 0 && axis.unit.length <= 80 &&
    axis.unit.trim() === axis.unit && !/[\x00-\x1f\x7f]/.test(axis.unit) &&
    typeof axis.origin === "number" && Number.isFinite(axis.origin) && Math.abs(axis.origin) <= 1_000_000 &&
    typeof axis.spacing === "number" && Number.isFinite(axis.spacing) && axis.spacing > 0 && axis.spacing <= 1_000_000 &&
    typeof axis.periodic === "boolean") &&
  typeof value.resourceSha256 === "string" && shaPattern.test(value.resourceSha256);

const componentResource = (manifest: ScientificSceneManifest, dataset: ScientificSceneDataset, component: string) => {
  const resourceId = dataset.semanticType === "vector-field" ?
    dataset.components?.find(item => item.name === component)?.resource :
    dataset.semanticType === "complex-scalar-field" ? component === "real" ? dataset.real :
      component === "imaginary" ? dataset.imaginary : undefined : component === "scalar" ? dataset.real : undefined;
  return manifest.resources.find(item => item.id === resourceId);
};

/** Saves metadata only; field bytes remain in the verified .sscene source. */
export function createGraph2DFieldReference(manifestJson: string, fingerprint: string,
  locator: Graph2DFieldLocator, datasetId: string, component: string): Graph2DFieldReference {
  if (!shaPattern.test(fingerprint) || sha256Checksum(new TextEncoder().encode(manifestJson)) !== `sha256:${fingerprint}` ||
      !isGraph2DFieldLocator(locator)) throw new TypeError("Field source is unverified or its location is invalid.");
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const manifest = checked.value, dataset = manifest.datasets.find(item => item.id === datasetId);
  const coordinate = manifest.coordinates.find(item => item.id === dataset?.coordinateSystem);
  const resource = dataset && componentResource(manifest, dataset, component);
  if (!dataset || !coordinate || !resource || (dataset.shape.length !== 2 && dataset.shape.length !== 3))
    throw new TypeError("Choose a verified 2D or 3D field component.");
  const key = sha256Checksum(new TextEncoder().encode(`${fingerprint}:${datasetId}:${component}`)).slice(7, 31);
  const reference: Graph2DFieldReference = {
    id: `field_${key}`, locator, sceneFingerprint: fingerprint, sceneId: manifest.sceneId,
    datasetId, component, semanticType: dataset.semanticType, shape: [...dataset.shape],
    axes: coordinate.axes.map((axis, index) => ({ name: axis.name, unit: axis.unit,
      origin: coordinate.origin[index]!, spacing: coordinate.spacing[index]!, periodic: coordinate.periodic[index]! })),
    resourceSha256: resource.sha256,
  };
  if (!isGraph2DFieldReference(reference)) throw new TypeError("Invalid field reference metadata.");
  return reference;
}

export type Graph2DFieldReferenceStatus = "current" | "changed" | "missing";
export type Graph2DFieldRelinkReview = Readonly<{
  eligible: boolean;
  differences: readonly Readonly<{ field: string; saved: string; replacement: string; required: boolean; matches: boolean }>[];
}>;

/** Compare metadata only after the host has verified the replacement bundle's bytes. */
export function reviewGraph2DFieldRelink(saved: Graph2DFieldReference,
  replacement: Graph2DFieldReference): Graph2DFieldRelinkReview {
  if (!isGraph2DFieldReference(saved) || !isGraph2DFieldReference(replacement))
    throw new TypeError("Invalid field relink metadata.");
  const axisText = (reference: Graph2DFieldReference) => reference.axes.map(axis =>
    `${axis.name} (${axis.unit}): ${axis.origin} + n×${axis.spacing}${axis.periodic ? "; periodic" : ""}`).join(" / ");
  const entries = [
    ["Location", `${saved.locator.kind}: ${saved.locator.value}`, `${replacement.locator.kind}: ${replacement.locator.value}`, false],
    ["Scene", saved.sceneId, replacement.sceneId, false],
    ["Manifest fingerprint", saved.sceneFingerprint, replacement.sceneFingerprint, false],
    ["Dataset", saved.datasetId, replacement.datasetId, false],
    ["Component", saved.component, replacement.component, true],
    ["Field type", saved.semanticType, replacement.semanticType, true],
    ["Shape", saved.shape.join(" × "), replacement.shape.join(" × "), true],
    ["Axes", axisText(saved), axisText(replacement), true],
    ["Resource SHA-256", saved.resourceSha256, replacement.resourceSha256, true],
  ] as const;
  const differences = entries.map(([field, before, after, required]) => ({
    field, saved: before, replacement: after, required, matches: before === after,
  }));
  return { eligible: differences.every(item => !item.required || item.matches) &&
    differences.some(item => !item.matches), differences };
}

export function inspectGraph2DFieldReference(reference: Graph2DFieldReference, manifestJson: string | null): Graph2DFieldReferenceStatus {
  if (!isGraph2DFieldReference(reference)) throw new TypeError("Invalid field reference.");
  if (manifestJson === null) return "missing";
  try {
    const candidate = createGraph2DFieldReference(manifestJson,
      sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7), reference.locator,
      reference.datasetId, reference.component);
    return candidate.sceneFingerprint === reference.sceneFingerprint && candidate.sceneId === reference.sceneId &&
      candidate.resourceSha256 === reference.resourceSha256 && candidate.semanticType === reference.semanticType &&
      candidate.shape.length === reference.shape.length &&
      candidate.shape.every((size, index) => size === reference.shape[index]) &&
      candidate.axes.length === reference.axes.length && candidate.axes.every((axis, index) => {
        const saved = reference.axes[index]!;
        return axis.name === saved.name && axis.unit === saved.unit && axis.origin === saved.origin &&
          axis.spacing === saved.spacing && axis.periodic === saved.periodic;
      }) ? "current" : "changed";
  } catch { return "changed"; }
}
