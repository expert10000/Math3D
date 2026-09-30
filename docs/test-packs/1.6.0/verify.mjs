import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
if (manifest.format !== "math3d.release-test-pack" || manifest.version !== "1.6.0" || !manifest.files?.length)
  throw new Error("Unsupported or empty test-pack manifest");
for (const item of manifest.files) {
  const path = resolve(root, item.path);
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("Manifest path escapes test pack");
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== item.sha256) throw new Error(`Test-pack checksum mismatch: ${item.path}`);
}
console.log(`Verified ${manifest.files.length} test-pack files. This is file integrity, not physical signoff.`);
