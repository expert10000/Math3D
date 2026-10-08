import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const identity = { version: JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version,
  commit: git("rev-parse", "HEAD"), dirty: Boolean(git("status", "--porcelain", "--untracked-files=all", "--", "src", "renderer/src", "packages", "apps/desktop", "scripts", "package.json", "package-lock.json")), builtAt: new Date().toISOString(),
  rendererHash: createHash("sha256").update(readFileSync(path.join(root, "renderer/dist/index.html"))).digest("hex") };
writeFileSync(path.join(root, "dist/build-identity.json"), JSON.stringify(identity, null, 2) + "\n");
console.log(`Built Math3D ${identity.version} from ${identity.commit}${identity.dirty ? " (working changes)" : ""}`);
