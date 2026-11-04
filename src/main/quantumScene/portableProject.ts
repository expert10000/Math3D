import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { importQuantumSceneBundle } from "./importer";
import { sceneFingerprint } from "./recent";

const SCHEMA = "math3d.quantum-project-pack/v1";
const HASH = /^[a-f0-9]{64}$/;
const MAX_PROJECT = 112 * 1024 * 1024;
const MAX_BLOB = 16 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
type FileRecord = { name: string; sha256: string; bytes: number };
type SceneRecord = { fingerprint: string; files: FileRecord[] };
type PackManifest = { schema: typeof SCHEMA; project: { path: "project.json"; sha256: string; bytes: number }; scenes: SceneRecord[] };
export type PackReference = { sceneFingerprint: string; directory: string };
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const safeFile = (name: string) => name === "scene.json" || name === "bundle.json" || /^[A-Za-z0-9_-]{1,100}\.f64$/.test(name);
const within = (root: string, child: string) => resolve(child).startsWith(resolve(root) + sep);
const exact = (value: unknown, keys: string[]) => !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();

async function checkedFile(path: string, limit: number): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error("Invalid portable quantum file or size");
  return readFile(path);
}
function checkedProject(projectJson: string, fingerprints: readonly string[]) {
  if (Buffer.byteLength(projectJson) > MAX_PROJECT) throw new Error("Portable Project exceeds 112 MiB");
  const value = JSON.parse(projectJson) as { format?: string; schemaVersion?: number; project?: unknown; resources?: unknown };
  if (value.format === "math3d.project-package" &&
      (value.schemaVersion !== 1 || !Array.isArray(value.resources) || !value.project))
    throw new Error("Invalid portable Project resource package");
  const project = (value.format === "math3d.project-package" ? value.project : value) as {
    format?: string; quantumScenes?: { sceneFingerprint: string; directory: string }[];
    workspace?: { entries?: { module?: string; checkpoint?: { source?: { sceneFingerprint?: string }; location?: { directory?: string } } }[] } };
  if (project.format !== "math3d.project" || !Array.isArray(project.quantumScenes) ||
      project.quantumScenes.length !== fingerprints.length ||
      !fingerprints.every(fingerprint => project.quantumScenes!.some(item => item.sceneFingerprint === fingerprint &&
        item.directory === `scenes/${fingerprint}.qscene`))) throw new Error("Portable Project scene references disagree");
  for (const entry of project.workspace?.entries ?? []) if (entry.module === "quantum" &&
      (!entry.checkpoint?.source?.sceneFingerprint ||
        !fingerprints.includes(entry.checkpoint.source.sceneFingerprint) ||
        entry.checkpoint.location?.directory !== `scenes/${entry.checkpoint.source.sceneFingerprint}.qscene`))
    throw new Error("Portable Project quantum document location disagrees");
}

