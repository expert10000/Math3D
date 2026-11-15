import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { sha256Checksum, type ScientificBundleFile } from "@math3d/core";

/** Two physical runs: B differs by exactly 0.5 m/s in its first vector component. */
export function browserScientificBundle(options: { offset?: number; title?: string;
  axisName?: string; unit?: string; origin?: number } = {}): ScientificBundleFile[] {
  const root = [resolve("tests/fixtures"), resolve("../tests/fixtures")].find(path =>
    existsSync(join(path, "scientific-scene/vortex-volume.sscene/manifest.json")));
  if (!root) throw new Error("Scientific test fixtures are unavailable.");
  const folder = join(root, "scientific-scene/vortex-volume.sscene");
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
  const resources = manifest.resources.map((item: { id: string; path: string; sha256: string }) => {
    const bytes = new Uint8Array(readFileSync(join(folder, item.path)));
    if (item.id === manifest.datasets[0].components[0].resource && options.offset) {
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < bytes.length; i += 8) view.setFloat64(i, view.getFloat64(i, true) + options.offset, true);
      item.sha256 = sha256Checksum(bytes).slice(7);
    }
    return { path: `vortex.sscene/${item.path}`, bytes };
  });
  if (options.title) manifest.title = options.title;
  if (options.axisName) manifest.coordinates[0].axes[0].name = options.axisName;
  if (options.origin !== undefined) manifest.coordinates[0].origin[0] = options.origin;
  if (options.unit) {
    manifest.coordinates[0].axes.forEach((axis: { unit: string }) => { axis.unit = options.unit!; });
    manifest.datasets[0].quantity.unit = `${options.unit}/s`;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  return [{ path: "vortex.sscene/manifest.json", bytes }, ...resources,
    { path: "vortex.sscene/bundle.json", bytes: new TextEncoder().encode(JSON.stringify({
      schema: "scientific-scene-bundle/v1", manifest: { path: "manifest.json", bytes: bytes.length,
        sha256: sha256Checksum(bytes).slice(7) } })) }];
}
