import { sha256Checksum } from "./documentIdentity";
import { createGraph2DFieldReference } from "./graph2dFieldReference";
import { createMath3DProject } from "./math3dProject";
import { createMixedWorkspaceDocument } from "./mixedWorkspace";
import { captureProjectResources } from "./projectResources";
import { parseScientificSceneManifest, parseScientificSceneBundleEnvelope,
  MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES, MAX_SCIENTIFIC_SCENE_BUNDLE_BYTES } from "./scientificSceneManifest";
import { assertScientificProjectResources, PORTABLE_SCIENTIFIC_AXIS_LIMIT } from "./scientificProjectResources";
import { scientificVelocityUnit } from "./scientificDatasetCoordinates";
import { createVectorField3DDocument, defaultVectorField3DWorkspace, reviseVectorField3DWorkspace,
  type VectorField3DSource } from "./vectorField3DDocument";

export const MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAX_SCIENTIFIC_BUNDLE_IMPORT_FILES = 18;
export type ScientificBundleFile = Readonly<{ path: string; bytes: Uint8Array }>;

/** File names are opaque relative names; importing never follows a path or link. */
export function scientificBundleImportPath(path: string): string {
  if (!path || path.length > 512 || /[\\:\x00-\x1f\x7f]/.test(path) ||
      path.split("/").some(part => !part || part === "." || part === ".."))
    throw new TypeError("Scientific bundle file names must be unambiguous relative paths.");
  return path;
}

