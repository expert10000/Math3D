import { importQuantumSceneBundle, type ImportedQuantumScene } from "./importer";
import { sceneFingerprint } from "./recent";

/**
 * Compatibility proof for one regular, complex quantum field. This is metadata
 * over the already verified importer result, not a second .qscene reader.
 * The original result retains the decoded arrays, camera and full provenance.
 */
function adaptVerifiedComplexField(imported: ImportedQuantumScene) {
  const scene = imported.source;
  const field = scene.fields?.[0];
  if (scene.schema !== "quantum-scene/v1" || scene.objects.length !== 0 || scene.fields?.length !== 1 ||
      scene.datasets.length !== 2 || field?.kind !== "complex-field" || !field.imaginary ||
      scene.coordinates.axes.join(",") !== "x,y,z" ||
      scene.lattice || scene.reciprocal || scene.bands || scene.topology)
    throw new TypeError("Quantum scene is not a single regular complex field supported by scientific-scene/v1");
  const real = scene.datasets.find(dataset => dataset.id === field.real);
  const imaginary = scene.datasets.find(dataset => dataset.id === field.imaginary);
  if (!real || !imaginary || real.components !== 1 || imaginary.components !== 1 || real.unit !== imaginary.unit ||
      !imported.arrays.has(real.id) || !imported.arrays.has(imaginary.id))
    throw new TypeError("Verified complex field components or units are unavailable");

  // The source fingerprint is the existing Math3D identity of the verified
  // metadata. Each resource keeps its original byte SHA-256; nothing is copied.
  return {
    schema: "scientific-scene/v1" as const,
    sceneId: scene.id,
    title: scene.title,
    source: { producer: "theory-lab", sourceId: scene.id, sourceSchema: scene.schema,
      sha256: sceneFingerprint(imported) },
    resources: [real, imaginary].map(dataset => ({ id: dataset.id, path: dataset.path,
      format: dataset.format, count: dataset.count, bytes: dataset.bytes, sha256: dataset.sha256 })),
    coordinates: [{ id: "field-grid", kind: "cartesian" as const,
      axes: scene.coordinates.axes.map((name, axis) => ({ name, unit: scene.coordinates.units[axis] })),
      origin: [...field.grid.origin], spacing: [...field.grid.spacing], periodic: [false, false, false] }],
    datasets: [{ id: field.id, semanticType: "complex-scalar-field" as const,
      coordinateSystem: "field-grid", shape: [...field.grid.shape], order: "last-axis-fastest" as const,
      quantity: { name: field.label, unit: real.unit }, real: real.id, imaginary: imaginary.id }],
    views: [{ id: "density-z", label: "Density (derived from complex amplitude)", dataset: field.id,
      renderer: "slice" as const, operation: "complex-density/v1" as const, axis: 2 }],
  };
}

/** Every call re-enters the existing bounded, hash-verifying .qscene importer. */
export async function importQuantumFieldScientificManifest(directory: string) {
  const imported = await importQuantumSceneBundle(directory);
  return { manifest: adaptVerifiedComplexField(imported), imported };
}
