import { GRAPH2D_PUBLICATION_LIMITS, sha256Checksum, type Graph2DPublicationArtifact, type Graph2DCaptureRecipeArtifact } from "@math3d/core";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";

const cache = new Directory(Paths.cache, "math3d-graph-publications");
const active = new Set<string>();
let serial = 0;
type LocalArtifact = Graph2DPublicationArtifact | Graph2DCaptureRecipeArtifact;
const validate = (artifact: LocalArtifact) => {
  if (!artifact.bytes.length || artifact.bytes.length > GRAPH2D_PUBLICATION_LIMITS.maxBytes || !/^[a-zA-Z0-9_-]+\.(svg|png|csv|html|json)$/.test(artifact.fileName))
    throw new TypeError("Invalid bounded graph publication file.");
};
const verify = async (file: { bytes: () => Promise<Uint8Array> }, artifact: LocalArtifact) => {
  if (sha256Checksum(await file.bytes()) !== sha256Checksum(artifact.bytes)) throw new Error("Graph publication read-back verification failed.");
};
export const saveMobileGraphPublication = async (artifact: LocalArtifact, isCurrent: () => boolean) => {
  validate(artifact);
  try {
    const directory = await Directory.pickDirectoryAsync();
    if (!isCurrent()) return { status: "cancelled" as const };
    let name = artifact.fileName, suffix = 0;
    while (new File(directory.uri, name).exists) {
      if (++suffix > 999) throw new Error("Could not create a unique graph export name.");
      name = artifact.fileName.replace(/\.(svg|png|csv|html|json)$/, `-${suffix + 1}.$1`);
    }
    const output = directory.createFile(name, artifact.mimeType);
    output.write(artifact.bytes);
    await verify(output, artifact);
    return { status: "saved" as const, fileName: name };
  } catch (error) {
    if (/picker was cancel(?:l)?ed/i.test(String((error as Error)?.message ?? error))) return { status: "cancelled" as const };
    throw error;
  }
};
export const shareMobileGraphPublication = async (artifact: LocalArtifact, isCurrent: () => boolean) => {
  validate(artifact);
  if (!(await isAvailableAsync())) throw new Error("Native sharing is unavailable on this device.");
  if (!isCurrent()) return;
  cache.create({ idempotent: true, intermediates: true });
  // Only this private export directory is managed. Never prune picked user folders or projects.
  const old = cache.list().filter((item): item is File => item instanceof File && /^graph-\d+-\d+-.*\.(svg|png|csv|html|json)$/.test(item.name) && !active.has(item.uri))
    .sort((a, b) => a.name.localeCompare(b.name));
  while (old.length >= 8) old.shift()!.delete();
  const file = new File(cache, `graph-${Date.now()}-${++serial}-${artifact.fileName}`);
  file.create({ overwrite: false }); active.add(file.uri);
  try {
    file.write(artifact.bytes); await verify(file, artifact);
    if (!isCurrent()) return;
    await shareAsync(file.uri, { dialogTitle: "Share graph publication", mimeType: artifact.mimeType, UTI: artifact.uti });
  } finally { active.delete(file.uri); }
};
