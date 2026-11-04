import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, lstat, mkdir, open, readdir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

const HASH = /^[a-f0-9]{64}$/;
const OWNER = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_BLOB = 256 * 1024 * 1024;
const SCHEMA = "quantum-artifact-pin/v1";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function sharedArtifactRoot(): string {
  const override = process.env.QUANTUM_SHARED_ARTIFACT_HOME;
  if (override && (!isAbsolute(override) || resolve(override) !== override)) throw new Error("Invalid shared artifact root");
  return override ?? join(homedir(), ".quantum-integration-artifacts", "v1");
}

export class SharedArtifactStore {
  constructor(readonly root: string = sharedArtifactRoot()) {
    if (!isAbsolute(root) || resolve(root) !== root) throw new Error("Artifact root must be absolute");
  }
  private object(hash: string) { if (!HASH.test(hash)) throw new Error("Invalid artifact hash");
    return join(this.root, "objects", "sha256", hash.slice(0, 2), hash); }
  private pinPath(owner: string) { if (!OWNER.test(owner)) throw new Error("Invalid artifact pin owner");
    return join(this.root, "pins", `${owner}.json`); }
  private async lock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const path = join(this.root, ".write-lock");
    let held = false;
    for (let i = 0; i < 100; i++) {
      try { await mkdir(path); held = true; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        await new Promise(done => setTimeout(done, 50)); }
    }
    if (!held) throw new Error("Shared artifact store is busy");
    try { return await action(); } finally { await rmdir(path); }
  }
  private async verifyObject(hash: string): Promise<number> {
    const path = this.object(hash), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BLOB) throw new Error("Invalid shared artifact file");
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    if (digest.digest("hex") !== hash) throw new Error("Shared artifact hash collision or corruption");
    return info.size;
  }
  async put(bytes: Uint8Array): Promise<string> {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BLOB) throw new Error("Invalid artifact bytes");
    const hash = sha(bytes);
    await this.lock(async () => {
      const target = this.object(hash);
      await mkdir(resolve(target, ".."), { recursive: true });
      const temp = join(resolve(target, ".."), `.${hash}.${randomUUID()}.tmp`);
      try {
        await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
        try { await link(temp, target); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        await this.verifyObject(hash);
      } finally { await unlink(temp).catch(() => {}); }
    });
    return hash;
  }
  async pin(owner: string, hashes: readonly string[]): Promise<void> {
    if (!OWNER.test(owner) || !Array.isArray(hashes) || !hashes.length || hashes.length > 1024 ||
        hashes.some(hash => !HASH.test(hash))) throw new Error("Invalid artifact pin");
    await this.lock(async () => {
      const unique = [...new Set(hashes)].sort();
      for (const hash of unique) await this.verifyObject(hash);
      const path = this.pinPath(owner), parent = resolve(path, "..");
      await mkdir(parent, { recursive: true });
      const temp = join(parent, `.${owner}.${randomUUID()}.tmp`);
      try { await writeFile(temp, JSON.stringify({ schema: SCHEMA, owner, hashes: unique }) + "\n", { flag: "wx", mode: 0o600 });
        await rename(temp, path); }
      finally { await unlink(temp).catch(() => {}); }
    });
  }
  async unpin(owner: string): Promise<void> {
    await this.lock(async () => { await unlink(this.pinPath(owner)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }); });
  }
  private async referenced(): Promise<Set<string>> {
    const pins = join(this.root, "pins"), marked = new Set<string>();
    await mkdir(pins, { recursive: true });
    for (const entry of await readdir(pins, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) throw new Error("Invalid artifact pin inventory");
      const file = join(pins, entry.name), info = await lstat(file);
      if (info.size > 128 * 1024) throw new Error("Oversized artifact pin");
      const raw: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid artifact pin manifest");
      const row = raw as Record<string, unknown>;
      if (Object.keys(row).sort().join() !== "hashes,owner,schema" || row.schema !== SCHEMA ||
          row.owner !== entry.name.slice(0, -5) || !Array.isArray(row.hashes) ||
          row.hashes.some(hash => typeof hash !== "string" || !HASH.test(hash))) throw new Error("Invalid artifact pin manifest");
      for (const hash of row.hashes as string[]) marked.add(hash);
    }
    return marked;
  }
  async collect(dryRun = true): Promise<{ hashes: string[]; bytes: number; dryRun: boolean }> {
    return this.lock(async () => {
      const marked = await this.referenced(), root = join(this.root, "objects", "sha256");
      await mkdir(root, { recursive: true });
      const candidates: { hash: string; bytes: number }[] = [];
      for (const shard of await readdir(root, { withFileTypes: true })) {
        if (!shard.isDirectory() || !/^[a-f0-9]{2}$/.test(shard.name)) throw new Error("Invalid artifact shard");
        for (const entry of await readdir(join(root, shard.name), { withFileTypes: true })) {
          if (!entry.isFile() || entry.isSymbolicLink() || !HASH.test(entry.name) || !entry.name.startsWith(shard.name))
            throw new Error("Invalid artifact object inventory");
          if (!marked.has(entry.name)) candidates.push({ hash: entry.name,
            bytes: (await lstat(this.object(entry.name))).size });
        }
      }
      if (!dryRun) {
        const quarantine = join(this.root, "quarantine"); await mkdir(quarantine, { recursive: true });
        for (const item of candidates) { await this.verifyObject(item.hash);
          try { await lstat(join(quarantine, item.hash)); throw new Error("Quarantined artifact already exists"); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          await rename(this.object(item.hash), join(quarantine, item.hash)); }
      }
      return { hashes: candidates.map(item => item.hash).sort(),
        bytes: candidates.reduce((sum, item) => sum + item.bytes, 0), dryRun };
    });
  }
  async restore(hash: string): Promise<void> {
    await this.lock(async () => { const source = join(this.root, "quarantine", hash), target = this.object(hash);
      if (!HASH.test(hash) || !resolve(source).startsWith(resolve(this.root) + sep)) throw new Error("Invalid quarantined artifact");
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BLOB || sha(await readFile(source)) !== hash)
        throw new Error("Invalid quarantined artifact bytes");
      await mkdir(resolve(target, ".."), { recursive: true });
      await rename(source, target);
    });
  }
}
