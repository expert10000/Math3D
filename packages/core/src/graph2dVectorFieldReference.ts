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
    same(first!.shape, second!.shape) && same(first!.axes, second!.axes);
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

export type Graph2DVectorFieldRelinkReview = Readonly<{
  eligible: boolean;
  differences: readonly Readonly<{ field: string; saved: string; replacement: string;
    required: boolean; matches: boolean }>[];
}>;

/** A replacement may move or rename the source, but both ordered vector contracts must match. */
export function reviewGraph2DVectorFieldRelink(saved: Graph2DVectorFieldReference,
  replacement: Graph2DVectorFieldReference): Graph2DVectorFieldRelinkReview {
  if (!isGraph2DVectorFieldReference(saved) || !isGraph2DVectorFieldReference(replacement))
    throw new TypeError("Invalid paired vector field relink metadata.");
  const before = saved.components[0]!, after = replacement.components[0]!;
  const axisText = (reference: Graph2DFieldReference) => reference.axes.map(axis =>
    `${axis.name} (${axis.unit}): ${axis.origin} + n×${axis.spacing}${axis.periodic ? "; periodic" : ""}`).join(" / ");
  const entries = [
    ["Location", `${before.locator.kind}: ${before.locator.value}`,
      `${after.locator.kind}: ${after.locator.value}`, false],
    ["Scene", before.sceneId, after.sceneId, false],
    ["Manifest fingerprint", before.sceneFingerprint, after.sceneFingerprint, false],
    ["Dataset", before.datasetId, after.datasetId, false],
    ["Component 1", before.component, after.component, true],
    ["Component 2", saved.components[1]!.component, replacement.components[1]!.component, true],
    ["Field type", before.semanticType, after.semanticType, true],
    ["Shape", before.shape.join(" × "), after.shape.join(" × "), true],
    ["Axes", axisText(before), axisText(after), true],
    ["Component 1 resource SHA-256", before.resourceSha256, after.resourceSha256, true],
    ["Component 2 resource SHA-256", saved.components[1]!.resourceSha256,
      replacement.components[1]!.resourceSha256, true],
  ] as const;
  const differences = entries.map(([field, previous, candidate, required]) => ({
    field, saved: previous, replacement: candidate, required, matches: previous === candidate,
  }));
  return { eligible: differences.every(item => !item.required || item.matches) &&
    differences.some(item => !item.matches), differences };
}
