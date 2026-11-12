import { describe, expect, it, vi } from "vitest";
import { zipSync, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { createScientificBundleProject, exportProjectPackage, parseProjectPackage,
  sha256Checksum, MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES, type ScientificBundleFile } from "@math3d/core";
import { portableScientificProjectFixture } from "../../../tests/fixtures/graph-field/portableScientificProject";
import { readBrowserScientificProjectPackage, readScientificBundleZip } from "./scientificBundleImport";

function bundle(): ScientificBundleFile[] {
  const fixture = portableScientificProjectFixture(), field = fixture.document.source.field;
  if (field.kind !== "scientific-bundle") throw new Error("Wrong fixture");
  const manifest = fixture.read({ kind: "scientific-manifest", id: field.references[0].sceneFingerprint })!;
  return [{ path: "vortex.sscene/manifest.json", bytes: manifest }, ...JSON.parse(new TextDecoder().decode(manifest)).resources.map(
    (resource: { path: string; sha256: string }) => ({ path: `vortex.sscene/${resource.path}`,
      bytes: fixture.read({ kind: "scientific-component", id: resource.sha256 })! }))];
}
const upload = ({ path, bytes }: ScientificBundleFile) => ({ name: path.split("/").at(-1)!,
  webkitRelativePath: path, size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer });
const zip = (files: ScientificBundleFile[]) => zipSync(Object.fromEntries(files.map(file => [file.path, file.bytes])));
function changeManifest(files: ScientificBundleFile[], update: (manifest: any) => void) {
  const parsed = JSON.parse(new TextDecoder().decode(files[0]!.bytes)); update(parsed);
  files[0] = { ...files[0]!, bytes: new TextEncoder().encode(JSON.stringify(parsed)) }; return files;
}
function streamedZip(entries: { name: string; bytes: Uint8Array; deflate?: boolean }[]) {
  const chunks: Uint8Array[] = [];
  const archive = new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk); });
  for (const entry of entries) {
    const file = entry.deflate ? new ZipDeflate(entry.name) : new ZipPassThrough(entry.name);
    archive.add(file); file.push(entry.bytes, true);
  }
  archive.end();
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0)); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output;
}

describe("direct scientific folder and ZIP import", () => {
  it.each(["folder", "zip"] as const)("creates a self-contained Project from %s bytes without native services", async kind => {
    const files = bundle(), input = kind === "folder" ? files.map(upload) : [upload({ path: "vortex.zip", bytes: zip(files) })];
    const raw = await readBrowserScientificProjectPackage(input, kind, "browser-import-one");
    const parsed = parseProjectPackage(new TextDecoder().decode(raw));
    expect(parsed.project.workspace.entries).toHaveLength(1);
    expect(parsed.resources.sidecars()).toHaveLength(4);
    const document = parsed.project.workspace.entries[0]!.checkpoint;
    expect(document.format).toBe("math3d.vector-field3d-document");
    if (document.format !== "math3d.vector-field3d-document" || document.source.field.kind !== "scientific-bundle") throw new Error("Wrong document");
    expect(document.workspace!.selectedLayer).toBe("xy");
    expect(document.workspace!.probe).toEqual([0, 0, 0]);
    expect(document.source.field.references[0].locator.value).toMatch(/^browser-import\/.*\.sscene$/);
    expect(parsed.resources.bytes({ kind: "scientific-manifest", id: document.source.field.references[0].sceneFingerprint })).toEqual(files[0]!.bytes);
    expect(parseProjectPackage(exportProjectPackage(parsed.project, parsed.resources)).project).toEqual(parsed.project);
  });

  it("includes every vector dataset, deduplicates bytes, and creates independent Project copies", () => {
    const files = changeManifest(bundle(), manifest => manifest.datasets.push({ ...manifest.datasets[0], id: "second" }));
    const first = createScientificBundleProject(files, "first"), second = createScientificBundleProject(files, "second");
    expect(first.project.workspace.entries).toHaveLength(2);
    expect(first.resources.sidecars()).toHaveLength(4);
    expect(first.resources.sidecars().every(resource => resource.owners.length === 2)).toBe(true);
    expect(first.project.identity.id).not.toBe(second.project.identity.id);
    expect(first.project.workspace.entries[0]!.expected.id).not.toBe(second.project.workspace.entries[0]!.expected.id);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it.each(["missing", "corrupt"])("rejects a %s component before producing a Project", mode => {
    const files = bundle();
    if (mode === "missing") files.pop(); else files[1]!.bytes[0] ^= 1;
    expect(() => createScientificBundleProject(files, "bad")).toThrow(/missing|checksum/i);
  });

  it("checks finite values even when a replacement manifest pins the altered bytes", () => {
    const files = bundle(); new DataView(files[1]!.bytes.buffer).setFloat64(0, NaN, true);
    changeManifest(files, manifest => { manifest.resources[0].sha256 = sha256Checksum(files[1]!.bytes).slice(7); });
    expect(() => createScientificBundleProject(files, "non-finite")).toThrow(/non-finite/i);
  });

  it.each(["../north.f64", "/north.f64", "C:/north.f64", "vortex.sscene/./north.f64", "vortex.sscene\\north.f64"])("rejects ambiguous path %s", path => {
    expect(() => createScientificBundleProject([...bundle(), { path, bytes: new Uint8Array() }], "bad-path")).toThrow(/relative paths/i);
  });
  it("rejects duplicate manifests, duplicate files and unrelated uploads", () => {
    const files = bundle();
    expect(() => createScientificBundleProject([...files, files[0]!], "duplicate")).toThrow(/duplicate/i);
    expect(() => createScientificBundleProject([...files, { path: "other/manifest.json", bytes: files[0]!.bytes }], "ambiguous")).toThrow(/exactly one/i);
    expect(() => createScientificBundleProject([...files, { path: "unrelated.f64", bytes: new Uint8Array() }], "extra")).toThrow(/unexpected/i);
  });
  it("rejects unsupported grids, versions and incompatible physical units", () => {
    for (const mutate of [(m: any) => { m.schema = "scientific-scene/v2"; },
      (m: any) => { m.datasets[0].shape[0] = 33; }, (m: any) => { m.datasets[0].quantity.unit = "T"; }])
      expect(() => createScientificBundleProject(changeManifest(bundle(), mutate), "unsupported")).toThrow();
  });
  it("refuses oversized folder files before reading their bytes", async () => {
    const arrayBuffer = vi.fn();
    await expect(readBrowserScientificProjectPackage([{ name: "huge.f64", size: MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES + 1, arrayBuffer }], "folder"))
      .rejects.toThrow(/size limit/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("rejects truncated ZIPs and duplicate streamed entries", () => {
    const files = bundle(), bytes = zip(files);
    expect(() => readScientificBundleZip(bytes.subarray(0, bytes.length - 10))).toThrow(/truncated/i);
    expect(() => readScientificBundleZip(streamedZip([{ name: "manifest.json", bytes: files[0]!.bytes },
      { name: "manifest.json", bytes: files[0]!.bytes }]))).toThrow(/duplicate/i);
  });
  it("bounds actual decompressed bytes even for ZIP streams without declared sizes", () => {
    const compressed = streamedZip([{ name: "bomb.f64", bytes: new Uint8Array(MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES + 1), deflate: true }]);
    expect(compressed.length).toBeLessThan(100_000);
    expect(() => readScientificBundleZip(compressed)).toThrow(/import limit/i);
  });
});
