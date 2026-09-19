import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAGIC = Buffer.from("M3DBACK1");
const FILES = ["mobile-internal.jks", "internal.json", "mobile-release.jks", "release.json"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const signingDir = process.platform === "win32"
  ? resolve(process.env.LOCALAPPDATA || "", "Math3D/signing")
  : resolve(process.env.HOME || "", ".config/Math3D/signing");

export function encryptBundle(files, passphrase) {
  if (passphrase.length < 16) throw new Error("Backup passphrase must be at least 16 characters.");
  const payload = {
    format: 1,
    createdAt: new Date().toISOString(),
    files: files.map(({ name, bytes }) => ({ name, sha256: sha256(bytes), base64: bytes.toString("base64") })),
  };
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, nonce, cipher.getAuthTag(), encrypted]);
}

export function decryptBundle(archive, passphrase) {
  if (archive.length < 53 || !archive.subarray(0, 8).equals(MAGIC)) throw new Error("Not a Math3D signing backup.");
  const salt = archive.subarray(8, 24);
  const nonce = archive.subarray(24, 36);
  const tag = archive.subarray(36, 52);
  const encrypted = archive.subarray(52);
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  if (payload.format !== 1 || !Array.isArray(payload.files) ||
      payload.files.length !== FILES.length ||
      payload.files.some((entry, index) => entry.name !== FILES[index])) {
    throw new Error("Backup file list is invalid.");
  }
  return payload.files.map((entry) => {
    const bytes = Buffer.from(entry.base64, "base64");
    if (sha256(bytes) !== entry.sha256) throw new Error(`Backup checksum failed for ${entry.name}.`);
    return { name: entry.name, bytes, sha256: entry.sha256 };
  });
}

function readPassphrase(label) {
  return new Promise((resolvePassphrase, reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      reject(new Error("Run this command in an interactive terminal so the passphrase stays off the command line."));
      return;
    }
    let value = "";
    const previousRaw = process.stdin.isRaw;
    process.stdout.write(`${label} (at least 16 ASCII characters; input hidden): `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(Boolean(previousRaw));
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolvePassphrase(value);
    };
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) return finish(new Error("Cancelled."));
        if (byte === 13 || byte === 10) return finish();
        if (byte === 8 || byte === 127) value = value.slice(0, -1);
        else if (byte >= 32 && byte <= 126) value += String.fromCharCode(byte);
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const [action, location] = process.argv.slice(2);
  if (!["backup", "verify", "restore"].includes(action) || !location) {
    throw new Error("Usage: node scripts/mobile-signing-backup.mjs backup|verify|restore <archive> [restore-directory]");
  }
  const archivePath = resolve(location);
  if (action === "backup") {
    if (existsSync(archivePath)) throw new Error("Backup already exists; choose a new name. Existing backups are never replaced.");
    const files = FILES.map((name) => {
      const path = resolve(signingDir, name);
      if (!existsSync(path)) throw new Error(`Signing file missing: ${path}`);
      return { name, bytes: readFileSync(path) };
    });
    const passphrase = await readPassphrase("New backup passphrase");
    const confirmation = await readPassphrase("Repeat backup passphrase");
    if (passphrase !== confirmation) throw new Error("Passphrases did not match; no backup was written.");
    mkdirSync(dirname(archivePath), { recursive: true });
    const archive = encryptBundle(files, passphrase);
    writeFileSync(archivePath, archive, { flag: "wx", mode: 0o600 });
    const recovered = decryptBundle(readFileSync(archivePath), passphrase);
    if (recovered.some((entry, index) => !entry.bytes.equals(files[index].bytes))) {
      throw new Error("Backup read-back did not reproduce every signing file.");
    }
    console.log(`Encrypted backup verified: ${archivePath}`);
    console.log(`Archive SHA-256: ${sha256(archive)}`);
    console.log("Keep the passphrase separately; losing it makes the backup unusable.");
    return;
  }
  const passphrase = await readPassphrase("Backup passphrase");
  const recovered = decryptBundle(readFileSync(archivePath), passphrase);
  if (action === "verify") {
    console.log(`Verified ${recovered.length} signing files in ${basename(archivePath)}.`);
    console.log(`Archive SHA-256: ${sha256(readFileSync(archivePath))}`);
    return;
  }
  const destination = process.argv[4] && resolve(process.argv[4]);
  if (!destination) throw new Error("Restore requires a destination directory.");
  if (recovered.some((entry) => existsSync(resolve(destination, entry.name)))) {
    throw new Error("Restore destination contains signing files; refusing to overwrite them.");
  }
  mkdirSync(destination, { recursive: true });
  for (const entry of recovered) {
    let bytes = entry.bytes;
    if (entry.name.endsWith(".json")) {
      const data = JSON.parse(bytes.toString("utf8"));
      data.keystorePath = resolve(destination, entry.name === "internal.json" ? "mobile-internal.jks" : "mobile-release.jks");
      bytes = Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
    }
    writeFileSync(resolve(destination, entry.name), bytes, { flag: "wx", mode: 0o600 });
  }
  console.log(`Restored ${recovered.length} signing files to ${destination}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
