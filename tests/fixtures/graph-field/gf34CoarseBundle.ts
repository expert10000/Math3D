import { createGraph2DFieldReference, sha256Checksum,
  type Graph2DFieldLocator, type Graph2DFieldReference,
  type VerifiedVectorFieldTransfer } from "../../../packages/core/src/index";
import { gf23ManifestJson, gf23Transfer } from "./gf23Bundle";

/** Different native lattice, sampled from the same verified physical vortex. */
export function gf34CoarseBundle(locator: Graph2DFieldLocator =
  { kind: "preset", value: "vortexVolume" }) {
  const source = gf23Transfer();
  const manifest = JSON.parse(gf23ManifestJson);
  const shape = [11, 11, 9] as const;
  const bytesByName = new Map<string, Buffer>();
  const volumes = source.volumes.map((part, component) => {
    const values: number[] = [];
    for (let i = 0; i < shape[0]; i++) for (let j = 0; j < shape[1]; j++)
      for (let k = 0; k < shape[2]; k++)
        values.push(part.values[((i * 2) * 21 + j * 2) * 17 + k * 2]!);
    const bytes = Buffer.alloc(values.length * 8);
    values.forEach((value, index) => bytes.writeDoubleLE(value, index * 8));
    const sha = sha256Checksum(bytes).slice(7);
    manifest.resources[component].count = values.length;
    manifest.resources[component].bytes = bytes.byteLength;
    manifest.resources[component].sha256 = sha;
    bytesByName.set(part.component, bytes);
    return { ...part, sourceShape: shape, sampleShape: shape,
      resourceSha256: sha, sampleSha256: sha, values };
  });
  manifest.sceneId = "gf34-coarse-vortex";
  manifest.source.sourceId = "gf34-coarse-vortex";
  manifest.source.sha256 = sha256Checksum(new TextEncoder().encode(
    volumes.map(item => item.sampleSha256).join("|"))).slice(7);
  manifest.coordinates[0].spacing = [.8, .8, .75];
  manifest.datasets[0].shape = shape;
  const manifestJson = JSON.stringify(manifest);
  const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
  const bundleJson = JSON.stringify({ schema: "scientific-scene-bundle/v1",
    manifest: { path: "manifest.json", bytes: Buffer.byteLength(manifestJson),
      sha256: fingerprint } });
  const references = (["east", "north", "up"] as const).map(name =>
    createGraph2DFieldReference(manifestJson, fingerprint,
      locator, "field", name)) as
      [Graph2DFieldReference, Graph2DFieldReference, Graph2DFieldReference];
  return { manifestJson, bundleJson, bytesByName, references,
    transfer: { manifestJson, fingerprint,
      volumes: volumes.map(part => ({ ...part, fingerprint })) as
        unknown as VerifiedVectorFieldTransfer["volumes"] } as VerifiedVectorFieldTransfer };
}
