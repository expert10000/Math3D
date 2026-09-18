import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const base = process.platform === "win32"
  ? process.env.LOCALAPPDATA || resolve(homedir(), "AppData/Local")
  : resolve(homedir(), ".config");
const signingDir = resolve(base, "Math3D/signing");
const keystore = resolve(signingDir, "mobile-release.jks");
const config = resolve(signingDir, "release.json");

if (existsSync(keystore) || existsSync(config)) {
  throw new Error(`Release signing already exists at ${signingDir}; refusing to replace it`);
}

mkdirSync(signingDir, { recursive: true });
const password = randomBytes(32).toString("base64url");
const alias = "math3d-mobile-upload";
const result = spawnSync("keytool", [
  "-genkeypair", "-keystore", keystore, "-storetype", "JKS",
  "-storepass:env", "MATH3D_RELEASE_KEYPASS",
  "-keypass:env", "MATH3D_RELEASE_KEYPASS",
  "-alias", alias,
  "-dname", "CN=Math3D Mobile Upload, OU=Release, O=Math3D",
  "-keyalg", "RSA", "-keysize", "4096", "-validity", "10000", "-noprompt",
], {
  env: { ...process.env, MATH3D_RELEASE_KEYPASS: password },
  encoding: "utf8",
});
if (result.error) throw result.error;
if (result.status !== 0 || !existsSync(keystore)) {
  throw new Error(`keytool failed: ${result.stderr.trim() || result.stdout.trim()}`);
}

writeFileSync(config, `${JSON.stringify({
  keystorePath: keystore,
  storePassword: password,
  keyAlias: alias,
  keyPassword: password,
}, null, 2)}\n`, { mode: 0o600, flag: "wx" });
console.log(`First release/upload key created at ${keystore}`);
console.log(`Release signing configuration saved outside Git at ${config}`);
console.log("Back up both files securely; future production updates require the same signing identity.");
