import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type DurableProjectSnapshot = Readonly<{
  id: string; savedAt: number; projectBytes: string; libraryBytes: string; activate: boolean;
}>;
const SCHEMA = "math3d.project-durable-checkpoint/v1";
const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
const MAX_LIBRARY_BYTES = 128 * 1024;
const idPattern = /^math3d:project:[a-zA-Z0-9:_-]{1,160}$/;
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

function validate(value: unknown): DurableProjectSnapshot {
  insist(value && typeof value === "object" && !Array.isArray(value), "Invalid durable Project snapshot.");
  const snapshot = value as DurableProjectSnapshot;
  insist(idPattern.test(snapshot.id) && Number.isSafeInteger(snapshot.savedAt) && snapshot.savedAt >= 0 &&
    typeof snapshot.projectBytes === "string" && Buffer.byteLength(snapshot.projectBytes) <= MAX_PROJECT_BYTES &&
    typeof snapshot.libraryBytes === "string" && Buffer.byteLength(snapshot.libraryBytes) <= MAX_LIBRARY_BYTES &&
    typeof snapshot.activate === "boolean", "Durable Project snapshot exceeds its bounds or has an invalid identity.");
  const project = JSON.parse(snapshot.projectBytes) as { format?: string; identity?: { id?: string } };
  const library = JSON.parse(snapshot.libraryBytes) as { format?: string; version?: number;
    entries?: { id?: string; savedAt?: number }[] };
  insist(project.format === "math3d.project" && project.identity?.id === snapshot.id &&
    library.format === "math3d.project-library" && library.version === 1 &&
    library.entries?.some(entry => entry.id === snapshot.id && entry.savedAt === snapshot.savedAt),
    "Durable Project payload and library entry differ.");
  return snapshot;
}

/** One fsync'd checkpoint per Project. The renderer restores only newer valid saves. */
export class ProjectDurabilityStore {
  private readonly directory: string;
  constructor(userData: string) { this.directory = join(userData, "project-checkpoints-v1"); }
  private filename(id: string) { return join(this.directory, `${sha(id)}.json`); }
  write(value: unknown): void {
    const snapshot = validate(value);
    mkdirSync(this.directory, { recursive: true });
    const target = this.filename(snapshot.id);
    if (!existsSync(target) && readdirSync(this.directory).filter(name => name.endsWith(".json")).length >= 64)
      throw new Error("Durable Project checkpoint limit reached.");
    const body = { schema: SCHEMA, ...snapshot };
    const bytes = JSON.stringify({ body, sha256: sha(JSON.stringify(body)) }) + "\n";
    const temporary = join(this.directory, `${randomUUID()}.part`);
    let fd: number | null = null;
    try {
      fd = openSync(temporary, "wx", 0o600);
      writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = null;
      renameSync(temporary, target);
      // Windows may refuse a directory handle; the file fsync remains mandatory.
      try { const directoryFd = openSync(this.directory, "r");
        try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); } }
      catch { /* Unsupported directory fsync on this host. */ }
    } finally {
      if (fd !== null) closeSync(fd);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  read(): DurableProjectSnapshot[] {
    if (!existsSync(this.directory)) return [];
    const names = readdirSync(this.directory).filter(name => name.endsWith(".json"));
    insist(names.length <= 64, "Durable Project checkpoint directory exceeds its limit.");
    return names.map(name => {
      const file = join(this.directory, name);
      insist(statSync(file).isFile(), "Durable Project checkpoint is not a file.");
      const record = JSON.parse(readFileSync(file, "utf8")) as { body?: DurableProjectSnapshot & { schema?: string }; sha256?: string };
      insist(record.body?.schema === SCHEMA && record.sha256 === sha(JSON.stringify(record.body)) &&
        name === `${sha(record.body.id)}.json`, "Durable Project checkpoint is corrupt.");
      const value = validate(record.body);
      return { id: value.id, savedAt: value.savedAt, projectBytes: value.projectBytes,
        libraryBytes: value.libraryBytes, activate: value.activate };
    }).sort((a, b) => a.savedAt - b.savedAt || a.id.localeCompare(b.id));
  }
  clearForTest(): void {
    if (!existsSync(this.directory)) return;
    for (const name of readdirSync(this.directory)) if (name.endsWith(".json")) unlinkSync(join(this.directory, name));
  }
}
