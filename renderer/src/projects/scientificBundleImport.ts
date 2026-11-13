import { Unzip, UnzipInflate } from "fflate";
import { createScientificBundleProject, exportProjectPackage, scientificBundleImportPath,
  MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES, MAX_SCIENTIFIC_BUNDLE_IMPORT_FILES,
  type ScientificBundleFile } from "@math3d/core";

export type ScientificUpload = Pick<File, "name" | "size" | "arrayBuffer"> & { webkitRelativePath?: string };
export type ScientificUploadKind = "folder" | "zip";
const MAX_ZIP_BYTES = MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES + 65536;
const MAX_ZIP_ENTRIES = 64;

/** Require a complete single-disk ZIP envelope; ZIP64 and self-extractors are outside this small import. */
function zipEntryCount(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50)
    throw new TypeError("Choose a complete scientific ZIP archive.");
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) !== 0x06054b50 || offset + 22 + view.getUint16(offset + 20, true) !== bytes.length) continue;
    const count = view.getUint16(offset + 10, true), size = view.getUint32(offset + 12, true), start = view.getUint32(offset + 16, true);
    if (view.getUint16(offset + 4, true) || view.getUint16(offset + 6, true) ||
        view.getUint16(offset + 8, true) !== count || !count || count > MAX_ZIP_ENTRIES ||
        size < 46 || start + size !== offset || start < 4 || start > bytes.length - 4 ||
        view.getUint32(start, true) !== 0x02014b50) break;
    return count;
  }
  throw new TypeError("Scientific ZIP is truncated or uses an unsupported archive layout.");
}

/** Decompress in bounded input pieces and enforce actual output sizes, including streamed entries. */
export function readScientificBundleZip(bytes: Uint8Array): ScientificBundleFile[] {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new TypeError("Scientific ZIP exceeds its import size limit.");
  const expectedEntries = zipEntryCount(bytes), files: ScientificBundleFile[] = [], names = new Set<string>();
  let entries = 0, completed = 0, total = 0, failure: Error | null = null;
  const unzip = new Unzip(file => {
    if (failure) return;
    try {
      if (++entries > MAX_ZIP_ENTRIES) throw new TypeError("Scientific ZIP contains too many entries.");
      const directory = file.name.endsWith("/"), path = scientificBundleImportPath(directory ? file.name.slice(0, -1) : file.name);
      if (names.has(path)) throw new TypeError(`Duplicate scientific ZIP entry '${path}'.`);
      names.add(path);
      if (file.originalSize !== undefined && file.originalSize > MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES - total)
        throw new TypeError("Scientific ZIP expands beyond the 4 MiB import limit.");
      if (!directory && files.length >= MAX_SCIENTIFIC_BUNDLE_IMPORT_FILES)
        throw new TypeError("Scientific ZIP contains too many component files.");
      if (file.compression !== 0 && file.compression !== 8) throw new TypeError("Scientific ZIP supports stored or deflated files.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      file.ondata = (error, chunk, final) => {
        if (failure) return;
        if (error) { failure = error; file.terminate(); return; }
        total += chunk.length; size += chunk.length;
        if (total > MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES || directory && size > 0) {
          failure = new TypeError("Scientific ZIP expands beyond its import limit or contains a nonempty directory entry.");
          file.terminate(); return;
        }
        if (chunk.length) chunks.push(chunk.slice());
        if (final) {
          completed++;
          if (file.originalSize !== undefined && size !== file.originalSize) {
            failure = new TypeError("Scientific ZIP entry length differs from its descriptor."); return;
          }
          if (!directory) {
            const output = new Uint8Array(size); let offset = 0;
            for (const part of chunks) { output.set(part, offset); offset += part.length; }
            files.push({ path, bytes: output });
          }
        }
      };
      file.start();
    } catch (error) { failure = error instanceof Error ? error : new TypeError(String(error)); file.terminate(); }
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    if (failure) throw failure;
    const end = Math.min(bytes.length, offset + 1024);
    unzip.push(bytes.subarray(offset, end), end === bytes.length);
  }
  if (failure) throw failure;
  if (entries !== expectedEntries || completed !== entries) throw new TypeError("Scientific ZIP contains incomplete entries.");
  return files;
}

export async function readBrowserScientificProjectPackage(files: readonly ScientificUpload[],
  kind: ScientificUploadKind, projectKey = crypto.randomUUID()): Promise<Uint8Array> {
  if (!files.length || kind === "zip" && files.length !== 1 ||
      kind === "folder" && files.length > MAX_SCIENTIFIC_BUNDLE_IMPORT_FILES)
    throw new TypeError("Choose one scientific folder or ZIP.");
  const limit = kind === "zip" ? MAX_ZIP_BYTES : MAX_SCIENTIFIC_BUNDLE_IMPORT_BYTES;
  if (files.some(file => !Number.isSafeInteger(file.size) || file.size < 0) ||
      files.reduce((sum, file) => sum + file.size, 0) > limit)
    throw new TypeError("Scientific bundle exceeds its import size limit.");
  const read = async (file: ScientificUpload) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) throw new TypeError("A scientific file changed while it was being read.");
    return bytes;
  };
  const entries = kind === "zip" ? readScientificBundleZip(await read(files[0]!)) :
    await Promise.all(files.map(async file => ({ path: file.webkitRelativePath || file.name, bytes: await read(file) })));
  const { project, resources } = createScientificBundleProject(entries, projectKey);
  return new TextEncoder().encode(exportProjectPackage(project, resources));
}
