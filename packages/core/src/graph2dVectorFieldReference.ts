import { sha256Checksum } from "./documentIdentity";
import { createGraph2DFieldReference, inspectGraph2DFieldReference, isGraph2DFieldReference,
  type Graph2DFieldLocator, type Graph2DFieldReference, type Graph2DFieldReferenceStatus } from "./graph2dFieldReference";
import { parseScientificSceneManifest } from "./scientificSceneManifest";

export type Graph2DVectorFieldReference = Readonly<{
  id: string;
  components: readonly Graph2DFieldReference[];
}>;

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** One project reference records the two ordered component contracts without copying grid values. */
export function isGraph2DVectorFieldReference(value: unknown): value is Graph2DVectorFieldReference {
  if (!record(value) || Object.keys(value).sort().join(",") !== "components,id" ||
      typeof value.id !== "string" || !/^vector2d_[a-f0-9]{24}$/.test(value.id) ||
      !Array.isArray(value.components) || value.components.length !== 2 ||
      !value.components.every(isGraph2DFieldReference)) return false;
  const [first, second] = value.components as Graph2DFieldReference[];
  return first!.semanticType === "vector-field" && second!.semanticType === "vector-field" &&
    first!.shape.length === 2 && second!.shape.length === 2 &&
    first!.component !== second!.component &&
    first!.sceneFingerprint === second!.sceneFingerprint && first!.sceneId === second!.sceneId &&
    first!.datasetId === second!.datasetId && same(first!.locator, second!.locator) &&
    same(first!.shape, second!.shape) && same(first!.axes, second!.axes) &&
    value.id === "vector2d_" + sha256Checksum(new TextEncoder().encode(
      first!.sceneFingerprint + ":" + first!.datasetId)).slice(7, 31);
}

export function createGraph2DVectorFieldReference(manifestJson: string, fingerprint: string,
  locator: Graph2DFieldLocator, datasetId: string): Graph2DVectorFieldReference {
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const dataset = checked.value.datasets.find(item => item.id === datasetId);
  if (dataset?.semanticType !== "vector-field" || dataset.shape.length !== 2 || dataset.components?.length !== 2)
    throw new TypeError("Choose one complete two-component 2D vector field.");
  const components = dataset.components.map(part =>
    createGraph2DFieldReference(manifestJson, fingerprint, locator, datasetId, part.name)) as
    [Graph2DFieldReference, Graph2DFieldReference];
  const reference: Graph2DVectorFieldReference = {
    id: "vector2d_" + sha256Checksum(new TextEncoder().encode(fingerprint + ":" + datasetId)).slice(7, 31),
    components,
  };
  if (!isGraph2DVectorFieldReference(reference)) throw new TypeError("Invalid paired vector field reference.");
  return reference;
}

export function inspectGraph2DVectorFieldReference(reference: Graph2DVectorFieldReference,
  manifestJson: string | null): Graph2DFieldReferenceStatus {
  if (!isGraph2DVectorFieldReference(reference)) throw new TypeError("Invalid paired vector field reference.");
  if (manifestJson === null) return "missing";
  try {
    const saved = reference.components[0]!;
    const candidate = createGraph2DVectorFieldReference(manifestJson,
      sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7), saved.locator, saved.datasetId);
    return candidate.components.every((part, index) => part.component === reference.components[index]!.component &&
      inspectGraph2DFieldReference(reference.components[index]!, manifestJson) === "current") ? "current" : "changed";
  } catch { return "changed"; }
}