/** Create ordinary Project documents and resources only after checking the complete upload. */
export function createScientificBundleProject(files: readonly ScientificBundleFile[], projectKey: string) {
  if (!files.length || files.length > MAX_SCIENTIFIC_BUNDLE_IMPORT_FILES)
    throw new TypeError("A scientific bundle must contain bundle.json, one manifest and at most 16 components.");
  const paths = new Map<string, Uint8Array>();
  let total = 0;
  for (const file of files) {
    const path = scientificBundleImportPath(file.path);
    if (paths.has(path)) throw new TypeError(`Duplicate scientific file '${path}'.`);
    total += file.bytes.byteLength;
    if (total > MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES) throw new TypeError("Scientific bundle exceeds the 4 MiB import limit.");
    paths.set(path, file.bytes);
  }
  const manifests = [...paths.keys()].filter(path => path === "manifest.json" || path.endsWith("/manifest.json"));
  if (manifests.length !== 1) throw new TypeError("Choose a bundle containing exactly one manifest.json.");
  const manifestPath = manifests[0]!, prefix = manifestPath.slice(0, -"manifest.json".length);
  const manifestBytes = paths.get(manifestPath)!;
  const bundleBytes = paths.get(prefix + "bundle.json");
  if (!bundleBytes) throw new TypeError("Required scientific bundle.json descriptor is missing.");
  if (bundleBytes.byteLength > MAX_SCIENTIFIC_SCENE_BUNDLE_BYTES)
    throw new TypeError("Scientific bundle envelope exceeds its metadata limit.");
  const envelope = parseScientificSceneBundleEnvelope(new TextDecoder("utf-8", { fatal: true }).decode(bundleBytes));
  if (!envelope.ok) throw new TypeError(envelope.errors.join(" "));
  if (manifestBytes.byteLength !== envelope.value.manifest.bytes ||
      sha256Checksum(manifestBytes) !== `sha256:${envelope.value.manifest.sha256}`)
    throw new TypeError("Scientific manifest checksum or byte length differs from bundle.json.");
  if (manifestBytes.byteLength > MAX_SCIENTIFIC_SCENE_MANIFEST_BYTES)
    throw new TypeError("Scientific manifest exceeds its metadata limit.");
  const manifestJson = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
  const checked = parseScientificSceneManifest(manifestJson);
  if (!checked.ok) throw new TypeError(checked.errors.join(" "));
  const manifest = checked.value;
  if (envelope.value.schema !== manifest.schema.replace("scientific-scene/", "scientific-scene-bundle/"))
    throw new TypeError("Scientific bundle and manifest versions disagree.");
  if (manifest.schema !== "scientific-scene/v1" || manifest.datasets.some(dataset =>
      dataset.semanticType !== "vector-field" || dataset.shape.length !== 3 || dataset.components?.length !== 3 ||
      dataset.shape.some(size => size < 2 || size > PORTABLE_SCIENTIFIC_AXIS_LIMIT)))
    throw new TypeError("Browser import supports complete v1 vector bundles with 2–32 samples per axis.");
  const expected = new Set([prefix + "bundle.json", manifestPath, ...manifest.resources.map(resource => prefix + resource.path)]);
  for (const path of paths.keys()) if (!expected.has(path))
    throw new TypeError(`Unexpected scientific file '${path}'. Choose only the bundle's descriptor, manifest and components.`);
  const used = new Set(manifest.datasets.flatMap(dataset => dataset.components!.map(component => component.resource)));
  if (manifest.resources.some(resource => !used.has(resource.id)))
    throw new TypeError("The bundle contains components not used by its vector datasets.");
  const fingerprint = sha256Checksum(manifestBytes).slice(7), sourceBytes = new Map<string, Uint8Array>();
  sourceBytes.set(`scientific-manifest:${fingerprint}`, manifestBytes);
  for (const resource of manifest.resources) {
    const bytes = paths.get(prefix + resource.path);
    if (!bytes) throw new TypeError(`Required scientific component '${resource.path}' is missing.`);
    if (bytes.byteLength !== resource.bytes || sha256Checksum(bytes) !== `sha256:${resource.sha256}`)
      throw new TypeError(`Scientific component '${resource.path}' checksum or byte length does not match its manifest.`);
    sourceBytes.set(`scientific-component:${resource.sha256}`, bytes);
  }
  const documents = manifest.datasets.map(dataset => {
    const coordinate = manifest.coordinates.find(item => item.id === dataset.coordinateSystem)!;
    if (coordinate.kind !== "cartesian" || coordinate.axes.some(axis =>
        scientificVelocityUnit(axis.unit, "s") !== dataset.quantity.unit))
      throw new TypeError(`Dataset '${dataset.id}' needs Cartesian coordinates and matching velocity units per second.`);
    const locator = { kind: "directory" as const, value: `browser-import/${fingerprint}.sscene` };
    const reference = (index: number) => createGraph2DFieldReference(manifestJson, fingerprint,
      locator, dataset.id, dataset.components![index]!.name);
    const references = [reference(0), reference(1), reference(2)] as const;
    const axis = (index: number, role: "x" | "y" | "z") => ({ role, label: coordinate.axes[index]!.name,
      unit: coordinate.axes[index]!.unit, min: coordinate.origin[index]!,
      max: coordinate.origin[index]! + coordinate.spacing[index]! * (dataset.shape[index]! - 1) });
    const source: VectorField3DSource = { axes: [axis(0, "x"), axis(1, "y"), axis(2, "z")], timeUnit: "s",
      field: { kind: "scientific-bundle", references,
        componentUnits: [dataset.quantity.unit, dataset.quantity.unit, dataset.quantity.unit] }, seeds: [],
      display: { density: dataset.shape.map(size => Math.min(5, size)) as [number, number, number],
        maxGlyphs: 512, magnitudeScale: 1, colorBy: "speed" },
      solver: { absoluteTolerance: 1e-6, relativeTolerance: 1e-6, maxSteps: 10000, maxTime: 20 } };
    const document = createVectorField3DDocument(source, { stableKey: `${projectKey}:${dataset.id}`,
      title: (manifest.datasets.length === 1 ? manifest.title : `${manifest.title} · ${dataset.id}`).slice(0, 160) });
    const workspace = defaultVectorField3DWorkspace(source);
    return reviseVectorField3DWorkspace(document, { ...workspace, selectedLayer: "xy", probe: workspace.sliceCoordinates });
  });
  const project = createMath3DProject(createMixedWorkspaceDocument({ entries: documents.map(document => ({
    module: "vector3d" as const, checkpoint: document, expected: document.identity, replay: null })),
    activeDocumentIds: [documents[0]!.identity.id], results: [], artifacts: [], relations: [],
    constructions: [], committedSelection: null }), { stableKey: projectKey, title: manifest.title });
  const resources = captureProjectResources(project, item => sourceBytes.get(`${item.kind}:${item.id}`) ?? null);
  // The package path reuses the full source/shape/finite-value verifier, not just file hashes.
  assertScientificProjectResources(project, item => resources.bytes(item));
  return { project, resources, fingerprint };
}
