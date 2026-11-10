import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type WorkerArtifactIdentity = {
  packaged: boolean;
  launchOrigin: "packaged-resource" | "override" | "source-script" | "unknown";
  artifactSha256: string | null;
  packageVersion: string | null;
};

const cache = new Map<string, Promise<string>>();

export async function identifyWorkerArtifact(args: {
  backend?: "python-script" | "bundled-exe";
  command?: string;
  packaged: boolean;
  resourcesPath: string;
  packageVersion: string | null;
}): Promise<WorkerArtifactIdentity> {
  if (args.backend !== "bundled-exe" || !args.command) return {
    packaged: args.packaged,
    launchOrigin: args.backend === "python-script" ? "source-script" : "unknown",
    artifactSha256: null,
    packageVersion: args.packageVersion,
  };
  const command = path.resolve(args.command);
  const normalized = process.platform === "win32" ? command.toLowerCase() : command;
  const packagedRoots = [
    path.join(args.resourcesPath, "python-worker"),
    path.join(args.resourcesPath, "app.asar.unpacked", "python-worker"),
  ].map((item) => process.platform === "win32" ? path.resolve(item).toLowerCase() : path.resolve(item));
  const launchOrigin = args.packaged && packagedRoots.some((root) => path.dirname(normalized) === root)
    ? "packaged-resource" : "override";
  let artifactSha256: string | null = null;
  try {
    const stat = await fs.promises.stat(command);
    if (stat.isFile()) {
      const key = `${command}:${stat.size}:${stat.mtimeMs}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = (async () => {
          const hash = createHash("sha256");
          for await (const chunk of fs.createReadStream(command)) hash.update(chunk);
          return hash.digest("hex");
        })();
        cache.set(key, pending);
      }
      artifactSha256 = await pending;
    }
  } catch { /* A missing artifact is reported by worker startup. */ }
  return { packaged: args.packaged, launchOrigin, artifactSha256, packageVersion: args.packageVersion };
}