/** Publish one bounded, content-addressed directory pack after verifying every source bundle. */
export async function writeQuantumProjectPack(projectJson: string, references: readonly PackReference[], destination: string): Promise<void> {
  if (!isAbsolute(destination) || !destination.endsWith(".qpack") || !references.length || references.length > 16 ||
      new Set(references.map(item => item.sceneFingerprint)).size !== references.length)
    throw new Error("Invalid quantum Project pack request");
  const fingerprints = references.map(item => item.sceneFingerprint).sort();
  if (fingerprints.some(value => !HASH.test(value))) throw new Error("Invalid scene fingerprint");
  checkedProject(projectJson, fingerprints);
  const blobs = new Map<string, Buffer>();
  const scenes: SceneRecord[] = [];
  for (const reference of [...references].sort((a, b) => a.sceneFingerprint.localeCompare(b.sceneFingerprint))) {
    if (!isAbsolute(reference.directory) || !reference.directory.toLowerCase().endsWith(".qscene"))
      throw new Error("Invalid quantum source directory");
    const imported = await importQuantumSceneBundle(reference.directory);
    if (sceneFingerprint(imported) !== reference.sceneFingerprint) throw new Error("Quantum source fingerprint changed");
    const names = ["bundle.json", "scene.json", ...imported.source.datasets.map(dataset => dataset.path)].sort();
    const files: FileRecord[] = [];
    for (const name of names) {
      if (!safeFile(name)) throw new Error("Invalid quantum source file name");
      const bytes = await checkedFile(join(reference.directory, name), MAX_BLOB);
      const hash = sha(bytes);
      blobs.set(hash, bytes);
      files.push({ name, sha256: hash, bytes: bytes.length });
    }
    scenes.push({ fingerprint: reference.sceneFingerprint, files });
  }
  const projectBytes = Buffer.from(projectJson, "utf8");
  const manifest: PackManifest = { schema: SCHEMA,
    project: { path: "project.json", sha256: sha(projectBytes), bytes: projectBytes.length }, scenes };
  const total = projectBytes.length + [...blobs.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  if (total > MAX_TOTAL) throw new Error("Portable quantum pack exceeds 128 MiB");
  const target = resolve(destination);
  await mkdir(target, { recursive: false });
  try {
    await mkdir(join(target, "blobs"));
    await writeFile(join(target, "project.json"), projectBytes, { flag: "wx" });
    for (const [hash, bytes] of blobs) await writeFile(join(target, "blobs", hash), bytes, { flag: "wx" });
    await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (!within(resolve(target, ".."), target)) throw new Error("Unsafe quantum pack cleanup path");
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

/** Verify every content-addressed blob, reconstruct scenes, and return paths for Project relink. */
export async function openQuantumProjectPack(directory: string, cacheRoot: string): Promise<{ projectJson: string; references: PackReference[] }> {
  if (!isAbsolute(directory) || !directory.endsWith(".qpack")) throw new Error("Invalid quantum pack directory");
  const root = resolve(directory), info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Invalid quantum pack folder");
  const top = await readdir(root, { withFileTypes: true });
  if (top.length !== 3 || top.some(entry => entry.isSymbolicLink() ||
      (entry.name === "blobs" ? !entry.isDirectory() : !entry.isFile()) ||
      !["blobs", "project.json", "manifest.json"].includes(entry.name)))
    throw new Error("Quantum pack has unexpected or missing top-level files");
  const raw = await checkedFile(join(root, "manifest.json"), 128 * 1024);
  const manifest: unknown = JSON.parse(raw.toString("utf8"));
  if (!exact(manifest, ["schema", "project", "scenes"]) || (manifest as PackManifest).schema !== SCHEMA ||
      !exact((manifest as PackManifest).project, ["path", "sha256", "bytes"]) ||
      (manifest as PackManifest).project.path !== "project.json" ||
      !HASH.test((manifest as PackManifest).project.sha256) ||
      !Number.isSafeInteger((manifest as PackManifest).project.bytes) ||
      (manifest as PackManifest).project.bytes < 1 || (manifest as PackManifest).project.bytes > MAX_PROJECT ||
      !Array.isArray((manifest as PackManifest).scenes) || !(manifest as PackManifest).scenes.length ||
      (manifest as PackManifest).scenes.length > 16) throw new Error("Invalid quantum pack manifest");
  const pack = manifest as PackManifest;
  const projectBytes = await checkedFile(join(root, "project.json"), pack.project.bytes);
  if (projectBytes.length !== pack.project.bytes || sha(projectBytes) !== pack.project.sha256)
    throw new Error("Portable Project hash changed");
  const fingerprints = pack.scenes.map(scene => scene.fingerprint);
  if (new Set(fingerprints).size !== fingerprints.length || fingerprints.some(value => !HASH.test(value)))
    throw new Error("Invalid quantum pack scene IDs");
  const projectJson = projectBytes.toString("utf8");
  checkedProject(projectJson, fingerprints);
  const expectedBlobs = new Set<string>();
  for (const scene of pack.scenes) {
    if (!exact(scene, ["fingerprint", "files"]) || !Array.isArray(scene.files) || scene.files.length < 3 || scene.files.length > 66 ||
        new Set(scene.files.map(file => file.name)).size !== scene.files.length ||
        !scene.files.some(file => file.name === "scene.json") || !scene.files.some(file => file.name === "bundle.json"))
      throw new Error("Invalid quantum pack scene file list");
    for (const file of scene.files) {
      if (!exact(file, ["name", "sha256", "bytes"]) || !safeFile(file.name) || !HASH.test(file.sha256) ||
          !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_BLOB)
        throw new Error("Invalid quantum pack blob descriptor");
      expectedBlobs.add(file.sha256);
    }
  }
  const entries = await readdir(join(root, "blobs"), { withFileTypes: true });
  if (entries.length !== expectedBlobs.size || entries.some(entry => !entry.isFile() || entry.isSymbolicLink() || !expectedBlobs.has(entry.name)))
    throw new Error("Quantum pack has missing, extra or linked blobs");
  const blobs = new Map<string, Buffer>();
  let total = projectBytes.length;
  for (const hash of expectedBlobs) {
    const bytes = await checkedFile(join(root, "blobs", hash), MAX_BLOB);
    if (sha(bytes) !== hash) throw new Error("Quantum pack blob hash changed");
    total += bytes.length;
    if (total > MAX_TOTAL) throw new Error("Portable quantum pack exceeds 128 MiB");
    blobs.set(hash, bytes);
  }
  const cache = resolve(cacheRoot);
  await mkdir(cache, { recursive: true });
  const references: PackReference[] = [];
  for (const scene of pack.scenes) {
    const destination = join(cache, `${scene.fingerprint}.qscene`);
    if (!within(cache, destination)) throw new Error("Unsafe quantum cache path");
    let created = false;
    try {
      try { await lstat(destination); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(destination); created = true;
        for (const file of scene.files) {
          const bytes = blobs.get(file.sha256)!;
          if (bytes.length !== file.bytes) throw new Error("Quantum pack blob size changed");
          await writeFile(join(destination, file.name), bytes, { flag: "wx" });
        }
      }
      const imported = await importQuantumSceneBundle(destination);
      if (sceneFingerprint(imported) !== scene.fingerprint) throw new Error("Resolved quantum source fingerprint changed");
      const actualNames = ["bundle.json", "scene.json", ...imported.source.datasets.map(dataset => dataset.path)].sort();
      if (actualNames.join() !== scene.files.map(file => file.name).sort().join())
        throw new Error("Resolved quantum scene file inventory changed");
      for (const file of scene.files) {
        const bytes = await checkedFile(join(destination, file.name), file.bytes);
        if (bytes.length !== file.bytes || sha(bytes) !== file.sha256)
          throw new Error("Resolved quantum scene blob changed");
      }
      references.push({ sceneFingerprint: scene.fingerprint, directory: destination });
    } catch (error) {
      if (created && within(cache, destination)) await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }
  return { projectJson, references };
}
