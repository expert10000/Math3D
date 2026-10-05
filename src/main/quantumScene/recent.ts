import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { importQuantumSceneBundle, type ImportedQuantumScene } from "./importer";

const SCHEMA = "math3d.quantum-scene-recent/v1";
const FILE = "quantum-scene-recent.json";
const MAX_RECORD_BYTES = 8192;
type RecentRecord = { schema: typeof SCHEMA; directory: string; sceneFingerprint: string };

export const sceneFingerprint = (imported: ImportedQuantumScene): string =>
  createHash("sha256").update(JSON.stringify(imported.source)).digest("hex");

const recordPath = (userData: string) => join(userData, FILE);

export async function rememberQuantumScene(userData: string, directory: string, imported: ImportedQuantumScene): Promise<void> {
  if (!isAbsolute(directory) || directory.length > 4096 || directory.includes("\0"))
    throw new Error("Invalid recent quantum scene location");
  const absolute = resolve(directory);
  const record: RecentRecord = { schema: SCHEMA, directory: absolute, sceneFingerprint: sceneFingerprint(imported) };
  const bytes = JSON.stringify(record) + "\n";
  if (Buffer.byteLength(bytes) > MAX_RECORD_BYTES) throw new Error("Recent quantum scene record is too large");
  await mkdir(userData, { recursive: true });
  const temporary = join(userData, `${FILE}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, recordPath(userData));
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function readRecentQuantumScene(userData: string): Promise<RecentRecord> {
  let handle;
  try { handle = await open(recordPath(userData), "r"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("No recent quantum scene to reopen");
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > MAX_RECORD_BYTES) throw new Error("Invalid recent quantum scene record");
    const buffer = Buffer.alloc(MAX_RECORD_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead < 1 || bytesRead > MAX_RECORD_BYTES) throw new Error("Invalid recent quantum scene record");
    const value: unknown = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid recent quantum scene record");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "directory,sceneFingerprint,schema" || record.schema !== SCHEMA ||
        typeof record.directory !== "string" || !isAbsolute(record.directory) ||
        resolve(record.directory) !== record.directory || record.directory.length > 4096 || record.directory.includes("\0") ||
        typeof record.sceneFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(record.sceneFingerprint))
      throw new Error("Invalid recent quantum scene record");
    return record as RecentRecord;
  } finally { await handle.close(); }
}

export async function reopenRecentQuantumScene(userData: string): Promise<{ directory: string; imported: ImportedQuantumScene }> {
  const record = await readRecentQuantumScene(userData);
  const imported = await importQuantumSceneBundle(record.directory);
  if (sceneFingerprint(imported) !== record.sceneFingerprint)
    throw new Error("Recent quantum scene changed since it was opened");
  return { directory: record.directory, imported };
}
